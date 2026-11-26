import { ErroWhatsapp } from '@/lib/whatsapp'

/**
 * Modelos de mensagem (templates) que a Laura usa para puxar conversa fora da janela de 24h.
 * São cadastrados automaticamente na conta de WhatsApp de cada empresa quando o número é ligado,
 * e a Meta aprova em minutos a algumas horas. Categoria Utilidade, português do Brasil.
 */
export const MODELOS = {
  lembreteVespera: {
    nome: 'laura_lembrete_visita',
    texto:
      'Olá, {{1}}! Passando para lembrar da sua visita técnica com a {{2}} amanhã {{3}}. Se precisar remarcar, é só responder esta mensagem.',
    exemplo: ['Maria', 'Sheik Manutenções', 'pela manhã'],
  },
  confirmarVisita: {
    nome: 'laura_confirmar_visita',
    texto:
      'Olá, {{1}}! Sua visita técnica com a {{2}} está marcada para amanhã, {{3}}. Podemos confirmar? Se não puder, é só tocar em "Preciso remarcar" que a gente acerta outro dia.',
    exemplo: ['Maria', 'Sheik Manutenções', 'pela manhã'],
    botoes: ['Confirmo', 'Preciso remarcar'],
  },
  cobrarConfirmacao: {
    nome: 'laura_confirmacao_pendente',
    texto:
      'Olá, {{1}}! Ainda não recebemos a confirmação da sua visita de amanhã, {{2}}. O técnico pode ir? Se não for um bom dia, a gente remarca sem problema.',
    exemplo: ['Maria', 'pela manhã'],
    botoes: ['Pode vir', 'Preciso remarcar'],
  },
  manutencaoTecnico: {
    nome: 'laura_manutencao_tecnico',
    texto: 'Manutenção programada em 7 dias: {{1}}, {{2}}, no endereço {{3}}. Confira peças e materiais antes do dia.',
    exemplo: ['João Souza', 'terça-feira, 12/05, manhã', 'Rua das Flores, 120, Itapuã'],
  },
  pesquisa: {
    nome: 'laura_pesquisa_satisfacao',
    texto: 'Olá, {{1}}! Obrigado por chamar a {{2}}. Pode avaliar o atendimento em menos de um minuto? {{3}}',
    exemplo: ['Maria', 'Sheik Manutenções', 'https://ialaura.vercel.app/p/exemplo'],
  },
  tecnicoACaminho: {
    nome: 'laura_tecnico_a_caminho',
    texto: 'Olá, {{1}}! O técnico {{2}} da {{3}} já está a caminho da sua casa.',
    exemplo: ['Maria', 'Carlos', 'Sheik Manutenções'],
  },
} as const

/** Texto do modelo com os parâmetros preenchidos, para guardar na conversa o que o cliente recebeu. */
export function textoDoModelo(texto: string, parametros: string[]): string {
  return texto.replace(/\{\{(\d+)\}\}/g, (_, n: string) => parametros[Number(n) - 1] ?? '')
}

const VERSAO = process.env.WHATSAPP_GRAPH_VERSION ?? 'v25.0'

export type SituacaoModelo = { nome: string; status: string }

function token(): string {
  const t = process.env.WHATSAPP_ACCESS_TOKEN
  if (!t) throw new ErroWhatsapp('Falta WHATSAPP_ACCESS_TOKEN no ambiente.')
  return t
}

/** Situação de cada modelo da Laura na conta (APPROVED, PENDING, REJECTED ou "não cadastrado"). */
export async function situacaoModelos(wabaId: string): Promise<SituacaoModelo[]> {
  const resp = await fetch(
    `https://graph.facebook.com/${VERSAO}/${wabaId}/message_templates?fields=name,status&limit=200`,
    { headers: { Authorization: `Bearer ${token()}` } },
  )
  const dados = (await resp.json().catch(() => ({}))) as { data?: Array<{ name: string; status: string }>; error?: { message?: string } }
  if (!resp.ok) throw new ErroWhatsapp(`Não foi possível ler os modelos: ${dados.error?.message ?? resp.status}`)
  const existentes = new Map((dados.data ?? []).map((m) => [m.name, m.status]))
  return Object.values(MODELOS).map((m) => ({ nome: m.nome, status: existentes.get(m.nome) ?? 'não cadastrado' }))
}

/** Cadastra os modelos que faltam. Os que já existem ficam como estão. */
export async function cadastrarModelos(wabaId: string): Promise<SituacaoModelo[]> {
  const atuais = await situacaoModelos(wabaId)
  const faltando = new Set(atuais.filter((s) => s.status === 'não cadastrado').map((s) => s.nome))

  for (const m of Object.values(MODELOS)) {
    if (!faltando.has(m.nome)) continue
    const resp = await fetch(`https://graph.facebook.com/${VERSAO}/${wabaId}/message_templates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: m.nome,
        language: 'pt_BR',
        category: 'UTILITY',
        components: [
          { type: 'BODY', text: m.texto, example: { body_text: [m.exemplo] } },
          ...('botoes' in m
            ? [{ type: 'BUTTONS', buttons: m.botoes.map((text) => ({ type: 'QUICK_REPLY', text })) }]
            : []),
        ],
      }),
    })
    if (!resp.ok) {
      const dados = (await resp.json().catch(() => ({}))) as { error?: { message?: string; error_user_msg?: string } }
      throw new ErroWhatsapp(
        `A Meta recusou o modelo "${m.nome}": ${dados.error?.error_user_msg ?? dados.error?.message ?? resp.status}`,
      )
    }
  }
  return situacaoModelos(wabaId)
}
