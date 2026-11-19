/**
 * Envio pela WhatsApp Cloud API.
 * Por enquanto o token vem de WHATSAPP_ACCESS_TOKEN (um token para todas as contas).
 * Quando houver várias empresas com números próprios, o token de cada uma vai para o Vault
 * (laura.whatsapp_contas.token_secret_id).
 */
const VERSAO = process.env.WHATSAPP_GRAPH_VERSION ?? 'v25.0'

export class ErroWhatsapp extends Error {}

export async function enviarTexto(phoneNumberId: string, para: string, texto: string): Promise<string | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) throw new ErroWhatsapp('Falta WHATSAPP_ACCESS_TOKEN no ambiente.')

  const resp = await fetch(`https://graph.facebook.com/${VERSAO}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: para,
      type: 'text',
      text: { preview_url: false, body: texto },
    }),
  })

  const dados = (await resp.json().catch(() => ({}))) as {
    messages?: Array<{ id: string }>
    error?: { message?: string; code?: number }
  }
  if (!resp.ok) {
    throw new ErroWhatsapp(`WhatsApp recusou o envio (${resp.status}): ${dados.error?.message ?? 'sem detalhe'}`)
  }
  return dados.messages?.[0]?.id ?? null
}
