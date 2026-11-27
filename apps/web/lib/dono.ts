import { supabaseAdminHelo } from '@/lib/supabase/admin'

/**
 * Mesma regra de acesso da Helô (src/lib/subscriptions/hooks.ts):
 * active e complimentary liberam; trialing só com teste no prazo; past_due só na tolerância do Pix;
 * admin_override_until no futuro libera qualquer situação. free, canceled e blocked não liberam.
 */
export async function temHelo(userId: string): Promise<boolean> {
  const { data } = await supabaseAdminHelo()
    .from('user_subscriptions')
    .select('access_status, trial_end, pix_past_due_at, admin_override_until')
    .eq('user_id', userId)
    .maybeSingle<{ access_status: string; trial_end: string | null; pix_past_due_at: string | null; admin_override_until: string | null }>()
  if (!data) return false
  const agora = Date.now()
  const noFuturo = (d: string | null) => !!d && new Date(d).getTime() > agora
  if (noFuturo(data.admin_override_until)) return true
  if (data.access_status === 'active' || data.access_status === 'complimentary') return true
  if (data.access_status === 'trialing') return noFuturo(data.trial_end)
  if (data.access_status === 'past_due') return noFuturo(data.pix_past_due_at)
  return false
}

export type DinheiroHelo = {
  recebido: number
  aReceber: number
  despesas: number
  lucro: number
  entradas: number
} // centavos

/** Faturamento do mês pela Helô: entradas pagas, a receber, despesas pagas. */
export async function dinheiroDoMes(userId: string, inicioMes: string): Promise<DinheiroHelo> {
  const { data } = await supabaseAdminHelo()
    .from('financial_transactions')
    .select('type, amount, received_status')
    .eq('user_id', userId)
    .gte('date', inicioMes)
  let recebido = 0
  let aReceber = 0
  let despesas = 0
  let entradas = 0
  for (const t of (data ?? []) as Array<{ type: string; amount: number | string; received_status: string | null }>) {
    const c = Math.round(Number(t.amount) * 100)
    if (!Number.isFinite(c)) continue
    if (t.type === 'IN') {
      if (t.received_status === 'pendente') aReceber += c
      else {
        recebido += c
        entradas++
      }
    } else if (t.type === 'OUT' && t.received_status !== 'pendente') despesas += c
  }
  return { recebido, aReceber, despesas, lucro: recebido - despesas, entradas }
}

const cent = (v: unknown) => {
  const n = Math.round(Number(v) * 100)
  return Number.isFinite(n) ? n : 0
}

export type ResumoHelo = {
  vencidoAReceber: number
  metaLucro: number | null
  retiradaPct: number | null
  orcamentos: { enviados: number; aprovados: number; rejeitados: number; emAberto: number; valorEmAberto: number; valorAprovado: number }
  os: { pendentes: number; andamento: number; concluidasMes: number; concluidasSemPagar: number; valorSemPagar: number }
  clientes: { ativos: number; novosMes: number }
  manutencoes: { vencidas: number; prox7: number; prox30: number }
  planos: { ativos: number; receitaMensal: number }
  avaliacoes: { respondidas: number; media: number | null }
  agendaHoje: number
}

