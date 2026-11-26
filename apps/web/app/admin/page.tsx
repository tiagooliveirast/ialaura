import type { Metadata } from 'next'
import Link from 'next/link'
import { mensalidade, reais } from '@ialaura/shared'
import { inicioDoPeriodo, PERIODOS_ADMIN, type Metricas } from '@/lib/metricas'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { completude, lerConhecimento } from '@/lib/laura/conhecimento'
import { avaliarSaude } from '@/lib/saude'
import { alternarIsencao, exigirAdmin, marcarIndicacaoRecompensada } from './acoes'
import { BlocosMetricas } from './Metricas'
import './admin.css'

export const metadata: Metadata = { title: 'Admin', robots: { index: false } }
export const dynamic = 'force-dynamic'

type Empresa = {
  id: string
  nome: string
  slug: string
  cidade: string | null
  criado_em: string
  telefone: string | null
  conhecimento: unknown
  valor_visita_centavos: number | null
  indicado_por: string | null
  indicacao_recompensada_em: string | null
  assinaturas: { status: string; isenta: boolean; tecnicos_cobrados: number } | null
}

type PorEmpresa = {
  empresa_id: string
  conversas: number
  mensagens_laura: number
  visitas_laura: number
  visitas_fora_horario: number
  visitas_site: number
  pessoas: number
  ultima_atividade: string | null
  custo_micro_usd: number
  nps: number | null
}

const DOLAR = Number(process.env.COTACAO_DOLAR ?? '5.5')

function diasDesde(iso: string | null): number | null {
  return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000) : null
}

