'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { STATUS_DO_TECNICO } from '@ialaura/shared'
import { comErro } from '@/lib/sessao'
import { supabaseServidor } from '@/lib/supabase/server'

export async function informarStatus(form: FormData) {
  const id = String(form.get('id') ?? '')
  const status = String(form.get('status') ?? '')
  if (!id || !(STATUS_DO_TECNICO as readonly string[]).includes(status)) {
    redirect(comErro('/tecnico', 'Não entendi o status. Atualize a página e tente de novo.'))
  }

  const sb = await supabaseServidor()
  // A função do banco confere se o atendimento é mesmo deste técnico.
  const { error } = await sb.rpc('atualizar_status', { p_atendimento: id, p_status: status })
  if (error) redirect(comErro('/tecnico', error.message))
  revalidatePath('/tecnico')
}
