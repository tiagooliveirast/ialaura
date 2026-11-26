'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { STATUS_DO_TECNICO } from '@ialaura/shared'
import { avisarTecnicoACaminho, enviarCobrancaPix, enviarOrcamentoParaAprovar } from '@/lib/laura/lembretes'
import { comErro } from '@/lib/sessao'
import { supabaseAdmin } from '@/lib/supabase/admin'
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
    const chegada = numero(form.get('chegada'))
    const minutos = chegada && chegada > 0 && chegada <= 240 ? Math.round(chegada) : null
    after(() => avisarTecnicoACaminho(id, minutos).catch((e) => console.error('aviso a caminho:', e instanceof Error ? e.message : e)))
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
  const servicoOrc = String(form.get('servico_orcamento') ?? '').trim().slice(0, 200)
  if (resultado === 'pensando' && form.get('mandar_orcamento') === 'on' && servicoOrc) {
    after(() =>
      enviarOrcamentoParaAprovar(id, servicoOrc).catch((e) => console.error('orçamento:', e instanceof Error ? e.message : e)),
    )
  }
  if (resultado === 'aprovado' && valor != null && form.get('pix') === 'on') {
    after(() => enviarCobrancaPix(id).catch((e) => console.error('cobrança pix:', e instanceof Error ? e.message : e)))
  }
  revalidatePath('/tecnico')
}

/** Guarda fotos de antes/depois. O banco confere se a visita é deste técnico antes de subir qualquer arquivo. */
export async function enviarFotos(form: FormData): Promise<{ ok: boolean; enviadas?: number; erro?: string }> {
  const id = String(form.get('id') ?? '')
  const momento = form.get('momento') === 'depois' ? 'depois' : 'antes'
  const sb = await supabaseServidor()
  const { data: empresaId, error } = await sb.rpc('pode_mexer_visita', { p_atendimento: id })
  if (error || typeof empresaId !== 'string') return { ok: false, erro: 'Visita não encontrada ou de outro técnico.' }
  const {
    data: { user },
  } = await sb.auth.getUser()

  const fotos = form.getAll('fotos').filter((f): f is File => f instanceof File && f.size > 0).slice(0, 6)
  if (!fotos.length) return { ok: false, erro: 'Nenhuma foto recebida.' }
  const admin = supabaseAdmin()
  const pasta = admin.storage.from('laura-fotos')
  let enviadas = 0
  for (const f of fotos) {
    if (f.size > 3 * 1024 * 1024) continue
    const caminho = `${empresaId}/visitas/${id}/${momento}-${Date.now()}-${enviadas}.jpg`
    const { error: e } = await pasta.upload(caminho, f, { contentType: 'image/jpeg' })
    if (e) continue
    const url = pasta.getPublicUrl(caminho).data.publicUrl
    const { error: e2 } = await admin
      .from('atendimento_fotos')
      .insert({ empresa_id: empresaId, atendimento_id: id, url, momento, criado_por: user?.id ?? null })
    if (!e2) enviadas++
  }
  revalidatePath('/tecnico')
  return enviadas ? { ok: true, enviadas } : { ok: false, erro: 'Não foi possível guardar as fotos. Tente de novo.' }
}
