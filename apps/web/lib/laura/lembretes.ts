import type { Periodo } from '@ialaura/shared'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { enviarModelo } from '@/lib/whatsapp'
import { descreverVaga } from './agenda'
import { MODELOS } from './modelos'

type Lembrete = {
  id: string
  empresa_id: string
  atendimento_id: string
  destinatario: 'cliente' | 'tecnico'
  motivo: 'vespera' | 'manutencao_programada' | 'pesquisa'
  tentativas: number
  atendimento: {
    data: string
    periodo: Periodo
    status: string
    cliente: { nome: string; telefone: string; endereco: string | null; bairro: string | null } | null
    tecnico: { nome: string; telefone: string | null } | null
  } | null
}

export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  return 'http://localhost:3000'
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
      'id, empresa_id, atendimento_id, destinatario, motivo, tentativas, atendimento:atendimentos(data, periodo, status, cliente:clientes(nome, telefone, endereco, bairro), tecnico:membros(nome, telefone))',
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
    if (l.motivo !== 'pesquisa' && !['agendado', 'confirmado'].includes(a.status)) {
      await cancelar(`Visita está como ${a.status}.`)
      continue
    }

    const conta = await contaDa(l.empresa_id)
    if (!conta) {
      await cancelar('Empresa sem WhatsApp ativo.')
      continue
    }

    try {
      const quando = `${descreverVaga({ data: a.data, periodo: a.periodo })}`
      if (l.motivo === 'vespera') {
        await enviarModelo(conta.phone_number_id, a.cliente.telefone, MODELOS.lembreteVespera.nome, [
          primeiroNome(a.cliente.nome),
          conta.nome,
          a.periodo === 'manha' ? 'pela manhã' : 'à tarde',
        ])
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
