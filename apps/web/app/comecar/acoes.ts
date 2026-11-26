'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { novaEmpresa, slugificar } from '@ialaura/shared'
import { comErro } from '@/lib/sessao'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { supabaseServidor } from '@/lib/supabase/server'

export async function criarEmpresa(form: FormData) {
  const lido = novaEmpresa.safeParse({
    nome: form.get('nome'),
    meuNome: form.get('meuNome'),
    telefone: form.get('telefone'),
    cidade: form.get('cidade'),
    uf: form.get('uf'),
  })
  if (!lido.success) {
    redirect(comErro('/comecar', lido.error.issues[0]?.message ?? 'Confira os dados informados.'))
  }
  const d = lido.data

  const slug = slugificar(d.nome)
  if (slug.length < 3) redirect(comErro('/comecar', 'O nome da empresa precisa ter pelo menos 3 letras ou números.'))

  const sb = await supabaseServidor()
  const { data: novaId, error } = await sb.rpc('criar_empresa', {
    p_nome: d.nome,
    p_slug: slug,
    p_telefone: d.telefone,
    p_cidade: d.cidade,
    p_uf: d.uf,
    p_meu_nome: d.meuNome,
  })
  if (error) redirect(comErro('/comecar', error.message))

  // Indique e ganhe: guarda quem indicou (link /i/<slug>). Falhar aqui não impede o cadastro.
  const jar = await cookies()
  const indicou = jar.get('laura_ind')?.value
  if (indicou && typeof novaId === 'string' && indicou !== slug) {
    const admin = supabaseAdmin()
    const { data: quem } = await admin.from('empresas').select('id').eq('slug', indicou).maybeSingle<{ id: string }>()
    if (quem && quem.id !== novaId) {
      await admin.from('empresas').update({ indicado_por: quem.id }).eq('id', novaId).is('indicado_por', null)
    }
    jar.delete('laura_ind')
  }
  redirect('/painel/assinatura?novo=1')
}
