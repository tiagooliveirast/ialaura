import type { supabaseAdmin } from '@/lib/supabase/admin'
import { custoMicroUsd, perguntar } from './ia'

type SupabaseClient = ReturnType<typeof supabaseAdmin>

export type Licao = { situacao: string; resposta_ideal: string }

/**
 * Como agir em situações delicadas. Vale para todas as empresas, antes de qualquer regra de agenda.
 * Escrito a partir de como um bom atendente de assistência técnica conversa de verdade.
 */
export const SITUACOES_HUMANAS = [
  'SITUAÇÕES HUMANAS (valem mais que qualquer objetivo de marcar visita)',
  '- Leia o que a pessoa está sentindo antes de responder. Se ela contar algo difícil, a primeira frase é sempre de acolhimento, nunca de agenda.',
  '- Luto (faleceu alguém, velório, enterro): "Meus sentimentos. Sinto muito pela sua perda." Não ofereça outra data na mesma mensagem. Diga que não precisa se preocupar com a visita agora e que pode chamar quando se sentir à vontade. Se havia visita marcada, desmarque com remarcar_depois = true.',
  '- Doença, hospital, cirurgia, bebê nascendo: deseje melhoras ou parabéns de forma simples e ofereça remarcar sem pressa.',
  '- Cliente irritado ou reclamando (atraso, serviço que voltou a dar defeito, cobrança): não discuta e não se justifique. Peça desculpas pelo transtorno, mostre que entendeu o problema com as palavras dele e passe para a equipe. Retorno de garantia sempre vai para a equipe.',
  '- Aperto financeiro ("tá difícil", "não tenho como pagar agora"): sem julgamento. Informe as formas de pagamento cadastradas; não prometa desconto nem parcelamento que não estejam nas informações.',
  '- Pessoa idosa ou com dificuldade de escrever: frases ainda mais curtas, uma informação por mensagem, confirme cada dado repetindo de volta. Se ela preferir, ofereça que alguém ligue (passe para a equipe).',
  '- Risco: cheiro de gás, cheiro de queimado, faísca, fumaça, choque ou água perto da tomada. Primeiro a segurança: peça para desligar o aparelho da tomada (e fechar o registro do gás, se for gás) e manter distância. Depois passe para a equipe com urgência. Não marque visita comum como se fosse normal.',
  '- Aparelho com comida ou remédio dentro (geladeira, freezer): mostre que entende a pressa e ofereça a vaga mais próxima; se não houver, passe para a equipe.',
  '- Cliente agradecendo, elogiando ou contando algo da vida: responda como gente, com uma frase calorosa e curta, sem empurrar venda.',
  '- Áudio, foto ou figurinha que você não consegue ver: diga com naturalidade que não conseguiu abrir e peça para escrever em poucas palavras.',
  '- Nunca diga que é uma inteligência artificial a não ser que perguntem diretamente. Se perguntarem, diga a verdade: é a assistente virtual da empresa e pode chamar uma pessoa a qualquer momento.',
].join('\n')

/** Lições ligadas da empresa, as mais novas primeiro. O limite segura o tamanho das instruções. */
export async function licoesAtivas(sb: SupabaseClient, empresaId: string, limite = 25): Promise<Licao[]> {
  const { data } = await sb
    .from('licoes')
    .select('situacao, resposta_ideal')
    .eq('empresa_id', empresaId)
    .eq('ativa', true)
    .order('criado_em', { ascending: false })
    .limit(limite)
  return (data ?? []) as Licao[]
}

const PEDIDO_SUGESTAO = [
  'Você ajuda a treinar a atendente virtual de uma assistência técnica.',
  'Abaixo está uma conversa de WhatsApp em que uma pessoa da equipe precisou assumir o atendimento.',
  'Descubra o que a equipe fez de diferente da atendente virtual e transforme em lições curtas,',
  'para que da próxima vez a atendente responda como a equipe respondeu.',
  'Regras: no máximo 2 lições; só lições que valham para outros clientes;',
  'não copie nome, telefone, endereço nem valores que pareçam combinados só com este cliente;',
  'escreva em português do Brasil.',
  'Responda em JSON: {"licoes":[{"situacao":"quando o cliente ...","resposta_ideal":"..."}]}.',
  'Se não houver nada útil para aprender, responda {"licoes":[]}.',
].join(' ')

