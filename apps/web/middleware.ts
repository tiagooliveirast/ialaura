import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTEGIDAS = ['/painel', '/comecar', '/tecnico']

// Renova a sessão a cada navegação e barra quem não está logado nas áreas internas.
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !chave) return res

  const sb = createServerClient(url, chave, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (lista) => {
        for (const { name, value } of lista) req.cookies.set(name, value)
        res = NextResponse.next({ request: req })
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
