'use server'

import { redirect } from 'next/navigation'
import { hojeEm, pedidoAgendamento } from '@ialaura/shared'
import { comErro } from '@/lib/sessao'
import { supabaseAdmin } from '@/lib/supabase/admin'

function opcional(v: FormDataEntryValue | null): string | undefined {
  const t = String(v ?? '').trim()
  return t === '' ? undefined : t
}

/** Pedido de visita feito pelo cliente final no site público da empresa. Não exige login. */
export async function pedirVisita(slug: string, form: FormData) {
  const volta = `/a/${slug}`

  // Campo-isca: gente não vê, robô preenche. Se veio preenchido, finge que deu certo.
  if (String(form.get('site') ?? '') !== '') redirect(`${volta}/pronto`)

  const sb = supabaseAdmin()
  const { data: empresa } = await sb
    .from('empresas')
    .select('id, fuso')
    .eq('slug', slug)
    .maybeSingle<{ id: string; fuso: string }>()
  if (!empresa) redirect('/')

  const [data, periodo] = String(form.get('quando') ?? '').split('|')
  const lido = pedidoAgendamento.safeParse({
    empresaId: empresa.id,
    nome: form.get('nome'),
    telefone: form.get('telefone'),
    endereco: form.get('endereco'),
    bairro: opcional(form.get('bairro')),
    descricao: opcional(form.get('descricao')),
    data,
    periodo,
    origem: 'site',
  })
  if (!lido.success) {
    const campo = lido.error.issues[0]?.path[0]
    const msg =
      campo === 'data' || campo === 'periodo'
        ? 'Escolha um dia e um período para a visita.'
        : (lido.error.issues[0]?.message ?? 'Confira os dados informados.')
    redirect(comErro(volta, msg))
  }
  const d = lido.data

  if (d.data < hojeEm(empresa.fuso)) redirect(comErro(volta, 'Esse dia já passou. Escolha outro.'))

  // Confere de novo no servidor: a vaga pode ter sido ocupada enquanto o cliente preenchia.
  const { data: vagas, error: erroVagas } = await sb.rpc('vagas_livres', {
    p_empresa: empresa.id,
    p_data: d.data,
    p_periodo: d.periodo,
  })
  if (erroVagas) redirect(comErro(volta, 'Não foi possível conferir a agenda agora. Tente de novo em instantes.'))
  if (!vagas || vagas < 1) redirect(comErro(volta, 'Esse horário acabou de ser preenchido. Escolha outro.'))

  // Cliente já cadastrado (mesmo telefone) não é sobrescrito por formulário público.
  const { data: existente } = await sb
    .from('clientes')
    .select('id')
    .eq('empresa_id', empresa.id)
    .eq('telefone', d.telefone)
    .maybeSingle<{ id: string }>()

  let clienteId = existente?.id
  if (!clienteId) {
    const { data: novo, error } = await sb
      .from('clientes')
      .insert({
        empresa_id: empresa.id,
        nome: d.nome,
        telefone: d.telefone,
        endereco: d.endereco,
        bairro: d.bairro ?? null,
      })
      .select('id')
      .single<{ id: string }>()
    if (error || !novo) redirect(comErro(volta, 'Não foi possível registrar o pedido. Tente de novo em instantes.'))
    clienteId = novo.id
  }

  const { error } = await sb.from('atendimentos').insert({
    empresa_id: empresa.id,
    cliente_id: clienteId,
    data: d.data,
    periodo: d.periodo,
    // Endereço informado agora vai na descrição quando o cliente já existia com outro endereço.
    descricao: [d.descricao, existente ? `Endereço informado no pedido: ${d.endereco}${d.bairro ? `, ${d.bairro}` : ''}` : null]
      .filter(Boolean)
      .join('\n') || null,
    origem: 'site',
  })
  if (error) redirect(comErro(volta, 'Não foi possível registrar o pedido. Tente de novo em instantes.'))

  redirect(`${volta}/pronto`)
}
