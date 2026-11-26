import { reais, type Periodo } from '@ialaura/shared'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { enviarModelo } from '@/lib/whatsapp'
import { descreverVaga } from './agenda'
import { MODELOS, textoDoModelo } from './modelos'

type Lembrete = {
  id: string
  empresa_id: string
  atendimento_id: string
  destinatario: 'cliente' | 'tecnico'
  motivo: 'vespera' | 'manutencao_programada' | 'pesquisa' | 'cobrar_confirmacao' | 'retomar_orcamento'
  enviar_em: string
  tentativas: number
  atendimento: {
    data: string
    periodo: Periodo
    status: string
    cliente_id: string
    orcamento_status: string | null
    orcamento_centavos: number | null
    cliente: { nome: string; telefone: string; endereco: string | null; bairro: string | null } | null
    tecnico: { nome: string; telefone: string | null } | null
  } | null
}

export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  return 'http://localhost:3000'
}

/** Horas entre o pedido de confirmação (10h da véspera) e a cobrança (17h). */
const HORAS_ATE_COBRAR = 7

type SupabaseClient = ReturnType<typeof supabaseAdmin>

/**
 * Guarda na conversa do cliente a mensagem automática que ele recebeu.
 * Assim, quando ele responde "Confirmo" ou "Preciso remarcar", a Laura sabe do que se trata.
 */
async function registrarNaConversa(sb: SupabaseClient, empresaId: string, telefone: string, texto: string, waId: string | null) {
  const agora = new Date().toISOString()
  const { data: conversa } = await sb
    .from('conversas')
    .upsert({ empresa_id: empresaId, wa_telefone: telefone, ultima_msg_em: agora }, { onConflict: 'empresa_id,wa_telefone' })
    .select('id')
    .single<{ id: string }>()
  if (!conversa) return
  await sb.from('mensagens').insert({
    empresa_id: empresaId,
    conversa_id: conversa.id,
    direcao: 'saida',
    autor: 'ia',
    wa_message_id: waId,
    tipo: 'modelo',
    conteudo: texto,
  })
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome
}

