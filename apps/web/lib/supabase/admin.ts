import { createClient } from '@supabase/supabase-js'
import { supabaseServiceKey, supabaseUrl } from './config'

/**
 * Cliente com service_role: ignora RLS. Só pode ser importado em código de servidor
 * (rotas de API, webhooks, cron). Nunca em componente de cliente.
 */
export function supabaseAdmin() {
  const url = supabaseUrl()
  const chave = supabaseServiceKey()
  if (!url || !chave) {
    throw new Error('Falta configurar o banco: LAURA_SUPABASE_URL e LAURA_SUPABASE_SERVICE_ROLE_KEY.')
  }
  return createClient(url, chave, {
    db: { schema: 'laura' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Mesmo acesso, nas tabelas da Helô (esquema public). Só leitura no Painel do Dono. */
export function supabaseAdminHelo() {
  const url = supabaseUrl()
  const chave = supabaseServiceKey()
  if (!url || !chave) throw new Error('Falta configurar o banco.')
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } })
}
