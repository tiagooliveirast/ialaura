import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAnonKey, supabaseUrl } from './config'

/** Cliente do usuário logado: respeita RLS. Use em páginas e ações do servidor. */
export async function supabaseServidor() {
  const url = supabaseUrl()
  const chave = supabaseAnonKey()
  if (!url || !chave) {
    throw new Error('Falta configurar o banco: LAURA_SUPABASE_URL e LAURA_SUPABASE_ANON_KEY.')
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