/** Tudo o que a Helô sabe do negócio, só leitura, filtrado pelo usuário do dono. */
export async function resumoHelo(userId: string, inicioMes: string, hoje: string): Promise<ResumoHelo> {
  const sb = supabaseAdminHelo()
  const mais = (dias: number) => {
    const d = new Date(`${hoje}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + dias)
    return d.toISOString().slice(0, 10)
  }
  const [vencidos, perfil, fin, orc, os, cli, cliNovos, man, planos, aval, agenda] = await Promise.all([
    sb.from('financial_transactions').select('amount').eq('user_id', userId).eq('type', 'IN').eq('received_status', 'pendente').lt('due_date', hoje),
    sb.from('pricing_profile').select('monthly_profit_goal').eq('user_id', userId).maybeSingle(),
    sb.from('configuracao_financeira').select('percentual_retirada').eq('user_id', userId).maybeSingle(),
    sb.from('quotes').select('status, total_amount, created_at, updated_at').eq('user_id', userId).gte('created_at', `${inicioMes}T00:00:00Z`),
    sb.from('work_orders').select('status, payment_status, total_amount, created_at').eq('user_id', userId).or(`status.neq.concluido,created_at.gte.${inicioMes}T00:00:00Z`),
    sb.from('customers').select('id', { count: 'exact', head: true }).eq('user_id', userId).neq('is_active', false),
    sb.from('customers').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', `${inicioMes}T00:00:00Z`),
    sb.from('scheduled_maintenance').select('next_date, status').eq('user_id', userId).not('next_date', 'is', null).lte('next_date', mais(30)),
    sb.from('planos_manutencao').select('valor_mensal, data_fim, status').eq('user_id', userId),
    sb.from('os_avaliacoes').select('estrelas').eq('user_id', userId).gte('respondida_em', `${inicioMes}T00:00:00Z`).not('estrelas', 'is', null),
    sb.from('agenda_compromissos').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('data_inicio', `${hoje}T00:00:00`).lt('data_inicio', `${mais(1)}T00:00:00`),
  ])

  const q = (orc.data ?? []) as Array<{ status: string; total_amount: unknown }>
  const abertos = q.filter((x) => x.status === 'enviado')
  const w = (os.data ?? []) as Array<{ status: string; payment_status: string | null; total_amount: unknown }>
  const semPagar = w.filter((x) => x.status === 'concluido' && x.payment_status === 'pendente')
  // scheduled_maintenance.status: scheduled, upcoming, overdue, completed, cancelled.
  const manut = ((man.data ?? []) as Array<{ next_date: string; status: string | null }>).filter(
    (m) => !['completed', 'cancelled'].includes(m.status ?? ''),
  )
  // planos_manutencao.status: ativo, pausado, encerrado. Só ativo é vigente.
  const pl = ((planos.data ?? []) as Array<{ valor_mensal: unknown; data_fim: string | null; status: string | null }>).filter(
    (p) => p.status === 'ativo',
  )
  const estrelas = ((aval.data ?? []) as Array<{ estrelas: number }>).map((a) => a.estrelas)
  const meta = (perfil.data as { monthly_profit_goal?: unknown } | null)?.monthly_profit_goal
  const pct = (fin.data as { percentual_retirada?: unknown } | null)?.percentual_retirada

  return {
    vencidoAReceber: ((vencidos.data ?? []) as Array<{ amount: unknown }>).reduce((t, x) => t + cent(x.amount), 0),
    metaLucro: meta != null && Number(meta) > 0 ? cent(meta) : null,
    // A tabela foi criada fora do repositório da Helô: aceita 30 (por cento) ou 0,3 (fração).
    retiradaPct: pct != null && Number(pct) > 0 ? (Number(pct) <= 1 ? Math.round(Number(pct) * 1000) / 10 : Number(pct)) : null,
    orcamentos: {
      enviados: q.filter((x) => x.status !== 'rascunho').length,
      aprovados: q.filter((x) => x.status === 'aprovado').length,
      rejeitados: q.filter((x) => x.status === 'rejeitado').length,
      emAberto: abertos.length,
      valorEmAberto: abertos.reduce((t, x) => t + cent(x.total_amount), 0),
      valorAprovado: q.filter((x) => x.status === 'aprovado').reduce((t, x) => t + cent(x.total_amount), 0),
    },
    os: {
      pendentes: w.filter((x) => x.status === 'pendente').length,
      andamento: w.filter((x) => x.status === 'em_andamento').length,
      concluidasMes: w.filter((x) => x.status === 'concluido').length,
      concluidasSemPagar: semPagar.length,
      valorSemPagar: semPagar.reduce((t, x) => t + cent(x.total_amount), 0),
    },
    clientes: { ativos: cli.count ?? 0, novosMes: cliNovos.count ?? 0 },
    manutencoes: {
      vencidas: manut.filter((m) => m.next_date < hoje).length,
      prox7: manut.filter((m) => m.next_date >= hoje && m.next_date <= mais(7)).length,
      prox30: manut.filter((m) => m.next_date >= hoje).length,
    },
    planos: { ativos: pl.length, receitaMensal: pl.reduce((t, p) => t + cent(p.valor_mensal), 0) },
    avaliacoes: {
      respondidas: estrelas.length,
      media: estrelas.length ? Math.round((10 * estrelas.reduce((t, e) => t + e, 0)) / estrelas.length) / 10 : null,
    },
    agendaHoje: agenda.count ?? 0,
  }
}
