/**
 * Conversa com o modelo da OpenAI (Chat Completions com ferramentas), sem SDK.
 * Toda chamada devolve o uso de tokens para gravar em laura.uso_ia.
 */
export type MensagemIA =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ChamadaFerramenta[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export type ChamadaFerramenta = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type Ferramenta = {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export type RespostaIA = {
  mensagem: { content: string | null; tool_calls?: ChamadaFerramenta[] }
  modelo: string
  tokensEntrada: number
  tokensSaida: number
}

export class ErroIA extends Error {}

export function modeloPadrao(): string {
  return process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
}

/** Custo em milionésimos de dólar. Preços por 1 milhão de tokens vêm do ambiente (padrão: gpt-4o-mini). */
export function custoMicroUsd(tokensEntrada: number, tokensSaida: number): number {
  const entrada = Number(process.env.OPENAI_PRECO_ENTRADA_1M ?? '0.15')
  const saida = Number(process.env.OPENAI_PRECO_SAIDA_1M ?? '0.60')
  return Math.round(tokensEntrada * entrada + tokensSaida * saida)
}

export async function perguntar(mensagens: MensagemIA[], ferramentas: Ferramenta[]): Promise<RespostaIA> {
  const chave = process.env.OPENAI_API_KEY
  if (!chave) throw new ErroIA('Falta OPENAI_API_KEY no ambiente.')
  const modelo = modeloPadrao()

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelo,
      messages: mensagens,
      tools: ferramentas,
      tool_choice: 'auto',
      temperature: 0.3,
      max_tokens: 400,
    }),
  })

  const dados = (await resp.json().catch(() => ({}))) as {
    choices?: Array<{ message: { content: string | null; tool_calls?: ChamadaFerramenta[] } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
    error?: { message?: string }
  }
  if (!resp.ok || !dados.choices?.[0]) {
    throw new ErroIA(`OpenAI recusou (${resp.status}): ${dados.error?.message ?? 'sem detalhe'}`)
  }

  return {
    mensagem: dados.choices[0].message,
    modelo,
    tokensEntrada: dados.usage?.prompt_tokens ?? 0,
    tokensSaida: dados.usage?.completion_tokens ?? 0,
  }
}