/** Envia os lembretes vencidos. Rodado pela rotina diária. */
export async function enviarLembretesVencidos(limite = 200): Promise<{ enviados: number; falhas: number; cancelados: number }> {
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from('lembretes')
    .select(
      'id, empresa_id, atendimento_id, destinatario, motivo, enviar_em, tentativas, atendimento:atendimentos(data, periodo, status, cliente_id, orcamento_status, orcamento_centavos, cliente:clientes(nome, telefone, endereco, bairro), tecnico:membros(nome, telefone))',
    )
    .eq('status', 'pendente')
    .lte('enviar_em', new Date().toISOString())
    .order('enviar_em')
    .limit(limite)
  if (error) throw new Error(`Não foi possível ler os lembretes: ${error.message}`)

  const contas = new Map<string, { phone_number_id: string; nome: string; telefone: string | null } | null>()
  async function contaDa(empresaId: string) {
    if (!contas.has(empresaId)) {
      const [{ data: conta }, { data: empresa }] = await Promise.all([
        sb.from('whatsapp_contas').select('phone_number_id, status').eq('empresa_id', empresaId).maybeSingle(),
        sb.from('empresas').select('nome, telefone').eq('id', empresaId).single(),
      ])
      contas.set(
        empresaId,
        conta && conta.status === 'ativa' && empresa
          ? { phone_number_id: conta.phone_number_id, nome: empresa.nome, telefone: empresa.telefone }
          : null,
      )
    }
    return contas.get(empresaId)!
  }

  let enviados = 0
  let falhas = 0
  let cancelados = 0

  for (const l of (data ?? []) as unknown as Lembrete[]) {
    const a = l.atendimento
    const cancelar = async (motivo: string) => {
      await sb.from('lembretes').update({ status: 'cancelado', erro: motivo }).eq('id', l.id)
      cancelados++
    }

    if (!a || !a.cliente) {
      await cancelar('Atendimento ou cliente não existe mais.')
      continue
    }
    if (l.motivo === 'retomar_orcamento') {
      if (!['pensando', 'recusado'].includes(a.orcamento_status ?? '') || a.orcamento_centavos == null) {
        await cancelar('Orçamento já resolvido.')
        continue
      }
      const { count } = await sb
        .from('atendimentos')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', l.empresa_id)
        .eq('cliente_id', a.cliente_id)
        .in('status', ['agendado', 'confirmado', 'a_caminho', 'atrasado', 'em_andamento'])
      if ((count ?? 0) > 0) {
        await cancelar('Cliente já tem outra visita marcada.')
        continue
      }
    } else if (l.motivo !== 'pesquisa' && !['agendado', 'confirmado'].includes(a.status)) {
      await cancelar(`Visita está como ${a.status}.`)
      continue
    }
    if (l.motivo === 'cobrar_confirmacao' && a.status !== 'agendado') {
      await cancelar('Cliente já confirmou.')
      continue
    }
    if (l.motivo === 'cobrar_confirmacao' && Date.now() - new Date(l.enviar_em).getTime() > 3 * 3600 * 1000) {
      // A rotina da tarde não rodou a tempo; perguntar "visita de amanhã" no dia da visita confundiria o cliente.
      await cancelar('Passou da hora de cobrar a confirmação.')
      continue
    }

    const conta = await contaDa(l.empresa_id)
    if (!conta) {
      await cancelar('Empresa sem WhatsApp ativo.')
      continue
    }

    try {
      const quando = `${descreverVaga({ data: a.data, periodo: a.periodo })}`
      const turno = a.periodo === 'manha' ? 'pela manhã' : 'à tarde'
      if (l.motivo === 'vespera' && a.status === 'confirmado') {
        // Já confirmada antes (por exemplo, na hora de marcar): só lembra, sem pedir de novo.
        const p = [primeiroNome(a.cliente.nome), conta.nome, turno]
        const waId = await enviarModelo(conta.phone_number_id, a.cliente.telefone, MODELOS.lembreteVespera.nome, p)
        await registrarNaConversa(sb, l.empresa_id, a.cliente.telefone, textoDoModelo(MODELOS.lembreteVespera.texto, p), waId)
      } else if (l.motivo === 'vespera') {
        const p = [primeiroNome(a.cliente.nome), conta.nome, turno]
        const waId = await enviarModelo(conta.phone_number_id, a.cliente.telefone, MODELOS.confirmarVisita.nome, p)
        await registrarNaConversa(sb, l.empresa_id, a.cliente.telefone, textoDoModelo(MODELOS.confirmarVisita.texto, p), waId)
        // Se não responder até a tarde, a Laura pergunta de novo (uma vez só).
        await sb.from('lembretes').insert({
          empresa_id: l.empresa_id,
          atendimento_id: l.atendimento_id,
          destinatario: 'cliente',
          motivo: 'cobrar_confirmacao',
          enviar_em: new Date(Date.now() + HORAS_ATE_COBRAR * 3600 * 1000).toISOString(),
        })
      } else if (l.motivo === 'cobrar_confirmacao') {
        // Se o cliente escreveu qualquer coisa depois do pedido, a Laura já está conversando com ele: não insiste.
        const pedidoEm = new Date(new Date(l.enviar_em).getTime() - HORAS_ATE_COBRAR * 3600 * 1000).toISOString()
        const { data: conversa } = await sb
          .from('conversas')
          .select('id')
          .eq('empresa_id', l.empresa_id)
          .eq('wa_telefone', a.cliente.telefone)
          .maybeSingle<{ id: string }>()
        const { count } = conversa
          ? await sb
              .from('mensagens')
              .select('id', { count: 'exact', head: true })
              .eq('conversa_id', conversa.id)
              .eq('autor', 'cliente')
              .gte('criado_em', pedidoEm)
          : { count: 0 }
        if ((count ?? 0) > 0) {
          await cancelar('Cliente respondeu; a conversa segue com a Laura.')
          continue
        }
        const p = [primeiroNome(a.cliente.nome), turno]
        const waId = await enviarModelo(conta.phone_number_id, a.cliente.telefone, MODELOS.cobrarConfirmacao.nome, p)
        await registrarNaConversa(sb, l.empresa_id, a.cliente.telefone, textoDoModelo(MODELOS.cobrarConfirmacao.texto, p), waId)
      } else if (l.motivo === 'retomar_orcamento') {
        const p = [primeiroNome(a.cliente.nome), conta.nome, reais(a.orcamento_centavos ?? 0)]
        const waId = await enviarModelo(conta.phone_number_id, a.cliente.telefone, MODELOS.retomarOrcamento.nome, p)
        await registrarNaConversa(sb, l.empresa_id, a.cliente.telefone, textoDoModelo(MODELOS.retomarOrcamento.texto, p), waId)
      } else if (l.motivo === 'manutencao_programada') {
        const para = a.tecnico?.telefone ?? conta.telefone
        if (!para) {
          await cancelar('Nem o técnico nem a empresa têm telefone cadastrado.')
          continue
        }
        await enviarModelo(conta.phone_number_id, para, MODELOS.manutencaoTecnico.nome, [
          a.cliente.nome,
          quando,
          [a.cliente.endereco, a.cliente.bairro].filter(Boolean).join(', ') || 'endereço não informado',
        ])
      } else {
        const { data: pesquisa } = await sb
          .from('pesquisas')
          .select('token, respondido_em')
          .eq('empresa_id', l.empresa_id)
          .eq('atendimento_id', l.atendimento_id)
          .maybeSingle()
        if (!pesquisa || pesquisa.respondido_em) {
          await cancelar('Pesquisa já respondida ou inexistente.')
          continue
        }
        await enviarModelo(conta.phone_number_id, a.cliente.telefone, MODELOS.pesquisa.nome, [
          primeiroNome(a.cliente.nome),
          conta.nome,
          `${siteUrl()}/p/${pesquisa.token}`,
        ])
      }
      await sb.from('lembretes').update({ status: 'enviado', enviado_em: new Date().toISOString(), erro: null }).eq('id', l.id)
      enviados++
    } catch (e) {
      falhas++
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500)
      await sb
        .from('lembretes')
        .update({ tentativas: l.tentativas + 1, erro: msg, status: l.tentativas + 1 >= 3 ? 'falhou' : 'pendente' })
        .eq('id', l.id)
    }
  }

  return { enviados, falhas, cancelados }
}

