import { enviarLembretesVencidos } from '@/lib/laura/lembretes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Rotina da tarde (vercel.json: 20h UTC = 17h na Bahia).
 * Pergunta de novo a quem não confirmou a visita de amanhã.
 */
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET
  if (!segredo || req.headers.get('authorization') !== `Bearer ${segredo}`) {
    return new Response('Não autorizado', { status: 401 })
  }
  try {
    return Response.json({ lembretes: await enviarLembretesVencidos() })
  } catch (e) {
    return Response.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
