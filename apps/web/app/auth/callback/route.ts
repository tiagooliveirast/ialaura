import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { supabaseServidor } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Volta do Google (e de links de e-mail no fluxo com código).
 * Troca o código pela sessão; conta nova criada agora pela Laura ganha a marca produto = 'laura'.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const erroGoogle = url.searchParams.get('error_description')
  const destino = (caminho: string) => NextResponse.redirect(new URL(caminho, url.origin))

  if (erroGoogle) return destino(`/entrar?erro=${encodeURIComponent(`O Google recusou o acesso: ${erroGoogle}`)}`)
  if (!code) return destino('/entrar')

  const sb = await supabaseServidor()
  const { data, error } = await sb.auth.exchangeCodeForSession(code)
  if (error || !data.user) {
    return destino(`/entrar?erro=${encodeURIComponent('Não foi possível entrar com o Google. Tente de novo.')}`)
  }

  const u = data.user
  const criadaAgora = Date.now() - new Date(u.created_at).getTime() < 10 * 60 * 1000
  if (criadaAgora && !u.user_metadata?.produto) {
    await supabaseAdmin()
      .auth.admin.updateUserById(u.id, { user_metadata: { ...u.user_metadata, produto: 'laura' } })
      .catch(() => undefined)
  }

  return destino('/painel')
}
