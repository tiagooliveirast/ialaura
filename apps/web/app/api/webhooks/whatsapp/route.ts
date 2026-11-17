import { createHmac, timingSafeEqual } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// A Meta chama este GET uma vez, quando você cadastra o webhook.
export function GET(req: Request) {
  const p = new URL(req.url).searchParams
  const ok =
    p.get('hub.mode') === 'subscribe' &&
    !!process.env.WHATSAPP_VERIFY_TOKEN &&
    p.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN
  return ok ? new Response(p.get('hub.challenge') ?? '') : new Response('Token inválido', { status: 403 })
}

function assinaturaConfere(corpo: string, cabecalho: string | null): boolean {
  const segredo = process.env.WHATSAPP_APP_SECRET
  if (!segredo || !cabecalho) return false
  const esperado = Buffer.from('sha256=' + createHmac('sha256', segredo).update(corpo).digest('hex'))
  const recebido = Buffer.from(cabecalho)
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido)
}

type Mudanca = {
  value?: {
    metadata?: { phone_number_id?: string }
    messages?: Array<{ id: string } & Record<string, unknown>>
    contacts?: unknown[]
  }
}

// Só confere, guarda na fila e responde. Quem fala com a IA é o worker.
export async function POST(req: Request) {
  const corpo = await req.text()
  if (!assinaturaConfere(corpo, req.headers.get('x-hub-signature-256'))) {
    return new Response('Assinatura inválida', { status: 401 })
  }

  let dados: { entry?: Array<{ changes?: Mudanca[] }> }
  try {
    dados = JSON.parse(corpo)
  } catch {
    return new Response('JSON inválido', { status: 400 })
  }

  const linhas = (dados.entry ?? [])
    .flatMap((e) => e.changes ?? [])
    .flatMap((m) =>
      (m.value?.messages ?? []).map((msg) => ({
        provedor: 'whatsapp',
        evento_id: msg.id,
        payload: {
          phone_number_id: m.value?.metadata?.phone_number_id ?? null,
          contatos: m.value?.contacts ?? [],
          mensagem: msg,
        },
      })),
    )

  if (linhas.length > 0) {
    // Mensagem repetida pela Meta bate no unique (provedor, evento_id) e é ignorada.
    const { error } = await supabaseAdmin()
      .from('webhook_eventos')
      .upsert(linhas, { onConflict: 'provedor,evento_id', ignoreDuplicates: true })
    if (error) {
      console.error('webhook whatsapp: falha ao gravar na fila', error.message)
      // 500 faz a Meta reenviar depois; melhor que perder a mensagem.
      return new Response('Falha ao registrar', { status: 500 })
    }
  }

  return new Response('ok')
}
