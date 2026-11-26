'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { comErro, exigirMembro } from '@/lib/sessao'

const ORIGENS = ['correcao', 'simulador', 'manual'] as const

function t(form: FormData, campo: string, max: number): string {
  return String(form.get(campo) ?? '').trim().slice(0, max)
}

/** Volta só para telas do painel, nunca para endereço externo. */
function destino(form: FormData): string {
  const v = String(form.get('volta') ?? '')
  return v.startsWith('/painel/') ? v : '/painel/laura'
}

async function exigirDono(volta: string) {
  const s = await exigirMembro()
  if (s.membro.papel !== 'dono') redirect(comErro(volta, 'Só o dono da empresa pode ensinar a Laura.'))
  return s
}

/** Nova lição: "quando acontecer isto, responda assim". Vale na próxima mensagem que a Laura responder. */
export async function salvarLicao(form: FormData) {
  const volta = destino(form)
  const { sb, user, empresa } = await exigirDono(volta)
  const situacao = t(form, 'situacao', 600)
  const resposta = t(form, 'resposta_ideal', 2000)
  const origemBruta = t(form, 'origem', 20)
  const origem = (ORIGENS as readonly string[]).includes(origemBruta) ? origemBruta : 'manual'
  const conversa = t(form, 'conversa_id', 40) || null
  if (situacao.length < 3) redirect(comErro(volta, 'Explique em poucas palavras quando essa resposta vale.'))
  if (resposta.length < 2) redirect(comErro(volta, 'Escreva como você responderia.'))

  const { error } = await sb.from('licoes').insert({
    empresa_id: empresa.id,
    situacao,
    resposta_ideal: resposta,
    resposta_laura: t(form, 'resposta_laura', 2000) || null,
    conversa_id: conversa,
    origem,
    criado_por: user.id,
  })
  if (error) redirect(comErro(volta, `Não foi possível salvar a lição: ${error.message}`))
  revalidatePath('/painel/laura')
  revalidatePath(volta)
  redirect(`${volta}${volta.includes('?') ? '&' : '?'}licao=1`)
}

/** Aprovar uma sugestão, ligar ou desligar uma lição. */
export async function alternarLicao(form: FormData) {
  const { sb } = await exigirDono('/painel/laura')
  const id = t(form, 'id', 40)
  const ativa = form.get('ativa') === '1'
  const { error } = await sb.from('licoes').update({ ativa }).eq('id', id)
  if (error) redirect(comErro('/painel/laura', `Não foi possível mudar a lição: ${error.message}`))
  revalidatePath('/painel/laura')
}

/** Apagar uma lição ou descartar uma sugestão. Apaga só a lição escolhida (filtro por id). */
export async function apagarLicao(form: FormData) {
  const { sb } = await exigirDono('/painel/laura')
  const id = t(form, 'id', 40)
  if (!id) redirect(comErro('/painel/laura', 'Lição não encontrada. Atualize a página.'))
  const { error } = await sb.from('licoes').delete().eq('id', id)
  if (error) redirect(comErro('/painel/laura', `Não foi possível apagar: ${error.message}`))
  revalidatePath('/painel/laura')
}

/** Usado pelo simulador: guarda a correção sem sair da tela. */
export async function ensinarNoSimulador(dados: {
  situacao: string
  resposta_ideal: string
  resposta_laura: string
}): Promise<{ ok: boolean; erro?: string }> {
  const { sb, user, membro, empresa } = await exigirMembro()
  if (membro.papel !== 'dono') return { ok: false, erro: 'Só o dono da empresa pode ensinar a Laura.' }
  const situacao = String(dados.situacao ?? '').trim().slice(0, 600)
  const resposta = String(dados.resposta_ideal ?? '').trim().slice(0, 2000)
  if (situacao.length < 3 || resposta.length < 2) return { ok: false, erro: 'Escreva como você responderia.' }
  const { error } = await sb.from('licoes').insert({
    empresa_id: empresa.id,
    situacao,
    resposta_ideal: resposta,
    resposta_laura: String(dados.resposta_laura ?? '').slice(0, 2000) || null,
    origem: 'simulador',
    criado_por: user.id,
  })
  if (error) return { ok: false, erro: `Não foi possível salvar: ${error.message}` }
  revalidatePath('/painel/laura')
  return { ok: true }
}
