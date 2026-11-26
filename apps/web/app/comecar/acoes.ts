'use server'

import { redirect } from 'next/navigation'
import { novaEmpresa, slugificar } from '@ialaura/shared'
import { comErro } from '@/lib/sessao'
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
  const { error } = await sb.rpc('criar_empresa', {
    p_nome: d.nome,
    p_slug: slug,
    p_telefone: d.telefone,
    p_cidade: d.cidade,
    p_uf: d.uf,
    p_meu_nome: d.meuNome,
  })
  if (error) redirect(comErro('/comecar', error.message))
  redirect('/painel/assinatura?novo=1')
}
