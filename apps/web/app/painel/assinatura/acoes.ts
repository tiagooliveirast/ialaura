'use server'

import { redirect } from 'next/navigation'
import { criarAssinatura } from '@/lib/cobranca'
import { siteUrl } from '@/lib/laura/lembretes'
import { comErro, exigirMembro } from '@/lib/sessao'

export async function assinar() {
  const { user, membro } = await exigirMembro()
  if (membro.papel !== 'dono') redirect(comErro('/painel/assinatura', 'Só o dono pode assinar.'))
  if (!user.email) redirect(comErro('/painel/assinatura', 'Sua conta não tem e-mail cadastrado.'))

  let link: string
  try {
    link = await criarAssinatura(membro.empresa_id, user.email, `${siteUrl()}/painel/assinatura?voltou=1`)
  } catch (e) {
    redirect(comErro('/painel/assinatura', e instanceof Error ? e.message : 'Não foi possível abrir o pagamento.'))
  }
  redirect(link)
}
