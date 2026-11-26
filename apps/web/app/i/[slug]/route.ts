import { NextResponse } from 'next/server'

const COOKIE_INDICACAO = 'laura_ind'

/**
 * Link de indicação: ialaura.../i/<slug-da-empresa>.
 * Guarda quem indicou por 30 dias e leva para a página de vendas.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const destino = new URL('/', req.url)
  const res = NextResponse.redirect(destino)
  if (/^[a-z0-9-]{3,40}$/.test(slug)) {
    res.cookies.set(COOKIE_INDICACAO, slug, { maxAge: 30 * 24 * 3600, httpOnly: true, sameSite: 'lax', secure: true, path: '/' })
  }
  return res
}
