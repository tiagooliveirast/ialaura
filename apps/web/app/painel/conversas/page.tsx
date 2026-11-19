import type { Metadata } from 'next'
import Link from 'next/link'
import { exigirMembro } from '@/lib/sessao'

export const metadata: Metadata = { title: 'Conversas' }
export const dynamic = 'force-dynamic'

type Linha = {
  id: string
  wa_telefone: string
  estado: 'ia' | 'humano' | 'encerrada'
  ultima_msg_em: string
  cliente: { nome: string } | null
}

const ROTULO = { ia: 'Laura respondendo', humano: 'Com a equipe', encerrada: 'Encerrada' } as const

function quando(iso: string, fuso: string): string {
  const d = new Date(iso)
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: fuso })
  const dia = d.toLocaleDateString('pt-BR', { timeZone: fuso })
  return dia === hoje
    ? d.toLocaleTimeString('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { timeZone: fuso, day: '2-digit', month: '2-digit' })
}

export default async function Conversas({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  const { sb, empresa } = await exigirMembro()
  const { data, error } = await sb
    .from('conversas')
    .select('id, wa_telefone, estado, ultima_msg_em, cliente:clientes(nome)')
    .order('ultima_msg_em', { ascending: false })
    .limit(100)
  const conversas = (data ?? []) as unknown as Linha[]
  const comEquipe = conversas.filter((c) => c.estado === 'humano').length

  return (
    <>
      <h1>Conversas</h1>
      <p className="apoio">
        <span className="numero">{comEquipe}</span> esperando alguém da equipe.
      </p>
      {(erro || error) && (
        <p className="aviso aviso-erro" role="alert">
          {erro ?? `Não foi possível carregar: ${error?.message}`}
        </p>
      )}
      {conversas.length === 0 ? (
        <p className="vazio">Nenhuma conversa ainda. Quando um cliente chamar no WhatsApp, ela aparece aqui.</p>
      ) : (
        <ul className="lista-conversas painel">
          {conversas.map((c) => (
            <li key={c.id}>
              <Link href={`/painel/conversas/${c.id}`}>
                <span>
                  <strong>{c.cliente?.nome ?? `+${c.wa_telefone}`}</strong>
                  <span className="fraco numero">{c.cliente ? ` · +${c.wa_telefone}` : ''}</span>
                </span>
                <span className={`etiqueta ${c.estado === 'humano' ? 'etiqueta-atencao' : ''}`}>{ROTULO[c.estado]}</span>
                <span className="fraco numero">{quando(c.ultima_msg_em, empresa.fuso)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
