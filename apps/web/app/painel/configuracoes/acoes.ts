'use server'

import { normalizarTelefone } from '@ialaura/shared'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { comErro, exigirMembro } from '@/lib/sessao'
import { after } from 'next/server'
import { cadastrarModelos } from '@/lib/laura/modelos'
import { supabaseAdmin } from '@/lib/supabase/admin'

const VOLTA = '/painel/configuracoes'

function texto(form: FormData, campo: string, max = 1000): string {
  return String(form.get(campo) ?? '').trim().slice(0, max)
}


export async function salvarConfiguracoes(form: FormData) {
  const { sb, membro } = await exigirMembro()
  if (membro.papel !== 'dono') redirect(comErro(VOLTA, 'Só o dono da empresa pode mudar as configurações.'))

  const vagas = Number(texto(form, 'vagas', 3))
  if (!Number.isInteger(vagas) || vagas < 1 || vagas > 20) {
    redirect(comErro(VOLTA, 'Vagas por período: escreva um número de 1 a 20.'))
  }
  const linkGoogle = texto(form, 'link_google', 300)
  if (linkGoogle && !/^https:\/\//.test(linkGoogle)) {
    redirect(comErro(VOLTA, 'O link de avaliação do Google precisa começar com https://'))
  }

  const telResumoBruto = texto(form, 'resumo_telefone', 20)
  const telResumo = telResumoBruto ? normalizarTelefone(telResumoBruto) : null
  if (telResumoBruto && !telResumo) redirect(comErro(VOLTA, 'WhatsApp do resumo: escreva com DDD, por exemplo 71 99999-0000.'))

  // Mantém o treinamento da Laura e só troca os dias de atendimento.
  const { data: atual } = await sb.from('empresas').select('conhecimento').eq('id', membro.empresa_id).single()
  const conhecimento = {
    ...((atual?.conhecimento as Record<string, unknown>) ?? {}),
    sabado: form.get('sabado') === 'on',
    domingo: form.get('domingo') === 'on',
    pix_chave: texto(form, 'pix_chave', 120),
    pix_nome: texto(form, 'pix_nome', 120),
  }

  const { error } = await sb
    .from('empresas')
    .update({
      vagas_por_periodo: vagas,
      link_avaliacao_google: linkGoogle || null,
      mostrar_valores_tv: form.get('mostrar_valores_tv') === 'on',
      resumo_diario: form.get('resumo_diario') === 'on',
      resumo_telefone: telResumo,
      conhecimento,
    })
    .eq('id', membro.empresa_id)
  if (error) redirect(comErro(VOLTA, `Não foi possível salvar: ${error.message}`))

  revalidatePath(VOLTA)
  redirect(`${VOLTA}?salvo=1`)
}

/** Liga um número de WhatsApp (Cloud API) à empresa. Os IDs não são segredo; o token fica no ambiente. */
export async function ligarWhatsapp(form: FormData) {
  const { membro } = await exigirMembro()
  if (membro.papel !== 'dono') redirect(comErro(VOLTA, 'Só o dono da empresa pode ligar o WhatsApp.'))

  const phoneNumberId = texto(form, 'phone_number_id', 40).replace(/\D/g, '')
  const wabaId = texto(form, 'waba_id', 40).replace(/\D/g, '')
  if (!phoneNumberId || !wabaId) {
    redirect(comErro(VOLTA, 'Preencha o ID do número e o ID da conta do WhatsApp Business (só números).'))
  }

  const sb = supabaseAdmin()
  const { data: outra } = await sb
    .from('whatsapp_contas')
    .select('empresa_id')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle<{ empresa_id: string }>()
  if (outra && outra.empresa_id !== membro.empresa_id) {
    redirect(comErro(VOLTA, 'Esse número já está ligado a outra empresa.'))
  }

  const { error } = await sb.from('whatsapp_contas').upsert(
    { empresa_id: membro.empresa_id, phone_number_id: phoneNumberId, waba_id: wabaId, status: 'ativa' },
    { onConflict: 'empresa_id' },
  )
  if (error) redirect(comErro(VOLTA, `Não foi possível ligar o WhatsApp: ${error.message}`))

  // Cadastra na Meta os modelos de lembrete, pesquisa e aviso, logo depois de responder.
  after(() => cadastrarModelos(wabaId).catch((e) => console.error('modelos:', e instanceof Error ? e.message : e)))

  revalidatePath(VOLTA)
  redirect(`${VOLTA}?salvo=whatsapp`)
}

export async function pausarWhatsapp(form: FormData) {
  const { membro } = await exigirMembro()
  if (membro.papel !== 'dono') redirect(comErro(VOLTA, 'Só o dono da empresa pode pausar a Laura.'))
  const status = form.get('acao') === 'ativar' ? 'ativa' : 'suspensa'
  await supabaseAdmin().from('whatsapp_contas').update({ status }).eq('empresa_id', membro.empresa_id)
  revalidatePath(VOLTA)
  redirect(VOLTA)
}

/** Tenta de novo cadastrar os modelos na Meta (por exemplo, depois de colar o token). */
export async function recadastrarModelos() {
  const { membro } = await exigirMembro()
  if (membro.papel !== 'dono') redirect(comErro(VOLTA, 'Só o dono pode fazer isso.'))
  const { data: conta } = await supabaseAdmin()
    .from('whatsapp_contas')
    .select('waba_id')
    .eq('empresa_id', membro.empresa_id)
    .maybeSingle<{ waba_id: string }>()
  if (!conta) redirect(comErro(VOLTA, 'Ligue um número de WhatsApp primeiro.'))
  try {
    await cadastrarModelos(conta.waba_id)
  } catch (e) {
    redirect(comErro(VOLTA, e instanceof Error ? e.message : 'Não foi possível cadastrar os modelos.'))
  }
  revalidatePath(VOLTA)
  redirect(`${VOLTA}?salvo=modelos`)
}
