import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import {
  dataCurta,
  hojeEm,
  ROTULO_PERIODO,
  ROTULO_STATUS,
  type Periodo,
  type StatusAtendimento,
} from '@ialaura/shared'
import { exigirMembro } from '@/lib/sessao'
import { sair } from '../entrar/acoes'
import { informarStatus } from './acoes'

export const metadata: Metadata = { title: 'Minha agenda' }

type Visita = {
  id: string
  data: string
  periodo: Periodo
  status: StatusAtendimento
  descricao: string | null
  cliente_nome: string
  endereco: string | null
  bairro: string | null
  cidade: string | null
  servico: string | null
}

// Próximo passo que faz sentido a partir de cada status.
const PROXIMOS: Partial<Record<StatusAtendimento, Array<[StatusAtendimento, string]>>> = {
  agendado: [['a_caminho', 'Estou indo'], ['atrasado', 'Vou atrasar']],
  confirmado: [['a_caminho', 'Estou indo'], ['atrasado', 'Vou atrasar']],
  atrasado: [['a_caminho', 'Estou indo']],
  a_caminho: [['em_andamento', 'Cheguei, iniciar'], ['atrasado', 'Vou atrasar']],
  em_andamento: [['finalizado', 'Finalizar']],
}

export default async function Tecnico({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  const { sb, membro, empresa } = await exigirMembro()
  if (membro.papel !== 'tecnico') redirect('/painel')

  // Agenda dos próximos 7 dias, sem telefone do cliente: a regra está na função do banco.
  const { data, error } = await sb.rpc('meus_atendimentos')
  const visitas = (data ?? []) as Visita[]
  const hoje = hojeEm(empresa.fuso)

  return (
    <>
      <header className="barra">
        <div className="barra-dentro">
          <span className="barra-empresa">{empresa.nome}</span>
          <form action={sair}>
            <span className="barra-usuario">{membro.nome}</span>
            <button className="link-botao">Sair</button>
          </form>
        </div>
      </header>
      <main className="estreito sem-margem">
        <h1>Minha agenda</h1>
        <p className="apoio">Próximos 7 dias.</p>

        {(erro || error) && (
          <p className="aviso aviso-erro" role="alert">
            {erro ?? `Não foi possível carregar a agenda: ${error?.message}`}
          </p>
        )}

        {visitas.length === 0 && !error ? (
          <p className="vazio">Nenhuma visita marcada para você nos próximos 7 dias.</p>
        ) : (
          <ul className="visitas">
            {visitas.map((v) => (
              <li key={v.id} className="painel">
                <p className="visita-quando numero">
                  {v.data === hoje ? 'Hoje' : dataCurta(v.data)} · {ROTULO_PERIODO[v.periodo]}
                  <span className="etiqueta">{ROTULO_STATUS[v.status]}</span>
                </p>
                <p className="visita-cliente">{v.cliente_nome}</p>
                <p className="fraco">{[v.endereco, v.bairro, v.cidade].filter(Boolean).join(', ') || 'Endereço não informado'}</p>
                {(v.servico || v.descricao) && <p className="visita-descricao">{[v.servico, v.descricao].filter(Boolean).join(': ')}</p>}

                {PROXIMOS[v.status] && (
                  <form action={informarStatus} className="visita-acoes">
                    <input type="hidden" name="id" value={v.id} />
                    {PROXIMOS[v.status]!.map(([status, rotulo], i) => (
                      <button key={status} name="status" value={status} className={i === 0 ? 'botao' : 'botao botao-claro'}>
                        {rotulo}
                      </button>
                    ))}
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  )
}
