'use server'

import { randomInt } from 'node:crypto'
import { normalizarTelefone } from '@ialaura/shared'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ajustarValor } from '@/lib/cobranca'
import { COOKIE_ACESSO } from '@/lib/equipe'
import { comErro, exigirMembro } from '@/lib/sessao'
import { supabaseAdmin } from '@/lib/supabase/admin'

const VOLTA = '/painel/equipe'

/** Senha provisória fácil de ditar: 3 sílabas + 4 números. */
function senhaProvisoria(): string {
  const silabas = ['ba', 'ce', 'di', 'fo', 'gu', 'la', 'me', 'ni', 'po', 'ru', 'sa', 'te', 'vi', 'zo']
  const s = Array.from({ length: 3 }, () => silabas[randomInt(silabas.length)]).join('')
  return `${s}${randomInt(1000, 10000)}`
}

async function acharUsuarioPorEmail(email: string): Promise<string | null> {
  const admin = supabaseAdmin()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return null
    const achado = data.users.find((u) => u.email?.toLowerCase() === email)
    if (achado) return achado.id
    if (data.users.length < 1000) return null
  }
  return null
}

export async function adicionarPessoa(form: FormData) {
  const { membro } = await exigirMembro()
  if (membro.papel !== 'dono') redirect(comErro(VOLTA, 'Só o dono pode cadastrar pessoas na equipe.'))

  const nome = String(form.get('nome') ?? '').trim().slice(0, 80)
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  const papel = String(form.get('papel') ?? '')
  const telefoneBruto = String(form.get('telefone') ?? '').trim()
  if (nome.length < 2) redirect(comErro(VOLTA, 'Informe o nome da pessoa.'))
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect(comErro(VOLTA, 'E-mail inválido.'))
  if (!['tecnico', 'atendente'].includes(papel)) redirect(comErro(VOLTA, 'Escolha se é técnico ou atendente.'))

  const admin = supabaseAdmin()
  let userId: string | null = null
  let senha: string | null = null

  const criado = await admin.auth.admin.createUser({
    email,
    password: (senha = senhaProvisoria()),
    email_confirm: true,
    // produto = laura: o banco compartilhado não cria usuário nem teste da Helô para essa pessoa.
    user_metadata: { produto: 'laura', full_name: nome },
  })

  if (criado.data.user) {
    userId = criado.data.user.id
  } else if (/already|registered|exists/i.test(criado.error?.message ?? '')) {
    // Já tem conta (por exemplo, na Helô): só liga à empresa e ela entra com a senha que já usa.
    senha = null
    userId = await acharUsuarioPorEmail(email)
  }
  if (!userId) redirect(comErro(VOLTA, `Não foi possível criar o acesso: ${criado.error?.message ?? 'sem detalhe'}`))

  const { error } = await admin.from('membros').insert({
    empresa_id: membro.empresa_id,
    user_id: userId,
    papel,
    nome,
    atende: papel === 'tecnico',
    telefone: telefoneBruto ? normalizarTelefone(telefoneBruto) : null,
  })
  if (error) {
    const msg = /duplicate|unique/i.test(error.message) ? 'Essa pessoa já faz parte da equipe.' : error.message
    redirect(comErro(VOLTA, msg))
  }

  await ajustarValor(membro.empresa_id).catch((e) => console.error('ajustar valor:', e))

  // Mostra a senha uma vez só, na próxima tela. Nada de senha na URL.
  const jar = await cookies()
  jar.set(COOKIE_ACESSO, JSON.stringify({ nome, email, senha }), {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: VOLTA,
    maxAge: 120,
  })
  revalidatePath(VOLTA)
  redirect(VOLTA)
}

export async function alterarPessoa(form: FormData) {
  const { sb, membro } = await exigirMembro()
  if (membro.papel !== 'dono') redirect(comErro(VOLTA, 'Só o dono pode alterar a equipe.'))

  const id = String(form.get('id') ?? '')
  const acao = String(form.get('acao') ?? '')
  const mudanca: Record<string, boolean> = {}
  if (acao === 'atende') mudanca.atende = true
  else if (acao === 'nao_atende') mudanca.atende = false
  else if (acao === 'desativar') mudanca.ativo = false
  else if (acao === 'reativar') mudanca.ativo = true
  else redirect(comErro(VOLTA, 'Ação inválida.'))

  if (id === membro.id && mudanca.ativo === false) redirect(comErro(VOLTA, 'Você não pode desativar o próprio acesso.'))

  // RLS: só o dono da empresa altera membros dela.
  const { error } = await sb.from('membros').update(mudanca).eq('id', id)
  if (error) redirect(comErro(VOLTA, `Não foi possível alterar: ${error.message}`))
  await ajustarValor(membro.empresa_id).catch((e) => console.error('ajustar valor:', e))
  revalidatePath(VOLTA)
  revalidatePath('/painel')
}
