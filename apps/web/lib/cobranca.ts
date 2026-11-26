import { createHmac, timingSafeEqual } from 'node:crypto'
import { mensalidade } from '@ialaura/shared'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Assinatura da IA Laura pelo Mercado Pago (preapproval).
 * O webhook nunca é a única fonte: a rotina diária consulta o status real de cada assinatura.
 * O bloqueio por falta de pagamento só vale com COBRANCA_ATIVA=1 (até lá ninguém é bloqueado).
 */
const API = 'https://api.mercadopago.com'

export function cobrancaAtiva(): boolean {
  return process.env.COBRANCA_ATIVA === '1'
}

function token(): string {
  const t = process.env.MERCADOPAGO_ACCESS_TOKEN
  if (!t) throw new Error('Falta MERCADOPAGO_ACCESS_TOKEN no ambiente.')
  return t
}

async function mp<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const resp = await fetch(`${API}${caminho}`, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  const dados = (await resp.json().catch(() => ({}))) as T & { message?: string }
  if (!resp.ok) throw new Error(`Mercado Pago recusou (${resp.status}): ${dados.message ?? 'sem detalhe'}`)
  return dados
}

type Preapproval = {
  id: string
  status: 'pending' | 'authorized' | 'paused' | 'cancelled'
  init_point?: string
  next_payment_date?: string
  external_reference?: string
  auto_recurring?: { transaction_amount?: number }
}

const STATUS: Record<Preapproval['status'], 'pendente' | 'ativa' | 'inadimplente' | 'cancelada'> = {
  pending: 'pendente',
  authorized: 'ativa',
  paused: 'inadimplente',
  cancelled: 'cancelada',
}

/** Técnicos adicionais = pessoas que vão a campo, menos a primeira (incluída no plano). */
export async function contarTecnicosAdicionais(empresaId: string): Promise<number> {
  const { count } = await supabaseAdmin()
    .from('membros')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .eq('atende', true)
  return Math.max(0, (count ?? 0) - 1)
}

export async function criarAssinatura(empresaId: string, email: string, voltarPara: string): Promise<string> {
  const sb = supabaseAdmin()
  const { data: empresa } = await sb.from('empresas').select('nome').eq('id', empresaId).single()
  const adicionais = await contarTecnicosAdicionais(empresaId)
  const valor = mensalidade(adicionais) / 100

  const p = await mp<Preapproval>('/preapproval', {
    method: 'POST',
    body: JSON.stringify({
      reason: `IA Laura - ${empresa?.nome ?? 'assinatura'}`,
      external_reference: empresaId,
      payer_email: email,
      back_url: voltarPara,
      status: 'pending',
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: valor, currency_id: 'BRL' },
    }),
  })
  await sb
    .from('assinaturas')
    .update({ mp_preapproval_id: p.id, status: 'pendente', tecnicos_adicionais: adicionais, tecnicos_cobrados: adicionais })
    .eq('empresa_id', empresaId)
  if (!p.init_point) throw new Error('Mercado Pago não devolveu o link de pagamento.')
  return p.init_point
}

/** Lê o status real no Mercado Pago e grava. Usada pelo webhook e pela rotina diária. */
export async function sincronizar(preapprovalId: string): Promise<void> {
  const p = await mp<Preapproval>(`/preapproval/${encodeURIComponent(preapprovalId)}`)
  const sb = supabaseAdmin()
  await sb
    .from('assinaturas')
    .update({
      status: STATUS[p.status] ?? 'pendente',
      proxima_cobranca: p.next_payment_date ? p.next_payment_date.slice(0, 10) : null,
      conferido_em: new Date().toISOString(),
    })
    .eq('mp_preapproval_id', p.id)
}

/**
 * Ajusta o valor quando muda o número de técnicos.
 * Entrou técnico: a próxima fatura já sobe. Saiu: continua cobrando até a próxima cobrança passar.
 */
