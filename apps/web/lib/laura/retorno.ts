import { hojeEm, normalizarTelefone } from '@ialaura/shared'
import { empresaLiberada } from '@/lib/cobranca'
import { temHelo } from '@/lib/dono'
import { supabaseAdmin, supabaseAdminHelo } from '@/lib/supabase/admin'
import { enviarModelo } from '@/lib/whatsapp'
import { MODELOS, textoDoModelo } from './modelos'

const POR_EMPRESA_POR_DIA = 20

function mesesAtras(hoje: string, meses: number): string {
  const d = new Date(`${hoje}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - meses)
  return d.toISOString().slice(0, 10)
}

/**
 * Rotina diária: chama de volta o cliente cujo serviço de manutenção venceu
 * (ex.: limpeza de ar-condicionado a cada 6 meses). Receita recorrente que ninguém cobrava.
 * Idempotente: grava quando avisou e só avisa de novo depois de uma visita nova.
 */
export async function enviarRetornos(): Promise<{ enviados: number; falhas: number }> {
  const sb = supabaseAdmin()
  const { data: servicos } = await sb
    .from('servicos')
    .select('id, nome, retorno_meses, empresa_id, empresa:empresas(nome, fuso)')
    .eq('ativo', true)
    .not('retorno_meses', 'is', null)
  let enviados = 0
  let falhas = 0
  const enviadosPorEmpresa = new Map<string, number>()
  const contas = new Map<string, { phone_number_id: string; status: string } | null>()
  const liberadas = new Map<string, boolean>()

  for (const s of (servicos ?? []) as unknown as Array<{
    id: string
    nome: string
    retorno_meses: number
    empresa_id: string
    empresa: { nome: string; fuso: string }
  }>) {
    if (!contas.has(s.empresa_id)) {
      const { data } = await sb.from('whatsapp_contas').select('phone_number_id, status').eq('empresa_id', s.empresa_id).maybeSingle()
      contas.set(s.empresa_id, data)
      liberadas.set(s.empresa_id, await empresaLiberada(s.empresa_id))
    }
    const conta = contas.get(s.empresa_id)
    if (!conta || conta.status !== 'ativa' || !liberadas.get(s.empresa_id)) continue

    const hoje = hojeEm(s.empresa.fuso)
    const limite = mesesAtras(hoje, s.retorno_meses)
    // Visitas finalizadas deste serviço que já passaram do prazo (janela de 60 dias para não chamar clientes muito antigos).
    const { data: visitas } = await sb
      .from('atendimentos')
      .select('cliente_id, data, cliente:clientes(nome, telefone, retorno_avisado_em)')
      .eq('servico_id', s.id)
      .eq('status', 'finalizado')
      .lte('data', limite)
      .gte('data', mesesAtras(limite, 2))
      .order('data', { ascending: false })
      .limit(200)

    for (const v of (visitas ?? []) as unknown as Array<{
      cliente_id: string
      data: string
      cliente: { nome: string; telefone: string; retorno_avisado_em: string | null } | null
    }>) {
      if ((enviadosPorEmpresa.get(s.empresa_id) ?? 0) >= POR_EMPRESA_POR_DIA) break
      if (!v.cliente || (v.cliente.retorno_avisado_em && v.cliente.retorno_avisado_em.slice(0, 10) >= v.data)) continue
      // Já fez outra visita depois, ou tem visita marcada: não precisa chamar.
      const { count } = await sb
        .from('atendimentos')
        .select('id', { count: 'exact', head: true })
        .eq('cliente_id', v.cliente_id)
        .gt('data', v.data)
        .neq('status', 'cancelado')
      if ((count ?? 0) > 0) continue

      const p = [
        v.cliente.nome.trim().split(/\s+/)[0] ?? v.cliente.nome,
        s.empresa.nome,
        s.retorno_meses === 12 ? '1 ano' : `${s.retorno_meses} meses`,
        s.nome.toLowerCase(),
      ]
      try {
        const waId = await enviarModelo(conta.phone_number_id, v.cliente.telefone, MODELOS.retornoManutencao.nome, p)
        await sb.from('clientes').update({ retorno_avisado_em: new Date().toISOString() }).eq('id', v.cliente_id)
        const agora = new Date().toISOString()
        const { data: conversa } = await sb
          .from('conversas')
          .upsert({ empresa_id: s.empresa_id, wa_telefone: v.cliente.telefone, ultima_msg_em: agora }, { onConflict: 'empresa_id,wa_telefone' })
          .select('id')
          .single<{ id: string }>()
        if (conversa) {
          await sb.from('mensagens').insert({
            empresa_id: s.empresa_id,
            conversa_id: conversa.id,
            direcao: 'saida',
            autor: 'ia',
            wa_message_id: waId,
            tipo: 'modelo',
            conteudo: textoDoModelo(MODELOS.retornoManutencao.texto, p),
          })
        }
        enviados++
        enviadosPorEmpresa.set(s.empresa_id, (enviadosPorEmpresa.get(s.empresa_id) ?? 0) + 1)
      } catch (e) {
        falhas++
        console.error('laura: retorno de manutenção', e instanceof Error ? e.message : e)
      }
    }
  }
  return { enviados, falhas }
}

const UNIDADES: Record<string, [string, string]> = {
  dia: ['dia', 'dias'],
  dias: ['dia', 'dias'],
  day: ['dia', 'dias'],
  days: ['dia', 'dias'],
  semana: ['semana', 'semanas'],
  semanas: ['semana', 'semanas'],
  week: ['semana', 'semanas'],
  weeks: ['semana', 'semanas'],
  mes: ['mês', 'meses'],
  meses: ['mês', 'meses'],
  month: ['mês', 'meses'],
  months: ['mês', 'meses'],
  ano: ['ano', 'anos'],
  anos: ['ano', 'anos'],
  year: ['ano', 'anos'],
  years: ['ano', 'anos'],
}

/**
 * Ponte com a Helô: manutenções programadas na Helô viram aviso da Laura ao cliente, 3 dias antes.
 * Só para quem tem as duas. Só lê a Helô; o controle de "já avisei" fica em laura.helo_avisos.
 * Ligada por PONTE_HELO_AVISOS=1, depois de confirmar que a Helô não manda o mesmo aviso ao cliente.
 */
export async function enviarAvisosDaHelo(): Promise<{ enviados: number; falhas: number }> {
  if (process.env.PONTE_HELO_AVISOS !== '1') return { enviados: 0, falhas: 0 }
  const sb = supabaseAdmin()
  const helo = supabaseAdminHelo()
  const { data: donos } = await sb
    .from('membros')
    .select('user_id, empresa:empresas(id, nome, fuso, whatsapp_contas(phone_number_id, status))')
    .eq('papel', 'dono')
    .eq('ativo', true)
  let enviados = 0
  let falhas = 0
  for (const d of (donos ?? []) as unknown as Array<{
    user_id: string
    empresa: { id: string; nome: string; fuso: string; whatsapp_contas: { phone_number_id: string; status: string } | null }
  }>) {
    const conta = d.empresa?.whatsapp_contas
    if (!conta || conta.status !== 'ativa') continue
    if (!(await empresaLiberada(d.empresa.id)) || !(await temHelo(d.user_id))) continue
    const hoje = hojeEm(d.empresa.fuso)
    const ate = new Date(`${hoje}T12:00:00Z`)
    ate.setUTCDate(ate.getUTCDate() + 3)
    const { data: manut } = await helo
      .from('scheduled_maintenance')
      .select('id, next_date, procedure_name, equipment_name, interval_value, interval_unit, status, customer:customers(name, phone)')
      .eq('user_id', d.user_id)
      .gte('next_date', hoje)
      .lte('next_date', ate.toISOString().slice(0, 10))
      .limit(POR_EMPRESA_POR_DIA)
    for (const m of (manut ?? []) as unknown as Array<{
      id: string
      next_date: string
      procedure_name: string | null
      equipment_name: string | null
      interval_value: number | null
      interval_unit: string | null
      status: string | null
      customer: { name: string; phone: string | null } | null
    }>) {
      // A Helô só trata "scheduled" como manutenção futura válida.
      if (!['scheduled', 'upcoming', 'overdue'].includes(m.status ?? '')) continue
      const telefone = m.customer?.phone ? normalizarTelefone(m.customer.phone) : null
      if (!telefone || !m.customer) continue
      // Reserva o aviso antes de enviar: se já existe, outra execução já cuidou dele.
      const { error: reservado } = await sb
        .from('helo_avisos')
        .insert({ empresa_id: d.empresa.id, helo_manutencao_id: m.id, proxima_data: m.next_date })
      if (reservado) continue
      const un = UNIDADES[(m.interval_unit ?? '').toLowerCase()]
      const quanto = m.interval_value && un ? `${m.interval_value} ${m.interval_value === 1 ? un[0] : un[1]}` : 'um tempo'
      const servico = (m.procedure_name || m.equipment_name || 'manutenção').toLowerCase()
      const p = [m.customer.name.trim().split(/\s+/)[0] ?? m.customer.name, d.empresa.nome, quanto, servico]
      try {
        const waId = await enviarModelo(conta.phone_number_id, telefone, MODELOS.retornoManutencao.nome, p)
        const agora = new Date().toISOString()
        const { data: conversa } = await sb
          .from('conversas')
          .upsert({ empresa_id: d.empresa.id, wa_telefone: telefone, ultima_msg_em: agora }, { onConflict: 'empresa_id,wa_telefone' })
          .select('id')
          .single<{ id: string }>()
        if (conversa) {
          await sb.from('mensagens').insert({
            empresa_id: d.empresa.id,
            conversa_id: conversa.id,
            direcao: 'saida',
            autor: 'ia',
            wa_message_id: waId,
            tipo: 'modelo',
            conteudo: textoDoModelo(MODELOS.retornoManutencao.texto, p),
          })
        }
        enviados++
      } catch (e) {
        falhas++
        // Libera a reserva para tentar de novo amanhã.
        await sb.from('helo_avisos').delete().eq('helo_manutencao_id', m.id).eq('proxima_data', m.next_date)
        console.error('laura: aviso da Helô', e instanceof Error ? e.message : e)
      }
    }
  }
  return { enviados, falhas }
}
