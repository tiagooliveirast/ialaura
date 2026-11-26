'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { STATUS_DO_TECNICO } from '@ialaura/shared'
import { avisarTecnicoACaminho } from '@/lib/laura/lembretes'
import { comErro } from '@/lib/sessao'
import { supabaseServidor } from '@/lib/supabase/server'

function numero(v: FormDataEntryValue | null): number | null {
  const n = Number(v)
  return v === null || v === '' || !Number.isFinite(n) ? null : n
}

export async function informarStatus(form: FormData) {
  const id = String(form.get('id') ?? '')
  const status = String(form.get('status') ?? '')
  if (!id || !(STATUS_DO_TECNICO as readonly string[]).includes(status)) {
    redirect(comErro('/tecnico', 'Não entendi o status. Atualize a página e tente de novo.'))
  }

  const sb = await supabaseServidor()
  // A função do banco confere se o atendimento é mesmo deste técnico.
  const { error } = await sb.rpc('atualizar_status', {
    p_atendimento: id,
    p_status: status,
    p_lat: numero(form.get('lat')),
    p_lng: numero(form.get('lng')),
    p_precisao: numero(form.get('precisao')),
  })
  if (error) redirect(comErro('/tecnico', error.message))

  if (status === 'a_caminho') {
    after(() => avisarTecnicoACaminho(id).catch((e) => console.error('aviso a caminho:', e instanceof Error ? e.message : e)))
  }
  revalidatePath('/tecnico')
}
