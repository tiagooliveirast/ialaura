'use server'

import { revalidatePath } from 'next/cache'
import { lerConhecimento } from '@/lib/laura/conhecimento'
import { exigirMembro } from '@/lib/sessao'

export type Respostas = {
  servicos: string[]
  areas: string[]
  valor_visita: string
  visita_descontada: boolean
  horario: string
  sabado: boolean
  domingo: boolean
  pagamento: string[]
  garantia: string
  marcas: string
  tom: 'proximo' | 'formal' | 'descontraido'
}

const lista = (v: unknown, max: number, tam: number) =>
  (Array.isArray(v) ? v : [])
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim().slice(0, tam))
    .filter(Boolean)
    .slice(0, max)
const txt = (v: unknown, tam: number) => (typeof v === 'string' ? v.trim().slice(0, tam) : '')

/**
 * Salva as respostas da entrevista. Só preenche o que foi respondido:
 * o resto do treinamento continua como estava. Serviços e bairros novos se somam aos existentes.
 */
export async function salvarEntrevista(r: Respostas): Promise<{ ok: boolean; erro?: string }> {
  const { sb, membro } = await exigirMembro()
  if (membro.papel !== 'dono') return { ok: false, erro: 'Só o dono da empresa pode treinar a Laura.' }
  const empresaId = membro.empresa_id

  const valorTexto = txt(r.valor_visita, 20).replace(/[R$\s.]/g, '').replace(',', '.')
  let valor: number | undefined
  if (valorTexto) {
    const n = Number(valorTexto)
    if (!Number.isFinite(n) || n < 0 || n > 100000) return { ok: false, erro: 'Valor da visita inválido. Escreva só o número, por exemplo 90.' }
    valor = Math.round(n * 100)
  }

  const { data: atual } = await sb.from('empresas').select('conhecimento').eq('id', empresaId).single()
  const antes = lerConhecimento(atual?.conhecimento)
  const pagamento = lista(r.pagamento, 10, 60)
  const novo = {
    ...antes,
    ...(txt(r.horario, 300) ? { horario: txt(r.horario, 300) } : {}),
    ...(pagamento.length ? { pagamento: pagamento.join(', ') } : {}),
    ...(txt(r.garantia, 300) ? { garantia: txt(r.garantia, 300) } : {}),
    ...(txt(r.marcas, 500) ? { marcas: txt(r.marcas, 500) } : {}),
    tom: ['proximo', 'formal', 'descontraido'].includes(r.tom) ? r.tom : antes.tom,
    sabado: r.sabado === true,
    domingo: r.domingo === true,
    visita_descontada: r.visita_descontada === true,
  }
  const { error } = await sb
    .from('empresas')
    .update({ conhecimento: lerConhecimento(novo), ...(valor !== undefined ? { valor_visita_centavos: valor } : {}) })
    .eq('id', empresaId)
  if (error) return { ok: false, erro: `Não foi possível salvar: ${error.message}` }

  const [{ data: servExist }, { data: areaExist }] = await Promise.all([
    sb.from('servicos').select('nome').eq('empresa_id', empresaId),
    sb.from('areas_atendimento').select('bairro, cidade').eq('empresa_id', empresaId),
  ])
  const jaServ = new Set((servExist ?? []).map((s) => s.nome.toLowerCase()))
  const servicos = lista(r.servicos, 40, 80)
    .filter((n) => !jaServ.has(n.toLowerCase()))
    .map((nome) => ({ empresa_id: empresaId, nome }))
  const jaArea = new Set((areaExist ?? []).map((a) => [a.bairro, a.cidade].filter(Boolean).join(', ').toLowerCase()))
  const areas = lista(r.areas, 80, 120)
    .filter((l) => !jaArea.has(l.toLowerCase()))
    .map((l) => {
      const [bairro, cidade] = l.split(',').map((p) => p.trim())
      return cidade ? { empresa_id: empresaId, bairro: bairro || null, cidade } : { empresa_id: empresaId, bairro: null, cidade: bairro! }
    })
  const r1 = servicos.length ? await sb.from('servicos').insert(servicos) : { error: null }
  const r2 = areas.length ? await sb.from('areas_atendimento').insert(areas) : { error: null }
  const falha = r1.error ?? r2.error
  if (falha) return { ok: false, erro: `Salvei quase tudo, mas não os serviços ou bairros: ${falha.message}` }

  revalidatePath('/painel/laura')
  revalidatePath('/painel')
  return { ok: true }
}
