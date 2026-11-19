'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { comErro, exigirMembro } from '@/lib/sessao'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { enviarTexto } from '@/lib/whatsapp'

/** Assumir (a Laura para), devolver para a Laura ou encerrar. RLS garante que a conversa é da empresa. */
export async function mudarEstado(form: FormData) {
  const { sb } = await exigirMembro()
  const id = String(form.get('id') ?? '')
  const estado = String(form.get('estado') ?? '')
  if (!id || !['ia', 'humano', 'encerrada'].includes(estado)) {
    redirect(comErro('/painel/conversas', 'Ação inválida. Atualize a página.'))
  }
  const { error } = await sb.from('conversas').update({ estado }).eq('id', id)
  if (error) redirect(comErro(`/painel/conversas/${id}`, `Não foi possível mudar: ${error.message}`))
  revalidatePath(`/painel/conversas/${id}`)
  revalidatePath('/painel/conversas')
}

/** Resposta escrita por alguém da empresa. Sai pelo WhatsApp da empresa e a Laura fica fora da conversa. */
export async function responder(form: FormData) {
  const { sb, membro } = await exigirMembro()
  const id = String(form.get('id') ?? '')
  const texto = String(form.get('texto') ?? '').trim().slice(0, 4000)
  const volta = `/painel/conversas/${id}`
  if (!id || !texto) redirect(comErro(volta, 'Escreva a mensagem antes de enviar.'))

  const { data: conversa } = await sb
    .from('conversas')
    .select('id, empresa_id, wa_telefone')
    .eq('id', id)
    .maybeSingle<{ id: string; empresa_id: string; wa_telefone: string }>()
  if (!conversa) redirect(comErro('/painel/conversas', 'Conversa não encontrada.'))

  const admin = supabaseAdmin()
  const { data: conta } = await admin
    .from('whatsapp_contas')
    .select('phone_number_id')
    .eq('empresa_id', conversa.empresa_id)
    .maybeSingle<{ phone_number_id: string }>()
  if (!conta) redirect(comErro(volta, 'Nenhum WhatsApp ligado à empresa. Ligue em Configurações.'))

  let waId: string | null
  try {
    waId = await enviarTexto(conta.phone_number_id, conversa.wa_telefone, texto)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Fora da janela de 24h a Meta só aceita mensagem de modelo aprovado.
    const dica = /24|re-engage|131047/i.test(msg)
      ? ' O cliente não escreve há mais de 24 horas; nesse caso o WhatsApp só permite mensagens de modelo aprovado.'
      : ''
    redirect(comErro(volta, `Não foi possível enviar.${dica} Detalhe: ${msg}`))
  }

  await admin.from('mensagens').insert({
    empresa_id: conversa.empresa_id,
    conversa_id: conversa.id,
    direcao: 'saida',
    autor: 'humano',
    wa_message_id: waId,
    tipo: 'text',
    conteudo: texto,
    payload: { enviado_por: membro.id },
  })
  await sb.from('conversas').update({ estado: 'humano', ultima_msg_em: new Date().toISOString() }).eq('id', conversa.id)
  revalidatePath(volta)
  redirect(volta)
}
