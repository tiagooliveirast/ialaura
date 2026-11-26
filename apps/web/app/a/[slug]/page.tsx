import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { dataCurta, hojeEm, reais, ROTULO_PERIODO } from '@ialaura/shared'
import { proximosDias, vagasDisponiveis } from '@/lib/laura/agenda'
import { lerConhecimento } from '@/lib/laura/conhecimento'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { pedirVisita } from './acoes'
import './site.css'

export const dynamic = 'force-dynamic'

type Empresa = {
  id: string
  nome: string
  telefone: string | null
  cidade: string | null
  uf: string | null
  fuso: string
  valor_visita_centavos: number | null
  conhecimento: unknown
}

async function buscar(slug: string) {
  const { data } = await supabaseAdmin()
    .from('empresas')
    .select('id, nome, telefone, cidade, uf, fuso, valor_visita_centavos, conhecimento')
    .eq('slug', slug)
    .maybeSingle<Empresa>()
  return data
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const empresa = await buscar((await params).slug)
  if (!empresa) return { title: 'Empresa não encontrada' }
  const onde = [empresa.cidade, empresa.uf].filter(Boolean).join(' - ')
  return {
    title: { absolute: `${empresa.nome}${onde ? ` | Assistência técnica em ${onde}` : ''}` },
    description: `${empresa.nome}: conserto, manutenção e instalação${onde ? ` em ${onde}` : ''}. Agende sua visita técnica online.`,
  }
}

export default async function Site({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ erro?: string }>
}) {
  const { slug } = await params
  const { erro } = await searchParams
  const empresa = await buscar(slug)
  if (!empresa) notFound()

  const sb = supabaseAdmin()
  const c = lerConhecimento(empresa.conhecimento)
  const hoje = hojeEm(empresa.fuso)
  const [{ data: servicos }, { data: areas }, vagas] = await Promise.all([
    sb.from('servicos').select('nome').eq('empresa_id', empresa.id).eq('ativo', true).order('nome'),
    sb.from('areas_atendimento').select('bairro, cidade').eq('empresa_id', empresa.id),
    vagasDisponiveis(sb, empresa.id, proximosDias(hoje, 7, c)),
  ])
  const onde = [empresa.cidade, empresa.uf].filter(Boolean).join(' - ')
  const whats = empresa.telefone ? `https://wa.me/${empresa.telefone}` : null

  const detalhes = [
    empresa.valor_visita_centavos != null ? ['Visita técnica', reais(empresa.valor_visita_centavos)] : null,
    c.pagamento ? ['Pagamento', c.pagamento] : null,
    c.garantia ? ['Garantia', c.garantia] : null,
    c.horario ? ['Horário', c.horario] : null,
  ].filter(Boolean) as Array<[string, string]>

  return (
    <div className="site">
      <header className="site-topo">
        <div className="site-faixa site-topo-dentro">
          <span className="site-marca">{empresa.nome}</span>
          {whats && (
            <a className="site-whats" href={whats} rel="noopener">
              Chamar no WhatsApp
            </a>
          )}
        </div>
      </header>

      <main>
        <section className="site-faixa site-abertura">
          {onde && <p className="sobretitulo">Assistência técnica em {onde}</p>}
          <h1>Conserto e manutenção com visita marcada na hora.</h1>
          <p className="apoio">
            Escolha o dia e o período que fica melhor para você. A confirmação chega pelo WhatsApp.
          </p>
          <p style={{ marginTop: 24 }}>
            <a className="botao botao-grande" href="#agendar">
              Agendar visita
            </a>
          </p>
        </section>

        {(servicos?.length || detalhes.length) ? (
          <section className="site-faixa site-colunas">
            {servicos && servicos.length > 0 && (
              <div>
                <h2>Serviços</h2>
                <ul className="site-lista">
                  {servicos.map((s) => (
                    <li key={s.nome}>{s.nome}</li>
                  ))}
                </ul>
              </div>
            )}
            {detalhes.length > 0 && (
              <div>
                <h2>Como funciona</h2>
                <dl className="site-detalhes">
                  {detalhes.map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </section>
        ) : null}

        {areas && areas.length > 0 && (
          <section className="site-faixa site-area">
            <h2>Onde atendemos</h2>
            <p>{areas.map((a) => (a.bairro ? `${a.bairro} (${a.cidade})` : a.cidade)).join(' · ')}</p>
          </section>
        )}

        <section id="agendar" className="site-agendar">
          <div className="site-faixa site-faixa-estreita">
            <h2>Agendar visita técnica</h2>
            {erro && (
              <p className="aviso aviso-erro" role="alert">
                {erro}
              </p>
            )}
            {vagas.length === 0 ? (
              <p className="aviso">
                A agenda dos próximos dias está cheia.{' '}
                {whats ? (
                  <a href={whats} rel="noopener">
                    Chame no WhatsApp
                  </a>
                ) : (
                  'Tente de novo amanhã'
                )}
                .
              </p>
            ) : (
              <form className="formulario" action={pedirVisita.bind(null, slug)}>
                <fieldset className="horarios">
                  <legend>Quando fica bom para você?</legend>
                  {vagas.map((v) => (
                    <label key={`${v.data}|${v.periodo}`}>
                      <input type="radio" name="quando" value={`${v.data}|${v.periodo}`} required />
                      <span>
                        {v.data === hoje ? 'Hoje' : dataCurta(v.data)} · {ROTULO_PERIODO[v.periodo]}
                      </span>
                    </label>
                  ))}
                </fieldset>
                <label className="campo">
                  <span>Seu nome</span>
                  <input name="nome" required maxLength={120} autoComplete="name" />
                </label>
                <label className="campo">
                  <span>WhatsApp, com DDD</span>
                  <input name="telefone" type="tel" inputMode="tel" required autoComplete="tel" />
                </label>
                <label className="campo">
                  <span>Endereço (rua e número)</span>
                  <input name="endereco" required maxLength={240} autoComplete="street-address" />
                </label>
                <label className="campo">
                  <span>Bairro</span>
                  <input name="bairro" maxLength={80} />
                </label>
                <label className="campo">
                  <span>Qual aparelho e o que está acontecendo</span>
                  <textarea name="descricao" rows={3} maxLength={1000} />
                </label>
                {/* Campo-isca contra robôs: fica fora da tela e do teclado. */}
                <input type="text" name="site" tabIndex={-1} autoComplete="off" aria-hidden="true" className="isca" />
                <button className="botao">Pedir visita</button>
              </form>
            )}
          </div>
        </section>
      </main>

      <footer className="site-rodape">
        <div className="site-faixa">
          {empresa.nome}
          {onde ? ` · ${onde}` : ''}
          <span className="fraco"> · Site e agendamento por IA Laura</span>
        </div>
      </footer>
    </div>
  )
}