/** Aviso imediato ao cliente quando o técnico toca "Estou indo". */
export async function avisarTecnicoACaminho(atendimentoId: string): Promise<void> {
  const sb = supabaseAdmin()
  const { data } = await sb
    .from('atendimentos')
    .select('empresa_id, cliente:clientes(nome, telefone), tecnico:membros(nome)')
    .eq('id', atendimentoId)
    .single()
  const a = data as unknown as {
    empresa_id: string
    cliente: { nome: string; telefone: string } | null
    tecnico: { nome: string } | null
  } | null
  if (!a?.cliente) return

  const [{ data: conta }, { data: empresa }] = await Promise.all([
    sb.from('whatsapp_contas').select('phone_number_id, status').eq('empresa_id', a.empresa_id).maybeSingle(),
    sb.from('empresas').select('nome').eq('id', a.empresa_id).single(),
  ])
  if (!conta || conta.status !== 'ativa' || !empresa) return

  await enviarModelo(conta.phone_number_id, a.cliente.telefone, MODELOS.tecnicoACaminho.nome, [
    primeiroNome(a.cliente.nome),
    primeiroNome(a.tecnico?.nome ?? 'responsável'),
    empresa.nome,
  ])
}

/** Cobrança por Pix logo depois do serviço. Chamada pelo app do técnico, depois que o banco conferiu a permissão. */
export async function enviarCobrancaPix(atendimentoId: string): Promise<void> {
  const sb = supabaseAdmin()
  const { data } = await sb
    .from('atendimentos')
    .select('empresa_id, valor_centavos, cliente:clientes(nome, telefone)')
    .eq('id', atendimentoId)
    .single()
  const a = data as unknown as {
    empresa_id: string
    valor_centavos: number | null
    cliente: { nome: string; telefone: string } | null
  } | null
  if (!a?.cliente || !a.valor_centavos) return

  const [{ data: conta }, { data: empresa }] = await Promise.all([
    sb.from('whatsapp_contas').select('phone_number_id, status').eq('empresa_id', a.empresa_id).maybeSingle(),
    sb.from('empresas').select('nome, conhecimento').eq('id', a.empresa_id).single(),
  ])
  if (!conta || conta.status !== 'ativa' || !empresa) return
  const c = (empresa.conhecimento ?? {}) as { pix_chave?: string; pix_nome?: string }
  if (!c.pix_chave) return

  const p = [primeiroNome(a.cliente.nome), empresa.nome, reais(a.valor_centavos), c.pix_chave, c.pix_nome || empresa.nome]
  const waId = await enviarModelo(conta.phone_number_id, a.cliente.telefone, MODELOS.cobrancaPix.nome, p)
  await registrarNaConversa(sb, a.empresa_id, a.cliente.telefone, textoDoModelo(MODELOS.cobrancaPix.texto, p), waId)
}
