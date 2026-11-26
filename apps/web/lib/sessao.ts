import { redirect } from 'next/navigation'
import type { Papel } from '@ialaura/shared'
import { supabaseServidor } from './supabase/server'

export type Membro = { id: string; papel: Papel; nome: string; empresa_id: string; atende: boolean }
export type Empresa = { id: string; nome: string; slug: string; fuso: string }

/** Garante usuário logado e com empresa. Sem login vai para /entrar; sem empresa, /comecar. */
export async function exigirMembro() {
  const sb = await supabaseServidor()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) redirect('/entrar')

  const { data: membro } = await sb
    .from('membros')
    .select('id, papel, nome, empresa_id, atende')
    .eq('user_id', user.id)
    .eq('ativo', true)
    .limit(1)
    .maybeSingle<Membro>()
  if (!membro) redirect('/comecar')

  const { data: empresa } = await sb
    .from('empresas')
    .select('id, nome, slug, fuso')
    .eq('id', membro.empresa_id)
    .single<Empresa>()
  if (!empresa) redirect('/comecar')

  return { sb, user, membro, empresa }
}

/** Monta "/caminho?erro=mensagem" para devolver o motivo do erro à tela. */
export function comErro(caminho: string, mensagem: string): string {
  return `${caminho}?erro=${encodeURIComponent(mensagem)}`
}
