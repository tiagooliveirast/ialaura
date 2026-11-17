import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/** Cliente do usuário logado: respeita RLS. Use em páginas e ações do servidor. */
export async function supabaseServidor() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !chave) {
    throw new Error('Faltam NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY no ambiente.')
  }
  const jar = await cookies()
  return createServerClient(url, chave, {
    db: { schema: 'laura' },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (lista) => {
        try {
          for (const { name, value, options } of lista) jar.set(name, value, options)
        } catch {
          // Em Server Component não dá para gravar cookie; o middleware renova a sessão.
        }
      },
    },
  })
}