export async function ajustarValor(empresaId: string): Promise<void> {
  const sb = supabaseAdmin()
  const { data: a } = await sb
    .from('assinaturas')
    .select('mp_preapproval_id, tecnicos_cobrados, isenta')
    .eq('empresa_id', empresaId)
    .single()
  const atual = await contarTecnicosAdicionais(empresaId)
  const cobrados = Math.max(a?.tecnicos_cobrados ?? 0, atual)
  await sb.from('assinaturas').update({ tecnicos_adicionais: atual, tecnicos_cobrados: cobrados }).eq('empresa_id', empresaId)
  if (a?.mp_preapproval_id && !a.isenta && cobrados !== a.tecnicos_cobrados && process.env.MERCADOPAGO_ACCESS_TOKEN) {
    await mp(`/preapproval/${encodeURIComponent(a.mp_preapproval_id)}`, {
      method: 'PUT',
      body: JSON.stringify({ auto_recurring: { transaction_amount: mensalidade(cobrados) / 100 } }),
    })
  }
}

/** Rotina diária: confere cada assinatura e baixa os técnicos removidos depois da cobrança. */
export async function reconciliarAssinaturas(): Promise<{ conferidas: number; erros: number }> {
  if (!process.env.MERCADOPAGO_ACCESS_TOKEN) return { conferidas: 0, erros: 0 }
  const sb = supabaseAdmin()
  const { data } = await sb
    .from('assinaturas')
    .select('empresa_id, mp_preapproval_id, tecnicos_adicionais, tecnicos_cobrados, proxima_cobranca')
    .not('mp_preapproval_id', 'is', null)
  let conferidas = 0
  let erros = 0
  const hoje = new Date().toISOString().slice(0, 10)
  for (const a of data ?? []) {
    try {
      // Cobrança já passou com técnico a menos: a partir de agora cobra o número atual.
      if (a.tecnicos_cobrados > a.tecnicos_adicionais && a.proxima_cobranca && a.proxima_cobranca <= hoje) {
        await mp(`/preapproval/${encodeURIComponent(a.mp_preapproval_id!)}`, {
          method: 'PUT',
          body: JSON.stringify({ auto_recurring: { transaction_amount: mensalidade(a.tecnicos_adicionais) / 100 } }),
        })
        await sb.from('assinaturas').update({ tecnicos_cobrados: a.tecnicos_adicionais }).eq('empresa_id', a.empresa_id)
      }
      await sincronizar(a.mp_preapproval_id!)
      conferidas++
    } catch {
      erros++
    }
  }
  return { conferidas, erros }
}

/** Confere a assinatura x-signature do webhook do Mercado Pago. */
export function assinaturaMpConfere(req: Request, dataId: string): boolean {
  const segredo = process.env.MERCADOPAGO_WEBHOOK_SECRET
  const cabecalho = req.headers.get('x-signature')
  const requestId = req.headers.get('x-request-id')
  if (!segredo || !cabecalho || !requestId) return false
  const partes = Object.fromEntries(cabecalho.split(',').map((p) => p.trim().split('=') as [string, string]))
  if (!partes.ts || !partes.v1) return false
  const manifesto = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${partes.ts};`
  const esperado = Buffer.from(createHmac('sha256', segredo).update(manifesto).digest('hex'))
  const recebido = Buffer.from(partes.v1)
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido)
}

/** Busca o preapproval a partir de um pagamento autorizado (evento subscription_authorized_payment). */
export async function preapprovalDoPagamento(pagamentoId: string): Promise<string | null> {
  const r = await mp<{ preapproval_id?: string }>(`/authorized_payments/${encodeURIComponent(pagamentoId)}`)
  return r.preapproval_id ?? null
}

/** A empresa pode usar a Laura? Isenta ou ativa; com cobrança desligada, sempre pode. */
export async function empresaLiberada(empresaId: string): Promise<boolean> {
  if (!cobrancaAtiva()) return true
  const { data } = await supabaseAdmin().from('assinaturas').select('status, isenta').eq('empresa_id', empresaId).maybeSingle()
  return !!data && (data.isenta || data.status === 'ativa')
}
