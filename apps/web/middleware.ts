import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'

const PROTEGIDAS = ['/painel', '/comecar', '/tecnico', '/admin']

// Renova a sessão a cada navegação e barra quem não está logado nas áreas internas.
export async function middleware(req: NextRequest) {
  const cabecalhos = new Headers(req.headers)
  cabecalhos.set('x-caminho', req.nextUrl.pathname)
  let res = NextResponse.next({ request: { headers: cabecalhos } })
  const url = supabaseUrl()
  const chave = supabaseAnonKey()
  if (!url || !chave) return res

  const sb = createServerClient(url, chave, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (lista) => {
        for (const { name, value } of lista) req.cookies.set(name, value)
        res = NextResponse.next({ request: { headers: cabecalhos } })
        for (const { name, value, options } of lista) res.cookies.set(name, value, options)
      },
    },
  })

  const {
    data: { user },
  } = await sb.auth.getUser()

  const caminho = req.nextUrl.pathname
  if (!user && PROTEGIDAS.some((p) => caminho === p || caminho.startsWith(p + '/'))) {
    const destino = req.nextUrl.clone()
    destino.pathname = '/entrar'
    destino.search = ''
    return NextResponse.redirect(destino)
  }
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)'],
}
