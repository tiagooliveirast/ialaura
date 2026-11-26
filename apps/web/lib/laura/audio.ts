import { ErroWhatsapp } from '@/lib/whatsapp'

/**
 * Áudio do cliente: baixa da Meta e transcreve na OpenAI.
 * No Brasil boa parte dos clientes manda áudio; sem isso a Laura perderia essas conversas.
 */
const VERSAO = process.env.WHATSAPP_GRAPH_VERSION ?? 'v25.0'
const LIMITE_BYTES = 16 * 1024 * 1024

export type Transcricao = { texto: string; modelo: string; tokensEntrada: number; tokensSaida: number; custoMicroUsd: number }

async function baixarMidia(mediaId: string): Promise<{ dados: Blob; tipo: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) throw new ErroWhatsapp('Falta WHATSAPP_ACCESS_TOKEN no ambiente.')
  const info = await fetch(`https://graph.facebook.com/${VERSAO}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } })
  const meta = (await info.json().catch(() => ({}))) as { url?: string; mime_type?: string; file_size?: number }
  if (!info.ok || !meta.url) throw new ErroWhatsapp(`Não foi possível achar o áudio (${info.status}).`)
  if (meta.file_size && meta.file_size > LIMITE_BYTES) throw new ErroWhatsapp('Áudio grande demais.')
  const arquivo = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } })
  if (!arquivo.ok) throw new ErroWhatsapp(`Não foi possível baixar o áudio (${arquivo.status}).`)
  return { dados: await arquivo.blob(), tipo: meta.mime_type ?? 'audio/ogg' }
}

export async function transcreverAudio(mediaId: string): Promise<Transcricao> {
  const chave = process.env.OPENAI_API_KEY
  if (!chave) throw new Error('Falta OPENAI_API_KEY no ambiente.')
  const { dados, tipo } = await baixarMidia(mediaId)
  const modelo = process.env.OPENAI_MODELO_AUDIO ?? 'gpt-4o-mini-transcribe'

  const form = new FormData()
  const extensao = tipo.includes('mpeg') ? 'mp3' : tipo.includes('mp4') ? 'm4a' : 'ogg'
  form.append('file', new File([dados], `audio.${extensao}`, { type: tipo.split(';')[0] }))
  form.append('model', modelo)
  form.append('language', 'pt')
  form.append('response_format', 'json')

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}` },
    body: form,
  })
  const r = (await resp.json().catch(() => ({}))) as {
    text?: string
    usage?: { input_tokens?: number; output_tokens?: number }
    error?: { message?: string }
  }
  if (!resp.ok || typeof r.text !== 'string') throw new Error(`OpenAI não transcreveu (${resp.status}): ${r.error?.message ?? 'sem detalhe'}`)

  const entrada = r.usage?.input_tokens ?? 0
  const saida = r.usage?.output_tokens ?? 0
  // Preço por 1 milhão de tokens (padrão: gpt-4o-mini-transcribe).
  const custo = Math.round(
    entrada * Number(process.env.OPENAI_PRECO_AUDIO_ENTRADA_1M ?? '1.25') + saida * Number(process.env.OPENAI_PRECO_AUDIO_SAIDA_1M ?? '5'),
  )
  return { texto: r.text.trim(), modelo, tokensEntrada: entrada, tokensSaida: saida, custoMicroUsd: custo }
}
