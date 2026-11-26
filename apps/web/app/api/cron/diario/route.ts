import { processarPendentes } from '@/lib/laura/processar'
import { enviarLembretesVencidos } from '@/lib/laura/lembretes'
import { reconciliarAssinaturas } from '@/lib/cobranca'
import { sugerirLicoes } from '@/lib/laura/licoes'
import { enviarRetornos } from '@/lib/laura/retorno'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Rotina diária (vercel.json: 13h UTC = 10h em Brasília/Bahia).
 * A Vercel manda "Authorization: Bearer CRON_SECRET" quando a variável existe.
 */
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET
  if (!segredo || req.headers.get('authorization') !== `Bearer ${segredo}`) {
    return new Response('Não autorizado', { status: 401 })
  }

  const resultado: Record<string, unknown> = {}
  for (const [nome, tarefa] of [
    ['fila', () => processarPendentes(50)],
    ['lembretes', () => enviarLembretesVencidos()],
    ['assinaturas', () => reconciliarAssinaturas()],
    ['licoes', () => sugerirLicoes(supabaseAdmin())],
    ['retornos', () => enviarRetornos()],
  ] as const) {
    try {
      resultado[nome] = await tarefa()
    } catch (e) {
      resultado[nome] = { erro: e instanceof Error ? e.message : String(e) }
    }
  }
  return Response.json(resultado)
}
