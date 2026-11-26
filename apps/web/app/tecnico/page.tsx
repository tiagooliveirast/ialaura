import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  dataCurta,
  reais,
  hojeEm,
  ROTULO_PERIODO,
  ROTULO_STATUS,
  type Periodo,
  type StatusAtendimento,
} from '@ialaura/shared'
import { exigirMembro } from '@/lib/sessao'
import { sair } from '../entrar/acoes'
import { BotoesStatus } from './BotoesStatus'
import { Finalizar } from './Finalizar'
import { FotosVisita } from './FotosVisita'
import { supabaseAdmin } from '@/lib/supabase/admin'

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
}

export default async function Tecnico({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  const { sb, membro, empresa } = await exigirMembro()
  // Técnico, e também o dono ou atendente que vai a campo (marcado em Equipe).
  if (membro.papel !== 'tecnico' && !membro.atende) redirect('/painel')
  const doEscritorio = membro.papel !== 'tecnico'

  // Agenda dos próximos 7 dias, sem telefone do cliente: a regra está na função do banco.
  const [{ data, error }, { data: dadosEmpresa }, { data: mes }] = await Promise.all([
    sb.rpc('meus_atendimentos'),
    sb.from('empresas').select('conhecimento').eq('id', empresa.id).maybeSingle(),
    sb.rpc('meu_mes'),
  ])
  const meuMes = (Array.isArray(mes) ? mes[0] : mes) as { finalizadas: number; valor_centavos: number; consertos: number } | null
  const temPix = !!(dadosEmpresa?.conhecimento as { pix_chave?: string } | null)?.pix_chave
  const visitas = (data ?? []) as Visita[]
  // Quantas fotos cada visita já tem (as visitas vieram da função que só devolve as deste técnico).
  const { data: fotos } = visitas.length
    ? await supabaseAdmin()
        .from('atendimento_fotos')
        .select('atendimento_id')
        .in(
          'atendimento_id',
          visitas.map((v) => v.id),
        )
    : { data: [] as Array<{ atendimento_id: string }> }
  const nFotos = new Map<string, number>()
  for (const f of fotos ?? []) nFotos.set(f.atendimento_id, (nFotos.get(f.atendimento_id) ?? 0) + 1)
  const enderecoDe = (v: Visita) => [v.endereco, v.bairro, v.cidade].filter(Boolean).join(', ')
  const deHoje = visitas.filter((v) => v.data === hoje && !['finalizado', 'cancelado'].includes(v.status) && enderecoDe(v))
  const rota =
    deHoje.length > 0
      ? `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(
          enderecoDe(deHoje[deHoje.length - 1]!),
        )}${
          deHoje.length > 1
            ? `&waypoints=${encodeURIComponent(
                deHoje
                  .slice(0, -1)
                  .map(enderecoDe)
                  .join('|'),
              )}`
            : ''
        }`
      : null
  const hoje = hojeEm(empresa.fuso)

  return (
    <>
      <header className="barra">
        <div className="barra-dentro">
          {doEscritorio ? (
            <Link href="/painel" className="barra-empresa">
              {empresa.nome} · voltar ao painel
            </Link>
          ) : (
            <span className="barra-empresa">{empresa.nome}</span>
          )}
          <form action={sair}>
            <span className="barra-usuario">{membro.nome}</span>
            <button className="link-botao">Sair</button>
          </form>
        </div>
      </header>
      <main className="estreito sem-margem">
        <h1>Minha agenda</h1>
        <p className="apoio">Próximos 7 dias.</p>

        {meuMes && (
          <dl className="meu-mes">
            <div>
              <dt>Visitas feitas no mês</dt>
              <dd className="numero">{meuMes.finalizadas}</dd>
            </div>
            <div>
              <dt>Consertos fechados</dt>
              <dd className="numero">{meuMes.consertos}</dd>
            </div>
            {meuMes.valor_centavos > 0 && (
              <div>
                <dt>Em serviços</dt>
                <dd className="numero">{reais(meuMes.valor_centavos)}</dd>
              </div>
            )}
          </dl>
        )}

        {rota && (
          <a className="botao rota-dia" href={rota} target="_blank" rel="noopener noreferrer">
            Abrir a rota de hoje no mapa ({deHoje.length} {deHoje.length === 1 ? 'visita' : 'visitas'})
          </a>
        )}
        <p className="fraco">Ao tocar nos botões, a posição do celular é registrada para a empresa acompanhar as visitas.</p>

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
                <p className="fraco">{enderecoDe(v) || 'Endereço não informado'}</p>
                {enderecoDe(v) && !['finalizado', 'cancelado'].includes(v.status) && (
                  <p className="mapas">
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(enderecoDe(v))}`} target="_blank" rel="noopener noreferrer">
                      Google Maps
                    </a>
                    <a href={`https://waze.com/ul?q=${encodeURIComponent(enderecoDe(v))}&navigate=yes`} target="_blank" rel="noopener noreferrer">
                      Waze
                    </a>
                  </p>
                )}
                {(v.servico || v.descricao) && <p className="visita-descricao">{[v.servico, v.descricao].filter(Boolean).join(': ')}</p>}

                {PROXIMOS[v.status] && <BotoesStatus id={v.id} opcoes={PROXIMOS[v.status]!} />}
                {(v.status === 'em_andamento' || (v.status === 'finalizado' && v.data === hoje)) && (
                  <FotosVisita id={v.id} quantas={nFotos.get(v.id) ?? 0} />
                )}
                {v.status === 'em_andamento' && <Finalizar id={v.id} temPix={temPix} />}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  )
}

export const dynamic = 'force-dynamic'
