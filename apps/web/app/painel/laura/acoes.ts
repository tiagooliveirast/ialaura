'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { simular, type EmpresaIA, type Turno } from '@/lib/laura/atendente'
import { lerConhecimento, PERGUNTAR_ANTES, TRANSFERIR_QUANDO } from '@/lib/laura/conhecimento'
import { comErro, exigirMembro } from '@/lib/sessao'
import { supabaseAdmin } from '@/lib/supabase/admin'

const VOLTA = '/painel/laura'

function t(form: FormData, campo: string, max = 2000): string {
  return String(form.get(campo) ?? '').trim().slice(0, max)
}

function linhas(form: FormData, campo: string): string[] {
  return t(form, campo, 6000)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 80)
}

function centavos(valor: string): number | null | 'invalido' {
  const limpo = valor.replace(/[R$\s.]/g, '').replace(',', '.')
  if (limpo === '') return null
  const n = Number(limpo)
  if (!Number.isFinite(n) || n < 0 || n > 100000) return 'invalido'
  return Math.round(n * 100)
}

export async function salvarTreinamento(form: FormData) {
  const { sb, membro } = await exigirMembro()
  if (membro.papel !== 'dono') redirect(comErro(VOLTA, 'Só o dono pode mudar o treinamento da Laura.'))

  const valor = centavos(t(form, 'valor_visita', 20))
  if (valor === 'invalido') redirect(comErro(VOLTA, 'Valor da visita inválido. Escreva só o número, por exemplo 90.'))

  const { data: atual } = await sb.from('empresas').select('conhecimento').eq('id', membro.empresa_id).single()
  const antes = lerConhecimento(atual?.conhecimento)

  const faq: Array<{ pergunta: string; resposta: string }> = []
  for (let i = 0; i < 20; i++) {
    const pergunta = t(form, `faq_p_${i}`, 300)
    const resposta = t(form, `faq_r_${i}`, 1000)
    if (pergunta && resposta) faq.push({ pergunta, resposta })
  }
  const marcados = (nome: string, opcoes: readonly (readonly [string, string])[]) =>
    opcoes.map(([k]) => k).filter((k) => form.get(`${nome}_${k}`) === 'on')

  const conhecimento = {
    ...antes,
    nome_assistente: t(form, 'nome_assistente', 40),
    tom: t(form, 'tom', 20),
    emojis: form.get('emojis') === 'on',
    saudacao: t(form, 'saudacao', 500),
    descricao: t(form, 'descricao', 1000),
    diferenciais: t(form, 'diferenciais', 1000),
    anos_mercado: t(form, 'anos_mercado', 40),
    endereco_oficina: t(form, 'endereco_oficina', 300),
    atende_na_oficina: form.get('atende_na_oficina') === 'on',
    site: t(form, 'site', 200),
    instagram: t(form, 'instagram', 100),
    precos: t(form, 'precos', 3000),
    marcas: t(form, 'marcas', 1000),
    nao_atende: t(form, 'nao_atende', 1000),
    visita_descontada: form.get('visita_descontada') === 'on',
    taxa_regiao: t(form, 'taxa_regiao', 1000),
    prazo: t(form, 'prazo', 300),
    urgencia: t(form, 'urgencia', 500),
    perguntar_antes: marcados('perguntar', PERGUNTAR_ANTES),
    pagamento: t(form, 'pagamento', 1000),
    garantia: t(form, 'garantia', 1000),
    horario: t(form, 'horario', 300),
    fora_horario: t(form, 'fora_horario', 500),
    cancelamento: t(form, 'cancelamento', 1000),
    orcamento: t(form, 'orcamento', 1000),
    faq,
    transferir_quando: marcados('transferir', TRANSFERIR_QUANDO),
    transferir_extra: t(form, 'transferir_extra', 1000),
    proibido: t(form, 'proibido', 1000),
    observacoes: t(form, 'observacoes', 3000),
  }

  const { error } = await sb
    .from('empresas')
    .update({ valor_visita_centavos: valor, conhecimento: lerConhecimento(conhecimento) })
    .eq('id', membro.empresa_id)
  if (error) redirect(comErro(VOLTA, `Não foi possível salvar: ${error.message}`))

  const servicos = linhas(form, 'servicos').map((nome) => ({ empresa_id: membro.empresa_id, nome }))
  const areas = linhas(form, 'areas').map((l) => {
    const [bairro, cidade] = l.split(',').map((p) => p.trim())
    return cidade
      ? { empresa_id: membro.empresa_id, bairro: bairro || null, cidade }
      : { empresa_id: membro.empresa_id, bairro: null, cidade: bairro! }
  })
  const r1 = await sb.from('servicos').delete().eq('empresa_id', membro.empresa_id)
  const r2 = servicos.length ? await sb.from('servicos').insert(servicos) : { error: null }
  const r3 = await sb.from('areas_atendimento').delete().eq('empresa_id', membro.empresa_id)
  const r4 = areas.length ? await sb.from('areas_atendimento').insert(areas) : { error: null }
  const falha = r1.error ?? r2.error ?? r3.error ?? r4.error
  if (falha) redirect(comErro(VOLTA, `Salvei o treinamento, mas não os serviços ou bairros: ${falha.message}`))

  revalidatePath(VOLTA)
  redirect(`${VOLTA}?salvo=1`)
}

/** Simulador: a Laura responde com o treinamento atual. Nada é gravado nem enviado ao WhatsApp. */
export async function responderSimulacao(
  turnos: Turno[],
): Promise<{ resposta: string | null; acoes: string[]; humano: boolean; erro?: string }> {
  const { membro } = await exigirMembro()
  if (membro.papel === 'tecnico') return { resposta: null, acoes: [], humano: false, erro: 'Sem permissão.' }

  const limpos = turnos
    .filter((x) => (x.autor === 'cliente' || x.autor === 'laura') && typeof x.texto === 'string' && x.texto.trim())
    .slice(-20)
    .map((x) => ({ autor: x.autor, texto: x.texto.slice(0, 2000) }))
  if (!limpos.length || limpos[limpos.length - 1]!.autor !== 'cliente') {
    return { resposta: null, acoes: [], humano: false, erro: 'Escreva a mensagem do cliente.' }
  }

  const sb = supabaseAdmin()
  const { data: empresa } = await sb
    .from('empresas')
    .select('id, nome, cidade, uf, fuso, valor_visita_centavos, conhecimento')
    .eq('id', membro.empresa_id)
    .single<EmpresaIA>()
  if (!empresa) return { resposta: null, acoes: [], humano: false, erro: 'Empresa não encontrada.' }

  try {
    const r = await simular(sb, empresa, limpos)
    return { resposta: r.resposta, acoes: r.acoes, humano: r.passouParaHumano }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      resposta: null,
      acoes: [],
      humano: false,
      erro: /OPENAI_API_KEY/.test(msg)
        ? 'A chave da OpenAI ainda não foi configurada na Vercel. O simulador funciona assim que ela estiver lá.'
        : `A Laura não conseguiu responder: ${msg}`,
    }
  }
}