type Mensagem = { autor: string; conteudo: string | null; criado_em: string }

/**
 * Rotina diária: lê conversas em que a equipe respondeu depois da Laura e sugere lições.
 * As sugestões nascem desligadas; só valem depois que o dono aprova em Treinar a Laura.
 * Idempotente: cada conversa guarda até onde já foi lida.
 */
export async function sugerirLicoes(sb: SupabaseClient, limiteConversas = 30): Promise<{ lidas: number; sugeridas: number }> {
  if (!process.env.OPENAI_API_KEY) return { lidas: 0, sugeridas: 0 }
  const desde = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()

  const { data: candidatas } = await sb
    .from('mensagens')
    .select('conversa_id, empresa_id, criado_em')
    .eq('autor', 'humano')
    .gte('criado_em', desde)
    .order('criado_em', { ascending: false })
    .limit(500)

  const porConversa = new Map<string, { empresa_id: string; ultima: string }>()
  for (const m of candidatas ?? []) {
    if (!porConversa.has(m.conversa_id)) porConversa.set(m.conversa_id, { empresa_id: m.empresa_id, ultima: m.criado_em })
  }

  let lidas = 0
  let sugeridas = 0
  for (const [conversaId, info] of [...porConversa].slice(0, limiteConversas)) {
    const { data: conversa } = await sb
      .from('conversas')
      .select('licoes_lidas_ate')
      .eq('id', conversaId)
      .maybeSingle<{ licoes_lidas_ate: string | null }>()
    if (conversa?.licoes_lidas_ate && conversa.licoes_lidas_ate >= info.ultima) continue

    const { data: msgs } = await sb
      .from('mensagens')
      .select('autor, conteudo, criado_em')
      .eq('conversa_id', conversaId)
      .order('criado_em', { ascending: false })
      .limit(40)
    const historico = ((msgs ?? []) as Mensagem[]).reverse().filter((m) => m.conteudo)
    // Só aprende quando a Laura falou antes da equipe: é aí que existe algo a corrigir.
    const primeiraEquipe = historico.findIndex((m) => m.autor === 'humano')
    const lauraAntes = historico.slice(0, Math.max(primeiraEquipe, 0)).some((m) => m.autor === 'ia')

    if (lauraAntes) {
      const texto = historico
        .map((m) => `${m.autor === 'cliente' ? 'Cliente' : m.autor === 'ia' ? 'Atendente virtual' : m.autor === 'humano' ? 'Equipe' : 'Sistema'}: ${m.conteudo}`)
        .join('\n')
        .slice(-8000)
      try {
        const r = await perguntar(
          [
            { role: 'system', content: PEDIDO_SUGESTAO },
            { role: 'user', content: texto },
          ],
          [],
          { maxTokens: 500, json: true },
        )
        await sb.from('uso_ia').insert({
          empresa_id: info.empresa_id,
          conversa_id: conversaId,
          modelo: r.modelo,
          tokens_entrada: r.tokensEntrada,
          tokens_saida: r.tokensSaida,
          custo_micro_usd: custoMicroUsd(r.tokensEntrada, r.tokensSaida),
        })
        const json = JSON.parse(r.mensagem.content ?? '{}') as { licoes?: Licao[] }
        const novas = (json.licoes ?? [])
          .filter((l) => typeof l?.situacao === 'string' && typeof l?.resposta_ideal === 'string')
          .slice(0, 2)
          .map((l) => ({
            empresa_id: info.empresa_id,
            conversa_id: conversaId,
            situacao: l.situacao.trim().slice(0, 600),
            resposta_ideal: l.resposta_ideal.trim().slice(0, 2000),
            origem: 'sugestao',
            ativa: false,
          }))
          .filter((l) => l.situacao.length >= 3 && l.resposta_ideal.length >= 2)
        if (novas.length) {
          const { error } = await sb.from('licoes').insert(novas)
          if (!error) sugeridas += novas.length
        }
      } catch {
        // Falha de modelo ou JSON: tenta de novo amanhã (não marca como lida).
        continue
      }
    }
    await sb.from('conversas').update({ licoes_lidas_ate: info.ultima }).eq('id', conversaId)
    lidas++
  }
  return { lidas, sugeridas }
}
