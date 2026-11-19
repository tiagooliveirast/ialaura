/**
 * Qual banco a Laura usa.
 * LAURA_SUPABASE_* aponta para o banco compartilhado com a Helô e tem prioridade.
 * As variáveis NEXT_PUBLIC_SUPABASE_* / SUPABASE_* vêm da integração antiga (banco de teste ialaura-dev).
 */
export function supabaseUrl(): string | undefined {
  return process.env.LAURA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
}

export function supabaseAnonKey(): string | undefined {
  return process.env.LAURA_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
}

export function supabaseServiceKey(): string | undefined {
  return (
    process.env.LAURA_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY
  )
}