export default async function Admin({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  await exigirAdmin()
  const { periodo } = await searchParams
  const { inicio, dias, chave } = inicioDoPeriodo(periodo)
  const sb = supabaseAdmin()

  const [
    { data: empresas },
    { data: m },
    { data: porEmpresa },
    { data: whats },
    { data: servicosT },
    { data: areasT },
    { data: esperando },
    { data: recuperadosT },
    { data: donos },
  ] = await Promise.all([
    sb
      .from('empresas')
      .select(
        'id, nome, slug, cidade, criado_em, telefone, conhecimento, valor_visita_centavos, indicado_por, indicacao_recompensada_em, assinaturas(status, isenta, tecnicos_cobrados)',
      )
      .order('criado_em', { ascending: false }),
    sb.rpc('metricas', { p_inicio: inicio }),
    sb.rpc('metricas_por_empresa', { p_inicio: inicio }),
    sb.from('whatsapp_contas').select('empresa_id, status'),
    sb.from('servicos').select('empresa_id'),
    sb.from('areas_atendimento').select('empresa_id'),
    sb.from('conversas').select('empresa_id').eq('estado', 'humano'),
    sb.from('atendimentos').select('empresa_id, orcamento_centavos').eq('orcamento_status', 'recuperado').gte('recuperado_em', inicio),
    sb.from('membros').select('empresa_id, nome, telefone').eq('papel', 'dono').eq('ativo', true),
  ])
  const contar = (l: Array<{ empresa_id: string }> | null) => {
    const mapa = new Map<string, number>()
    for (const x of l ?? []) mapa.set(x.empresa_id, (mapa.get(x.empresa_id) ?? 0) + 1)
    return mapa
  }
  const nServ = contar(servicosT)
  const nArea = contar(areasT)
  const nEsperando = contar(esperando)
  const recuperados = (recuperadosT ?? []) as Array<{ empresa_id: string; orcamento_centavos: number | null }>
  const valorRecuperado = recuperados.reduce((t, r) => t + (r.orcamento_centavos ?? 0), 0)
  const donoDe = new Map((donos ?? []).map((d) => [d.empresa_id, d as { nome: string; telefone: string | null }]))

  const lista = (empresas ?? []) as unknown as Empresa[]
  const metricas = m as Metricas | null
  const linhas = new Map(((porEmpresa ?? []) as PorEmpresa[]).map((p) => [p.empresa_id, p]))
  const whatsDe = new Map((whats ?? []).map((w) => [w.empresa_id, w.status]))

  const pagantes = lista.filter((e) => e.assinaturas?.status === 'ativa' && !e.assinaturas.isenta)
  const mrr = pagantes.reduce((s, e) => s + mensalidade(e.assinaturas!.tecnicos_cobrados), 0)
  const isentas = lista.filter((e) => e.assinaturas?.isenta).length
  const atrasadas = lista.filter((e) => e.assinaturas?.status === 'inadimplente').length
  const canceladas = lista.filter((e) => e.assinaturas?.status === 'cancelada').length
  const novas = lista.filter((e) => e.criado_em >= inicio).length
  const comWhats = lista.filter((e) => whatsDe.get(e.id) === 'ativa').length
  const custoReais = ((metricas?.custo_ia_micro_usd ?? 0) / 1_000_000) * DOLAR
  const saude = lista
    .filter((e) => e.assinaturas?.status !== 'cancelada')
    .map((e) => {
      const p = linhas.get(e.id)
      const c = lerConhecimento(e.conhecimento)
      return {
        e,
        s: avaliarSaude({
          whatsappLigado: whatsDe.get(e.id) === 'ativa',
          treino: completude(c, e.valor_visita_centavos != null, (nServ.get(e.id) ?? 0) > 0, (nArea.get(e.id) ?? 0) > 0),
          diasSemUso: diasDesde(p?.ultima_atividade ?? null),
          conversasEsperando: nEsperando.get(e.id) ?? 0,
          inadimplente: e.assinaturas?.status === 'inadimplente',
          semVisitaNoPeriodo: (p?.visitas_laura ?? 0) === 0,
          diasDeCasa: diasDesde(e.criado_em) ?? 0,
        }),
      }
    })
    .filter((x) => x.s.nivel !== 'bem')
    .sort((a, b) => a.s.nota - b.s.nota)

  const nomeDe = new Map(lista.map((e) => [e.id, e.nome]))
  const aRecompensar = lista.filter(
    (e) => e.indicado_por && !e.indicacao_recompensada_em && e.assinaturas?.status === 'ativa' && !e.assinaturas.isenta,
  )
  const totalIndicadas = lista.filter((e) => e.indicado_por).length

  const paradas = lista.filter((e) => {
    const d = diasDesde(linhas.get(e.id)?.ultima_atividade ?? null)
    return e.assinaturas?.status === 'ativa' && (d == null || d >= 7)
  })

  return (
    <main className="largo admin">
      <div className="cabecalho">
        <div>
          <h1>Admin da IA Laura</h1>
          <p className="apoio">
            Números de toda a plataforma. <Link href={`/admin/card?periodo=${chave}`}>Gerar card para o Instagram</Link>
          </p>
        </div>
        <nav className="filtros filtros-admin" aria-label="Período">
          {PERIODOS_ADMIN.map(([k, rotulo]) => (
            <Link key={k} href={`/admin?periodo=${k}`} aria-current={k === chave ? 'page' : undefined}>
              {rotulo}
            </Link>
          ))}
        </nav>
      </div>

      <section className="secao-admin">
        <h2>Negócio</h2>
        <dl className="indicadores">
          <div className="indicador destaque">
            <dt>Receita mensal recorrente</dt>
            <dd className="numero">{reais(mrr)}</dd>
            <p className="fraco">Só a IA Laura, assinaturas ativas e pagas</p>
          </div>
          <div className="indicador">
            <dt>Empresas pagando</dt>
            <dd className="numero">{pagantes.length}</dd>
            <p className="fraco">de {lista.length} cadastradas</p>
          </div>
          <div className="indicador">
            <dt>Novas no período</dt>
            <dd className="numero">{novas}</dd>
          </div>
          <div className="indicador">
            <dt>WhatsApp ligado</dt>
            <dd className="numero">{comWhats}</dd>
          </div>
          <div className="indicador">
            <dt>Pagamento atrasado</dt>
            <dd className="numero">{atrasadas}</dd>
            <p className="fraco">{canceladas} canceladas · {isentas} liberadas sem cobrança</p>
          </div>
          <div className="indicador">
            <dt>Custo de IA no período</dt>
            <dd className="numero">{reais(Math.round(custoReais * 100))}</dd>
            <p className="fraco">Dólar a R$ {DOLAR.toFixed(2).replace('.', ',')} (COTACAO_DOLAR)</p>
          </div>
        </dl>
      </section>

      {metricas ? (
        <BlocosMetricas m={metricas} dias={dias} />
      ) : (
        <p className="aviso aviso-erro">Não foi possível calcular os números. Confira se a migração 0006 foi aplicada.</p>
      )}

      <section className="secao-admin">
        <h2>Orçamentos recuperados pela Laura</h2>
        <dl className="indicadores">
          <div className="indicador destaque">
            <dt>Consertos que voltaram</dt>
            <dd className="numero">{recuperados.length}</dd>
            <p className="fraco">Cliente não fechou na visita e marcou depois que a Laura retomou</p>
          </div>
          <div className="indicador">
            <dt>Valor recuperado</dt>
            <dd className="numero">{reais(valorRecuperado)}</dd>
            <p className="fraco">Soma dos orçamentos, em todas as empresas</p>
          </div>
        </dl>
      </section>

      <section className="secao-admin">
        <h2>Clientes que podem cancelar</h2>
        {saude.length === 0 ? (
          <p className="fraco">Nenhuma empresa com sinal de risco agora.</p>
        ) : (
          <ul className="saude">
            {saude.map(({ e, s: sd }) => {
              const dono = donoDe.get(e.id)
              const tel = dono?.telefone ?? e.telefone
              return (
                <li key={e.id} className={`saude-item saude-${sd.nivel}`}>
                  <div>
                    <Link href={`/admin/empresa/${e.id}?periodo=${chave}`}>
                      <strong>{e.nome}</strong>
                    </Link>
                    <span className="fraco"> · {dono?.nome ?? 'dono sem nome'}</span>
                    <p className="fraco">{sd.motivos.join(' · ')}</p>
                  </div>
                  <div className="saude-acoes">
                    <span className="numero saude-nota">{sd.nota}</span>
                    {tel && (
                      <a
                        className="link-botao"
                        href={`https://wa.me/${tel.replace(/\D/g, '')}?text=${encodeURIComponent(
                          `Oi, ${dono?.nome?.split(' ')[0] ?? 'tudo bem'}! Aqui é o Tiago, da IA Laura. Vi que ${sd.motivos[0]} e quero te ajudar a deixar a Laura funcionando 100%. Posso te ligar 5 minutinhos?`,
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Chamar no WhatsApp
                      </a>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="secao-admin">
        <h2>Indicações</h2>
        <p className="fraco">
          {totalIndicadas} empresas entraram por indicação. Cada indicação que assina dá um mês grátis a quem indicou.
        </p>
        {aRecompensar.length > 0 ? (
          <ul className="alertas">
            {aRecompensar.map((e) => (
              <li key={e.id}>
                Dar um mês grátis para <strong>{nomeDe.get(e.indicado_por!) ?? 'empresa removida'}</strong>: indicou{' '}
                {e.nome}, que já assinou.
                <form action={marcarIndicacaoRecompensada} style={{ display: 'inline', marginLeft: 8 }}>
                  <input type="hidden" name="empresa" value={e.id} />
                  <button className="link-botao">Já dei</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="fraco">Nenhum mês grátis pendente.</p>
        )}
      </section>

      <section className="secao-admin">
        <h2>Atenção</h2>
        <ul className="alertas">
          <li>
            <strong className="numero">{paradas.length}</strong> empresas pagantes sem uso há 7 dias ou mais
            {paradas.length > 0 && <span className="fraco">: {paradas.map((e) => e.nome).join(', ')}</span>}
          </li>
          <li>
            <strong className="numero">{metricas?.fila_com_erro ?? 0}</strong> mensagens do WhatsApp com erro na fila
          </li>
          <li>
            <strong className="numero">{metricas?.lembretes_falhos ?? 0}</strong> lembretes que falharam 3 vezes
          </li>
        </ul>
      </section>

      <section className="secao-admin">
        <h2>Empresas</h2>
        <div className="painel rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Assinatura</th>
                <th>Conversas</th>
                <th>Visitas Laura</th>
                <th>Fora do horário</th>
                <th>NPS</th>
                <th>Último uso</th>
                <th>IA</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => {
                const p = linhas.get(e.id)
                const d = diasDesde(p?.ultima_atividade ?? null)
                return (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/admin/empresa/${e.id}?periodo=${chave}`}>{e.nome}</Link>
                      <br />
                      <span className="fraco">
                        {e.cidade ?? 'sem cidade'} · {p?.pessoas ?? 0} pessoas · WhatsApp {whatsDe.get(e.id) ?? 'não ligado'}
                      </span>
                    </td>
                    <td>
                      {e.assinaturas?.isenta ? 'Isenta' : (e.assinaturas?.status ?? 'sem registro')}
                      {e.assinaturas?.tecnicos_cobrados ? (
                        <span className="fraco numero"> · +{e.assinaturas.tecnicos_cobrados} téc.</span>
                      ) : null}
                    </td>
                    <td className="numero">{p?.conversas ?? 0}</td>
                    <td className="numero">{p?.visitas_laura ?? 0}</td>
                    <td className="numero">{p?.visitas_fora_horario ?? 0}</td>
                    <td className="numero">{p?.nps ?? '–'}</td>
                    <td className={`numero ${d != null && d >= 7 ? 'texto-atencao' : ''}`}>
                      {d == null ? 'nunca' : d === 0 ? 'hoje' : `${d} d`}
                    </td>
                    <td className="numero">US$ {((p?.custo_micro_usd ?? 0) / 1_000_000).toFixed(2)}</td>
                    <td>
                      <form action={alternarIsencao}>
                        <input type="hidden" name="empresa" value={e.id} />
                        <input type="hidden" name="isenta" value={e.assinaturas?.isenta ? '0' : '1'} />
                        <button className="link-botao">{e.assinaturas?.isenta ? 'Voltar a cobrar' : 'Liberar grátis'}</button>
                      </form>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
