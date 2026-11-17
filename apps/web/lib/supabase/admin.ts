import { createClient } from '@supabase/supabase-js'

/**
 * Cliente com service_role: ignora RLS. Só pode ser importado em código de servidor
 * (rotas de API, webhooks, cron). Nunca em componente de cliente.
 */
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  // A integração Vercel + Supabase pode entregar a chave de servidor com qualquer um dos dois nomes.
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  if (!url || !chave) {
    throw new Error('Faltam NEXT_PUBLIC_SUPABASE_URL ou a chave de servidor (SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SECRET_KEY) no ambiente.')
  }
  return createClient(url, chave, {
    db: { schema: 'laura' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
