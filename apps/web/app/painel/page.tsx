import type { Metadata } from 'next'
import Link from 'next/link'
import {
  dataCurta,
  hojeEm,
  ROTULO_PERIODO,
  ROTULO_STATUS,
  STATUS_ATENDIMENTO,
  type Periodo,
  type StatusAtendimento,
} from '@ialaura/shared'
import { exigirMembro } from '@/lib/sessao'
import { mudarStatus } from './acoes'

export const metadata: Metadata = { title: 'Atendimentos' }

type Linha = {
  id: string
  data: string
  periodo: Periodo
  status: StatusAtendimento
  descricao: string | null
  cliente: { nome: string; telefone: string; bairro: string | null } | null
  tecnico_id: string | null
  tecnico: { nome: string } | null
}

const ABERTOS: StatusAtendimento[] = ['agendado', 'confirmado', 'a_caminho', 'atrasado', 'em_andamento']

const FILTROS = [
  ['abertos', 'Em aberto'],
  ['finalizado', 'Finalizados'],
  ['cancelado', 'Cancelados'],
  ['todos', 'Todos'],
] as const

export default async function Painel({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string; erro?: string }>
}) {
  const { ver = 'abertos', erro } = await searchParams
  const { sb, empresa } = await exigirMembro()
  const hoje = hojeEm(empresa.fuso)

  let consulta = sb
    .from('atendimentos')
    .select('id, data, periodo, status, descricao, tecnico_id, cliente:clientes(nome, telefone, bairro), tecnico:membros(nome)')
    .order('data')
    .order('periodo')
    .limit(200)

  if (ver === 'abertos') consulta = consulta.in('status', ABERTOS)
  else if (ver === 'finalizado') consulta = consulta.eq('status', 'finalizado').order('data', { ascending: false })
  else if (ver === 'cancelado') consulta = consulta.in('status', ['cancelado', 'nao_compareceu'])

  const [{ data, error }, { data: equipe }] = await Promise.all([
    consulta,
    sb.from('membros').select('id, nome').eq('empresa_id', empresa.id).eq('ativo', true).eq('atende', true).order('nome'),
  ])
  const tecnicos = (equipe ?? []) as Array<{ id: string; nome: string }>
  const linhas = (data ?? []) as unknown as Linha[]
  const deHoje = linhas.filter((l) => l.data === hoje).length

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Atendimentos</h1>
          <p className="apoio">
            <span className="numero">{linhas.length}</span> na lista, <span className="numero">{deHoje}</span> para hoje.
          </p>
          <p className="apoio">
            Link para o cliente agendar sozinho:{' '}
            <Link href={`/a/${empresa.slug}`} className="numero">
              /a/{empresa.slug}
            </Link>
          </p>
        </div>
        <Link className="botao" href="/painel/novo">
          Marcar visita
        </Link>
      </div>

      {(erro || error) && (
        <p className="aviso aviso-erro" role="alert">
          {erro ?? `Não foi possível carregar os atendimentos: ${error?.message}`}
        </p>
      )}

      <nav className="filtros" aria-label="Filtrar atendimentos">
        {FILTROS.map(([chave, rotulo]) => (
          <Link key={chave} href={`/painel?ver=${chave}`} aria-current={ver === chave ? 'page' : undefined}>
            {rotulo}
          </Link>
        ))}
      </nav>

      {linhas.length === 0 ? (
        <p className="vazio">
          {ver === 'abertos' ? 'Nenhuma visita em aberto. Marque a primeira pelo botão acima.' : 'Nada por aqui.'}
        </p>
      ) : (
        <div className="painel rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Cliente</th>
                <th>Serviço</th>
                <th colSpan={2}>Técnico e status</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className={l.data < hoje && ABERTOS.includes(l.status) ? 'vencido' : undefined}>
                  <td className="numero sem-quebra">
                    {l.data === hoje ? 'Hoje' : dataCurta(l.data)}
                    <br />
                    <span className="fraco">{ROTULO_PERIODO[l.periodo]}</span>
                  </td>
                  <td>
                    {l.cliente?.nome ?? 'Cliente removido'}
                    <br />
                    <span className="fraco numero">
                      {[l.cliente?.bairro, l.cliente?.telefone].filter(Boolean).join(' · ')}
                    </span>
                  </td>
                  <td className="descricao">{l.descricao ?? <span className="fraco">Sem descrição</span>}</td>
                  <td colSpan={2}>
                    <form action={mudarStatus} className="status">
                      <input type="hidden" name="id" value={l.id} />
                      {tecnicos.length > 0 ? (
                        <select name="tecnico" defaultValue={l.tecnico_id ?? ''} aria-label="Técnico">
                          <option value="">Técnico a definir</option>
                          {tecnicos.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.nome}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="fraco">{l.tecnico?.nome ?? 'Sem técnico'}</span>
                      )}
                      <select name="status" defaultValue={l.status} aria-label={`Status de ${l.cliente?.nome ?? 'atendimento'}`}>
                        {STATUS_ATENDIMENTO.map((s) => (
                          <option key={s} value={s}>
                            {ROTULO_STATUS[s]}
                          </option>
                        ))}
                      </select>
                      <button className="link-botao">Salvar</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
