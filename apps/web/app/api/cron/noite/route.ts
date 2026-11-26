import { enviarResumos } from '@/lib/laura/resumo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Rotina da noite (vercel.json: 22h UTC = 19h na Bahia).
 * Resumo do dia no WhatsApp do dono.
 */
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET
  if (!segredo || req.headers.get('authorization') !== `Bearer ${segredo}`) {
    return new Response('Não autorizado', { status: 401 })
  }
  try {
    return Response.json({ resumos: await enviarResumos() })
  } catch (e) {
    return Response.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
