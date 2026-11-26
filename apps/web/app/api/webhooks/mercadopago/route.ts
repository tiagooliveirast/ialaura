import { after } from 'next/server'
import { assinaturaMpConfere, preapprovalDoPagamento, sincronizar } from '@/lib/cobranca'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const url = new URL(req.url)
  const corpo = (await req.json().catch(() => ({}))) as { type?: string; action?: string; data?: { id?: string } }
  const dataId = url.searchParams.get('data.id') ?? corpo.data?.id ?? ''
  const tipo = url.searchParams.get('type') ?? corpo.type ?? ''
  if (!dataId) return new Response('ok')

  if (!assinaturaMpConfere(req, dataId)) return new Response('Assinatura inválida', { status: 401 })

  const sb = supabaseAdmin()
  const { error } = await sb.from('webhook_eventos').upsert(
    { provedor: 'mercadopago', evento_id: `${tipo}:${dataId}:${req.headers.get('x-request-id') ?? ''}`, payload: { tipo, dataId, corpo } },
    { onConflict: 'provedor,evento_id', ignoreDuplicates: true },
  )
  if (error) return new Response('Falha ao registrar', { status: 500 })

  after(async () => {
    try {
      const preapproval =
        tipo === 'subscription_authorized_payment' ? await preapprovalDoPagamento(dataId) : tipo === 'subscription_preapproval' ? dataId : null
      if (preapproval) await sincronizar(preapproval)
    } catch (e) {
      console.error('webhook mercadopago:', e instanceof Error ? e.message : e)
    }
  })
  return new Response('ok')
}
