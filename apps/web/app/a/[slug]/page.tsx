import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { dataCurta, hojeEm, PERIODOS, reais, ROTULO_PERIODO, type Periodo } from '@ialaura/shared'
import { proximosDias as diasDeAtendimento } from '@/lib/laura/agenda'
import { lerConhecimento } from '@/lib/laura/conhecimento'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { pedirVisita } from './acoes'

export const dynamic = 'force-dynamic'

type Empresa = {
  id: string
  nome: string
  cidade: string | null
  uf: string | null
  fuso: string
  valor_visita_centavos: number | null
  conhecimento: unknown
}

async function buscar(slug: string) {
  const { data } = await supabaseAdmin()
    .from('empresas')
    .select('id, nome, cidade, uf, fuso, valor_visita_centavos, conhecimento')
    .eq('slug', slug)
    .maybeSingle<Empresa>()
  return data
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const empresa = await buscar((await params).slug)
  if (!empresa) return { title: 'Empresa não encontrada' }
  const onde = [empresa.cidade, empresa.uf].filter(Boolean).join(', ')
  return {
    title: `${empresa.nome}: agendar visita`,
    description: `Agende uma visita técnica com ${empresa.nome}${onde ? ` em ${onde}` : ''}.`,
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
  const dias = diasDeAtendimento(hojeEm(empresa.fuso), 7, lerConhecimento(empresa.conhecimento))
  const combinacoes = dias.flatMap((data) => PERIODOS.map((periodo) => ({ data, periodo })))
  const vagas = await Promise.all(
    combinacoes.map(async ({ data, periodo }) => {
      const { data: livres } = await sb.rpc('vagas_livres', { p_empresa: empresa.id, p_data: data, p_periodo: periodo })
      return { data, periodo: periodo as Periodo, livres: typeof livres === 'number' ? livres : 0 }
    }),
  )
  const disponiveis = vagas.filter((v) => v.livres > 0)
  const onde = [empresa.cidade, empresa.uf].filter(Boolean).join(', ')

  return (
    <main className="estreito">
      <p className="marca">{empresa.nome}</p>
      <h1>Agendar visita técnica</h1>
      <p className="apoio">
        {onde && <>Atendimento em {onde}. </>}
        {empresa.valor_visita_centavos != null && (
          <>
            Valor da visita: <span className="numero">{reais(empresa.valor_visita_centavos)}</span>.
          </>
        )}
      </p>

      {erro && (
        <p className="aviso aviso-erro" role="alert">
          {erro}
        </p>
      )}

      {disponiveis.length === 0 ? (
        <p className="aviso">A agenda dos próximos 7 dias está cheia. Tente de novo amanhã.</p>
      ) : (
        <form className="formulario" action={pedirVisita.bind(null, slug)}>
          <fieldset className="horarios">
            <legend>Quando fica bom para você?</legend>
            {disponiveis.map((v) => (
              <label key={`${v.data}|${v.periodo}`}>
                <input type="radio" name="quando" value={`${v.data}|${v.periodo}`} required />
                <span>
                  {dataCurta(v.data)} · {ROTULO_PERIODO[v.periodo]}
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
    </main>
  )
}
