'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { comErro, exigirMembro } from '@/lib/sessao'
import { supabaseAdmin } from '@/lib/supabase/admin'

const VOLTA = '/painel/configuracoes'

function texto(form: FormData, campo: string, max = 1000): string {
  return String(form.get(campo) ?? '').trim().slice(0, max)
}

function linhas(form: FormData, campo: string): string[] {
  return texto(form, campo, 4000)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 80)
}

/** "R$ 90,00", "90", "90,5" → centavos. Vazio → null. */
function centavos(valor: string): number | null | 'invalido' {
  const limpo = valor.replace(/[R$\s.]/g, '').replace(',', '.')
  if (limpo === '') return null
  const n = Number(limpo)
  if (!Number.isFinite(n) || n < 0 || n > 100000) return 'invalido'
  return Math.round(n * 100)
}

export async function salvarConfiguracoes(form: FormData) {
  const { sb, membro } = await exigirMembro()
  if (membro.papel !== 'dono') redirect(comErro(VOLTA, 'Só o dono da empresa pode mudar as configurações.'))

  const valor = centavos(texto(form, 'valor_visita', 20))
  if (valor === 'invalido') redirect(comErro(VOLTA, 'Valor da visita inválido. Escreva só o número, por exemplo 90.'))

  const vagas = Number(texto(form, 'vagas', 3))
  if (!Number.isInteger(vagas) || vagas < 1 || vagas > 20) {
    redirect(comErro(VOLTA, 'Vagas por período: escreva um número de 1 a 20.'))
  }

  const linkGoogle = texto(form, 'link_google', 300)
  if (linkGoogle && !/^https:\/\//.test(linkGoogle)) {
    redirect(comErro(VOLTA, 'O link de avaliação do Google precisa começar com https://'))
  }

  const { error } = await sb
    .from('empresas')
    .update({
      valor_visita_centavos: valor,
      vagas_por_periodo: vagas,
      link_avaliacao_google: linkGoogle || null,
      conhecimento: {
        pagamento: texto(form, 'pagamento'),
        garantia: texto(form, 'garantia'),
        horario: texto(form, 'horario', 300),
        observacoes: texto(form, 'observacoes', 2000),
        sabado: form.get('sabado') === 'on',
        domingo: form.get('domingo') === 'on',
      },
    })
    .eq('id', membro.empresa_id)
  if (error) redirect(comErro(VOLTA, `Não foi possível salvar: ${error.message}`))

  // Serviços e área: a lista da tela substitui a anterior.
  const servicos = linhas(form, 'servicos').map((nome) => ({ empresa_id: membro.empresa_id, nome }))
  const areas = linhas(form, 'areas').map((linha) => {
    const [bairro, cidade] = linha.split(',').map((p) => p.trim())
    return cidade
      ? { empresa_id: membro.empresa_id, bairro: bairro || null, cidade }
      : { empresa_id: membro.empresa_id, bairro: null, cidade: bairro! }
  })

  const r1 = await sb.from('servicos').delete().eq('empresa_id', membro.empresa_id)
  const r2 = servicos.length ? await sb.from('servicos').insert(servicos) : { error: null }
  const r3 = await sb.from('areas_atendimento').delete().eq('empresa_id', membro.empresa_id)
  const r4 = areas.length ? await sb.from('areas_atendimento').insert(areas) : { error: null }
  const falha = r1.error ?? r2.error ?? r3.error ?? r4.error
  if (falha) redirect(comErro(VOLTA, `Salvei os dados da empresa, mas não os serviços ou bairros: ${falha.message}`))

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
