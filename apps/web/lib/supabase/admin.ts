import { createClient } from '@supabase/supabase-js'

/**
 * Cliente com service_role: ignora RLS. Só pode ser importado em código de servidor
 * (rotas de API, webhooks, cron). Nunca em componente de cliente.
 */
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) {
    throw new Error('Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no ambiente.')
  }
  return createClient(url, chave, {
    db: { schema: 'laura' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
