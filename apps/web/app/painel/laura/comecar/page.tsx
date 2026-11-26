import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { lerConhecimento } from '@/lib/laura/conhecimento'
import { exigirMembro } from '@/lib/sessao'
import { Entrevista } from './Entrevista'

export const metadata: Metadata = { title: 'Configurar a Laura' }
export const dynamic = 'force-dynamic'

export default async function ComecarLaura() {
  const { sb, membro, empresa } = await exigirMembro()
  if (membro.papel !== 'dono') redirect('/painel/laura')
  const { data } = await sb.from('empresas').select('conhecimento').eq('id', empresa.id).single()
  const c = lerConhecimento(data?.conhecimento)
  return <Entrevista nome={c.nome_assistente || 'Laura'} empresa={empresa.nome} />
}
