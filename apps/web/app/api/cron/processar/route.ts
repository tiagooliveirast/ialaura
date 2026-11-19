import { processarPendentes } from '@/lib/laura/processar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Reprocessa o que ficou na fila (falha de rede, OpenAI fora do ar etc.). Protegido por CRON_SECRET. */
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET
  if (!segredo || req.headers.get('authorization') !== `Bearer ${segredo}`) {
    return new Response('Não autorizado', { status: 401 })
  }
  const r = await processarPendentes(20)
  return Response.json(r)
}
