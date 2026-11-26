'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { STATUS_DO_TECNICO } from '@ialaura/shared'
import { avisarTecnicoACaminho, enviarCobrancaPix } from '@/lib/laura/lembretes'
import { comErro } from '@/lib/sessao'
import { supabaseServidor } from '@/lib/supabase/server'

function numero(v: FormDataEntryValue | null): number | null {
  const n = Number(v)
  return v === null || v === '' || !Number.isFinite(n) ? null : n
}

export async function informarStatus(form: FormData) {
  const id = String(form.get('id') ?? '')
  const status = String(form.get('status') ?? '')
  if (!id || !(STATUS_DO_TECNICO as readonly string[]).includes(status)) {
    redirect(comErro('/tecnico', 'Não entendi o status. Atualize a página e tente de novo.'))
  }

  const sb = await supabaseServidor()
  // A função do banco confere se o atendimento é mesmo deste técnico.
  const { error } = await sb.rpc('atualizar_status', {
    p_atendimento: id,
    p_status: status,
    p_lat: numero(form.get('lat')),
    p_lng: numero(form.get('lng')),
    p_precisao: numero(form.get('precisao')),
  })
  if (error) redirect(comErro('/tecnico', error.message))

  if (status === 'a_caminho') {
    after(() => avisarTecnicoACaminho(id).catch((e) => console.error('aviso a caminho:', e instanceof Error ? e.message : e)))
  }
  revalidatePath('/tecnico')
}

function centavos(v: FormDataEntryValue | null): number | null | 'invalido' {
  const limpo = String(v ?? '').replace(/[R$\s.]/g, '').replace(',', '.')
  if (!limpo) return null
  const n = Number(limpo)
  if (!Number.isFinite(n) || n < 0 || n > 100000) return 'invalido'
  return Math.round(n * 100)
}

/** Finaliza a visita e registra o orçamento. As duas funções do banco conferem se a visita é deste técnico. */
export async function finalizarVisita(form: FormData) {
  const id = String(form.get('id') ?? '')
  const resultado = String(form.get('resultado') ?? '')
  if (!id || !['aprovado', 'pensando', 'recusado'].includes(resultado)) {
    redirect(comErro('/tecnico', 'Escolha como ficou a visita antes de finalizar.'))
  }
  const valor = centavos(form.get('valor'))
  if (valor === 'invalido') redirect(comErro('/tecnico', 'Valor inválido. Escreva só o número, por exemplo 350.'))
  if (resultado !== 'aprovado' && valor == null) {
    redirect(comErro('/tecnico', 'Informe o valor do orçamento para a Laura poder retomar com o cliente.'))
  }

  const sb = await supabaseServidor()
  // Os 5 parâmetros escolhem a versão nova da função (a de 3 parâmetros não tem permissão).
  const { error: e1 } = await sb.rpc('atualizar_status', {
    p_atendimento: id,
    p_status: 'finalizado',
    p_lat: null,
    p_lng: null,
    p_precisao: null,
  })
  if (e1) redirect(comErro('/tecnico', e1.message))
  const { error: e2 } = await sb.rpc('registrar_orcamento', {
    p_atendimento: id,
    p_status: resultado,
    p_valor_centavos: valor,
    p_motivo: String(form.get('motivo') ?? '').slice(0, 300) || null,
  })
  if (e2) redirect(comErro('/tecnico', `A visita foi finalizada, mas o orçamento não foi salvo: ${e2.message}`))
  if (resultado === 'aprovado' && valor != null && form.get('pix') === 'on') {
    after(() => enviarCobrancaPix(id).catch((e) => console.error('cobrança pix:', e instanceof Error ? e.message : e)))
  }
  revalidatePath('/tecnico')
}
