'use server'

import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase/admin'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function responderPesquisa(token: string, form: FormData) {
  if (!UUID.test(token)) redirect('/')
  const nps = Number(form.get('nps'))
  const tecnico = Number(form.get('tecnico'))
  if (!Number.isInteger(nps) || nps < 0 || nps > 10 || !Number.isInteger(tecnico) || tecnico < 1 || tecnico > 5) {
    redirect(`/p/${token}?erro=${encodeURIComponent('Escolha as duas notas antes de enviar.')}`)
  }

  const respostas = {
    pontual: form.get('pontual') === 'sim' ? true : form.get('pontual') === 'nao' ? false : null,
    resolvido: ['sim', 'parcial', 'nao'].includes(String(form.get('resolvido'))) ? String(form.get('resolvido')) : null,
  }

  const { data, error } = await supabaseAdmin().rpc('responder_pesquisa', {
    p_token: token,
    p_nps: nps,
    p_nota_tecnico: tecnico,
    p_respostas: respostas,
    p_comentario: String(form.get('comentario') ?? '').slice(0, 1000),
  })
  if (error) redirect(`/p/${token}?erro=${encodeURIComponent(error.message)}`)

  const link = (data as Array<{ link_google: string | null }> | null)?.[0]?.link_google
  redirect(`/p/${token}?obrigado=1${link ? '&google=1' : ''}`)
}
