'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { supabaseServidor } from '@/lib/supabase/server'

export async function exigirAdmin() {
  const sb = await supabaseServidor()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) redirect('/entrar')
  const { data: admin } = await sb.rpc('eh_admin')
  if (admin !== true) redirect('/painel')
  return user
}

export async function alternarIsencao(form: FormData) {
  await exigirAdmin()
  const empresaId = String(form.get('empresa') ?? '')
  const isenta = form.get('isenta') === '1'
  await supabaseAdmin().from('assinaturas').update({ isenta }).eq('empresa_id', empresaId)
  revalidatePath('/admin')
}
