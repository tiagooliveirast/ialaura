import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { responderPesquisa } from './acoes'

export const metadata: Metadata = { title: 'Como foi o atendimento?', robots: { index: false } }
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function Pesquisa({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ erro?: string; obrigado?: string; google?: string }>
}) {
  const { token } = await params
  const { erro, obrigado, google } = await searchParams
  if (!UUID.test(token)) notFound()

  const { data } = await supabaseAdmin()
    .from('pesquisas')
    .select('respondido_em, empresa:empresas(nome, link_avaliacao_google), atendimento:atendimentos(tecnico:membros(nome))')
    .eq('token', token)
    .maybeSingle()
  if (!data) notFound()
  const p = data as unknown as {
    respondido_em: string | null
    empresa: { nome: string; link_avaliacao_google: string | null } | null
    atendimento: { tecnico: { nome: string } | null } | null
  }
  const empresa = p.empresa?.nome ?? 'a empresa'
  const tecnico = p.atendimento?.tecnico?.nome?.split(' ')[0]

  if (obrigado || p.respondido_em) {
    return (
      <main className="estreito">
        <p className="marca">{empresa}</p>
        <h1>Obrigado pela resposta</h1>
        {google && p.empresa?.link_avaliacao_google ? (
          <>
            <p className="apoio">
              Que bom que gostou. Se puder, conte isso no Google: ajuda muito quem está procurando um técnico de confiança.
            </p>
            <p style={{ marginTop: 24 }}>
              <a className="botao" href={p.empresa.link_avaliacao_google} rel="noopener">
                Avaliar no Google
              </a>
            </p>
          </>
        ) : (
          <p className="apoio">Sua opinião vai direto para o responsável pela empresa.</p>
        )}
      </main>
    )
  }

  return (
    <main className="estreito">
      <p className="marca">{empresa}</p>
      <h1>Como foi o atendimento?</h1>
      <p className="apoio">Leva menos de um minuto.</p>
      {erro && (
        <p className="aviso aviso-erro" role="alert">
          {erro}
        </p>
      )}
      <form className="formulario" action={responderPesquisa.bind(null, token)}>
        <fieldset className="escala">
          <legend>De 0 a 10, quanto você indicaria a {empresa} para um amigo?</legend>
          <div>
            {Array.from({ length: 11 }, (_, n) => (
              <label key={n}>
                <input type="radio" name="nps" value={n} required />
                <span>{n}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="escala">
          <legend>Que nota você dá {tecnico ? `ao técnico ${tecnico}` : 'ao técnico'}?</legend>
          <div>
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n}>
                <input type="radio" name="tecnico" value={n} required />
                <span>{n}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="opcoes">
          <legend>O técnico chegou no horário combinado?</legend>
          <label>
            <input type="radio" name="pontual" value="sim" /> Sim
          </label>
          <label>
            <input type="radio" name="pontual" value="nao" /> Não
          </label>
        </fieldset>
        <fieldset className="opcoes">
          <legend>O problema foi resolvido?</legend>
          <label>
            <input type="radio" name="resolvido" value="sim" /> Sim
          </label>
          <label>
            <input type="radio" name="resolvido" value="parcial" /> Em parte
          </label>
          <label>
            <input type="radio" name="resolvido" value="nao" /> Não
          </label>
        </fieldset>
        <label className="campo">
          <span>Quer contar mais alguma coisa?</span>
          <textarea name="comentario" rows={3} maxLength={1000} />
        </label>
        <button className="botao">Enviar resposta</button>
      </form>
    </main>
  )
}
