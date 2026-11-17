'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { novoAtendimento, STATUS_ATENDIMENTO, type StatusAtendimento } from '@ialaura/shared'
import { comErro, exigirMembro } from '@/lib/sessao'

function vazioVira(v: FormDataEntryValue | null): string | undefined {
  const t = String(v ?? '').trim()
  return t === '' ? undefined : t
}

export async function criarAtendimento(form: FormData) {
  const { sb, membro } = await exigirMembro()

  const lido = novoAtendimento.safeParse({
    nome: form.get('nome'),
    telefone: form.get('telefone'),
    endereco: form.get('endereco'),
    bairro: vazioVira(form.get('bairro')),
    descricao: vazioVira(form.get('descricao')),
    data: form.get('data'),
    periodo: form.get('periodo'),
  })
  if (!lido.success) {
    redirect(comErro('/painel/novo', lido.error.issues[0]?.message ?? 'Confira os dados informados.'))
  }
  const d = lido.data

  // Mesmo telefone = mesmo cliente. Atualiza nome e endereço com o que foi informado agora.
  const { data: cliente, error: erroCliente } = await sb
    .from('clientes')
    .upsert(
      {
        empresa_id: membro.empresa_id,
        nome: d.nome,
        telefone: d.telefone,
        endereco: d.endereco,
        bairro: d.bairro ?? null,
      },
      { onConflict: 'empresa_id,telefone' },
    )
    .select('id')
    .single<{ id: string }>()
  if (erroCliente || !cliente) {
    redirect(comErro('/painel/novo', `Não foi possível salvar o cliente: ${erroCliente?.message ?? 'sem resposta do banco'}`))
  }

  const { error } = await sb.from('atendimentos').insert({
    empresa_id: membro.empresa_id,
    cliente_id: cliente.id,
    data: d.data,
    periodo: d.periodo,
    descricao: d.descricao ?? null,
    origem: 'painel',
  })
  if (error) redirect(comErro('/painel/novo', `Não foi possível marcar a visita: ${error.message}`))

  revalidatePath('/painel')
  redirect('/painel')
}

export async function mudarStatus(form: FormData) {
  const { sb } = await exigirMembro()
  const id = String(form.get('id') ?? '')
  const status = String(form.get('status') ?? '') as StatusAtendimento
  if (!id || !STATUS_ATENDIMENTO.includes(status)) {
    redirect(comErro('/painel', 'Status inválido. Atualize a página e tente de novo.'))
  }

  // RLS garante que só altera atendimento da própria empresa.
  const { error } = await sb.from('atendimentos').update({ status }).eq('id', id)
  if (error) redirect(comErro('/painel', `Não foi possível mudar o status: ${error.message}`))
  revalidatePath('/painel')
}
