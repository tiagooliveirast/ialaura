import { hojeEm, normalizarTelefone } from '@ialaura/shared'
import { empresaLiberada } from '@/lib/cobranca'
import type { Metricas } from '@/lib/metricas'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { enviarModelo } from '@/lib/whatsapp'
import { MODELOS } from './modelos'

/** Meia-noite de hoje no fuso da empresa, em ISO (UTC). */
export function inicioDoDia(fuso: string): string {
  const hoje = hojeEm(fuso)
  const agora = new Date()
  // Diferença entre o relógio local do fuso e o UTC, em minutos.
  const local = new Date(agora.toLocaleString('en-US', { timeZone: fuso }))
  const utc = new Date(agora.toLocaleString('en-US', { timeZone: 'UTC' }))
  const offsetMin = Math.round((local.getTime() - utc.getTime()) / 60000)
  return new Date(Date.parse(`${hoje}T00:00:00Z`) - offsetMin * 60000).toISOString()
}

function amanhaDe(hoje: string): string {
  const d = new Date(`${hoje}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Rotina das 19h: manda para o dono o que a Laura fez no dia e como está amanhã.
 * Quem não abre o painel vê o valor da Laura todo dia no WhatsApp.
 * Idempotente: grava a data do envio e não manda de novo no mesmo dia.
 */
export async function enviarResumos(): Promise<{ enviados: number; pulados: number; falhas: number }> {
  const sb = supabaseAdmin()
  const { data: empresas, error } = await sb
    .from('empresas')
    .select('id, nome, fuso, resumo_telefone, resumo_enviado_em, whatsapp_contas(phone_number_id, status)')
    .eq('resumo_diario', true)
  if (error) throw new Error(`Não foi possível ler as empresas: ${error.message}`)

  let enviados = 0
  let pulados = 0
  let falhas = 0
  for (const e of (empresas ?? []) as unknown as Array<{
    id: string
    nome: string
    fuso: string
    resumo_telefone: string | null
    resumo_enviado_em: string | null
    whatsapp_contas: { phone_number_id: string; status: string } | null
  }>) {
    const hoje = hojeEm(e.fuso)
    const conta = e.whatsapp_contas
    if (e.resumo_enviado_em === hoje || !conta || conta.status !== 'ativa' || !(await empresaLiberada(e.id))) {
      pulados++
      continue
    }

    let destino = e.resumo_telefone ? normalizarTelefone(e.resumo_telefone) : null
    if (!destino) {
      const { data: dono } = await sb
        .from('membros')
        .select('telefone')
        .eq('empresa_id', e.id)
        .eq('papel', 'dono')
        .eq('ativo', true)
        .not('telefone', 'is', null)
        .limit(1)
        .maybeSingle<{ telefone: string }>()
      destino = dono?.telefone ? normalizarTelefone(dono.telefone) : null
    }
    if (!destino) {
      pulados++
      continue
    }

    const [{ data: m }, { data: amanha }] = await Promise.all([
      sb.rpc('metricas', { p_inicio: inicioDoDia(e.fuso), p_empresa: e.id }),
      sb
        .from('atendimentos')
        .select('status')
        .eq('empresa_id', e.id)
        .eq('data', amanhaDe(hoje))
        .in('status', ['agendado', 'confirmado']),
    ])
    const met = (m ?? {}) as Partial<Metricas>
    const conversas = met.conversas ?? 0
    const visitas = met.visitas_laura ?? 0
    const total = amanha?.length ?? 0
    // Dia sem nada acontecendo: não incomoda o dono.
    if (conversas === 0 && visitas === 0 && total === 0) {
      pulados++
      continue
    }
    const semConfirmar = (amanha ?? []).filter((a) => a.status === 'agendado').length
    const amanhaTexto =
      total === 0
        ? 'nenhuma visita marcada ainda'
        : `${total} ${total === 1 ? 'visita' : 'visitas'}${semConfirmar ? `, ${semConfirmar} ainda sem confirmação` : ', todas confirmadas'}`

    try {
      await enviarModelo(conta.phone_number_id, destino, MODELOS.resumoDoDia.nome, [
        e.nome,
        String(conversas),
        String(visitas),
        String(met.visitas_fora_horario ?? 0),
        amanhaTexto,
      ])
      await sb.from('empresas').update({ resumo_enviado_em: hoje }).eq('id', e.id)
      enviados++
    } catch (err) {
      falhas++
      console.error('laura: falha no resumo diário', e.id, err instanceof Error ? err.message : err)
    }
  }
  return { enviados, pulados, falhas }
}
