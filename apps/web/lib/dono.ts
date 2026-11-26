import { supabaseAdminHelo } from '@/lib/supabase/admin'

/** Situações da assinatura da Helô que liberam o Painel do Dono. */
const HELO_LIBERA = ['active', 'complimentary', 'trialing']

export async function temHelo(userId: string): Promise<boolean> {
  const { data } = await supabaseAdminHelo()
    .from('user_subscriptions')
    .select('access_status')
    .eq('user_id', userId)
    .maybeSingle<{ access_status: string }>()
  return !!data && HELO_LIBERA.includes(data.access_status)
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
