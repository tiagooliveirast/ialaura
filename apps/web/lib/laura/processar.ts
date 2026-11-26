import { supabaseAdmin } from '@/lib/supabase/admin'
import { enviarTexto } from '@/lib/whatsapp'
import { empresaLiberada } from '@/lib/cobranca'
import { atender } from './atendente'
import { transcreverAudio } from './audio'

type Evento = {
  id: number
  evento_id: string
  payload: {
    phone_number_id: string | null
    contatos?: Array<{ wa_id?: string; profile?: { name?: string } }>
    mensagem: {
      id: string
      from: string
      type: string
      timestamp?: string
      text?: { body?: string }
      button?: { text?: string }
      interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }
      audio?: { id?: string; mime_type?: string; voice?: boolean }
    }
  }
}

const SEM_TEXTO =
  'Não consegui abrir o que você mandou. Pode me escrever em poucas palavras, por favor?'

const AUDIO_FALHOU = 'Não consegui ouvir seu áudio direito. Pode me mandar de novo ou escrever em poucas palavras?'

function textoDa(m: Evento['payload']['mensagem']): string | null {
  return (
    m.text?.body ??
    m.button?.text ??
    m.interactive?.button_reply?.title ??
    m.interactive?.list_reply?.title ??
    null
  )
}

/** Processa um lote da fila. Pode ser chamado em paralelo: cada evento é reservado por um só. */
export async function processarPendentes(limite = 10): Promise<{ processados: number; erros: number }> {
  const sb = supabaseAdmin()
  const { data: eventos, error } = await sb.rpc('reivindicar_eventos', { p_limite: limite })
  if (error) throw new Error(`Não foi possível ler a fila: ${error.message}`)

  let processados = 0
  let erros = 0
  for (const ev of (eventos ?? []) as Evento[]) {
    try {
      await processarEvento(ev)
      await sb.from('webhook_eventos').update({ processado_em: new Date().toISOString(), erro: null }).eq('id', ev.id)
      processados++
    } catch (e) {
      erros++
      const msg = e instanceof Error ? e.message : String(e)
      console.error('laura: falha ao processar evento', ev.id, msg)
      await sb.from('webhook_eventos').update({ erro: msg.slice(0, 500) }).eq('id', ev.id)
    }
  }
  return { processados, erros }
}

async function processarEvento(ev: Evento) {
  const sb = supabaseAdmin()
  const { phone_number_id, mensagem, contatos } = ev.payload
  if (!phone_number_id || !mensagem?.from) return

  const { data: conta } = await sb
    .from('whatsapp_contas')
    .select('empresa_id, status')
    .eq('phone_number_id', phone_number_id)
    .maybeSingle<{ empresa_id: string; status: string }>()
  if (!conta) throw new Error(`Número ${phone_number_id} não está ligado a nenhuma empresa.`)

  await sb.from('webhook_eventos').update({ empresa_id: conta.empresa_id }).eq('id', ev.id)
  if (conta.status !== 'ativa') return
  if (!(await empresaLiberada(conta.empresa_id))) return

  const { data: empresa } = await sb
    .from('empresas')
    .select('id, nome, cidade, uf, fuso, valor_visita_centavos, conhecimento')
    .eq('id', conta.empresa_id)
    .single()
  if (!empresa) throw new Error('Empresa não encontrada.')

  const agora = new Date().toISOString()
  const { data: conversa, error: erroConversa } = await sb
    .from('conversas')
    .upsert(
      { empresa_id: empresa.id, wa_telefone: mensagem.from, ultima_msg_em: agora },
      { onConflict: 'empresa_id,wa_telefone' },
    )
    .select('id, estado, wa_telefone')
    .single<{ id: string; estado: string; wa_telefone: string }>()
  if (erroConversa || !conversa) throw new Error(`Não foi possível abrir a conversa: ${erroConversa?.message}`)

  // Conversa encerrada volta para a Laura quando o cliente escreve de novo.
  if (conversa.estado === 'encerrada') {
    await sb.from('conversas').update({ estado: 'ia' }).eq('id', conversa.id)
    conversa.estado = 'ia'
  }

  let texto = textoDa(mensagem)
  let audioFalhou = false
  if (!texto && mensagem.type === 'audio' && mensagem.audio?.id) {
    // A Meta reentrega eventos: só transcreve se a mensagem ainda não foi gravada.
    const { count } = await sb.from('mensagens').select('id', { count: 'exact', head: true }).eq('wa_message_id', mensagem.id)
    if ((count ?? 0) > 0) return
    try {
      const t = await transcreverAudio(mensagem.audio.id)
      await sb.from('uso_ia').insert({
        empresa_id: empresa.id,
        conversa_id: conversa.id,
        modelo: t.modelo,
        tokens_entrada: t.tokensEntrada,
        tokens_saida: t.tokensSaida,
        custo_micro_usd: t.custoMicroUsd,
      })
      texto = t.texto || null
    } catch (e) {
      console.error('laura: falha ao transcrever áudio', e instanceof Error ? e.message : e)
    }
    audioFalhou = !texto
  }
  const { data: gravada } = await sb
    .from('mensagens')
    .upsert(
      {
        empresa_id: empresa.id,
        conversa_id: conversa.id,
        direcao: 'entrada',
        autor: 'cliente',
        wa_message_id: mensagem.id,
        tipo: mensagem.type,
        conteudo: texto,
        payload: { ...mensagem, nome_perfil: contatos?.[0]?.profile?.name ?? null },
      },
      { onConflict: 'wa_message_id', ignoreDuplicates: true },
    )
    .select('id')
  // Já existia: é reentrega da Meta. Não responde duas vezes.
  if (!gravada || gravada.length === 0) return

  if (conversa.estado !== 'ia') return

  let resposta: string | null
  if (!texto) {
    resposta = audioFalhou ? AUDIO_FALHOU : SEM_TEXTO
  } else {
    const r = await atender(sb, empresa, conversa)
    resposta = r.resposta
  }
  if (!resposta) return

  const waId = await enviarTexto(phone_number_id, mensagem.from, resposta)
  await sb.from('mensagens').insert({
    empresa_id: empresa.id,
    conversa_id: conversa.id,
    direcao: 'saida',
    autor: 'ia',
    wa_message_id: waId,
    tipo: 'text',
    conteudo: resposta,
  })
  await sb.from('conversas').update({ ultima_msg_em: new Date().toISOString() }).eq('id', conversa.id)
}
