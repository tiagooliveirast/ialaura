'use server'

import { redirect } from 'next/navigation'
import { comErro } from '@/lib/sessao'
import { supabaseServidor } from '@/lib/supabase/server'

function traduzir(mensagem: string): string {
  if (/invalid login credentials/i.test(mensagem)) return 'E-mail ou senha incorretos.'
  if (/already registered/i.test(mensagem)) return 'Esse e-mail já tem conta. Entre com a sua senha.'
  if (/email not confirmed/i.test(mensagem)) return 'Confirme o seu e-mail pelo link que enviamos antes de entrar.'
  if (/password should be at least/i.test(mensagem)) return 'A senha precisa ter pelo menos 8 caracteres.'
  if (/rate limit/i.test(mensagem)) return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.'
  return `Não foi possível concluir: ${mensagem}`
}

/** Endereço público do site. O banco é compartilhado com a Helô, então o link do e-mail precisa dizer para onde voltar. */
function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  return 'http://localhost:3000'
}

function credenciais(form: FormData) {
  return {
    email: String(form.get('email') ?? '').trim().toLowerCase(),
    password: String(form.get('senha') ?? ''),
  }
}

export async function entrar(form: FormData) {
  const { email, password } = credenciais(form)
  if (!email || !password) redirect(comErro('/entrar', 'Preencha e-mail e senha.'))

  const sb = await supabaseServidor()
  const { error } = await sb.auth.signInWithPassword({ email, password })
  if (error) redirect(comErro('/entrar', traduzir(error.message)))
  redirect('/painel')
}

export async function criarConta(form: FormData) {
  const { email, password } = credenciais(form)
  if (!email || !password) redirect(comErro('/entrar', 'Preencha e-mail e senha.'))
  if (password.length < 8) redirect(comErro('/entrar', 'A senha precisa ter pelo menos 8 caracteres.'))

  const sb = await supabaseServidor()
  // produto = 'laura' faz o banco (compartilhado com a Helô) não criar usuário nem teste da Helô.
  const { data, error } = await sb.auth.signUp({ email, password, options: { data: { produto: 'laura' }, emailRedirectTo: `${siteUrl()}/entrar` },
  })
  if (error) redirect(comErro('/entrar', traduzir(error.message)))
  // Com confirmação de e-mail ligada no Supabase, a sessão só existe depois do clique no link.
  if (!data.session) redirect('/entrar?aviso=confirme')
  redirect('/comecar')
}

/** Entrar ou criar conta com o Google. Na volta, /auth/callback troca o código pela sessão. */
export async function entrarComGoogle() {
  const sb = await supabaseServidor()
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${siteUrl()}/auth/callback`, queryParams: { prompt: 'select_account' } },
  })
  if (error || !data.url) redirect(comErro('/entrar', `Não foi possível abrir o Google: ${error?.message ?? 'sem resposta'}`))
  redirect(data.url)
}

export async function sair() {
  const sb = await supabaseServidor()
  await sb.auth.signOut()
  redirect('/entrar')
}
