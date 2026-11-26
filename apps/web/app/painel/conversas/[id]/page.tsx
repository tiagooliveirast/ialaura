import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { exigirMembro } from '@/lib/sessao'
import { mudarEstado, responder } from '../acoes'
import { salvarLicao } from '../../laura/acoes-licoes'

export const metadata: Metadata = { title: 'Conversa' }
export const dynamic = 'force-dynamic'

type Mensagem = { id: number; autor: 'cliente' | 'ia' | 'humano' | 'sistema'; conteudo: string | null; tipo: string; criado_em: string }

const AUTOR = { cliente: 'Cliente', ia: 'Laura', humano: 'Equipe', sistema: 'Sistema' } as const

export default async function Conversa({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ erro?: string; licao?: string }>
}) {
  const { id } = await params
  const { erro, licao } = await searchParams
  const { sb, membro, empresa } = await exigirMembro()
  const podeEnsinar = membro.papel === 'dono'

  const { data: conversa } = await sb
    .from('conversas')
    .select('id, wa_telefone, estado, cliente:clientes(nome, endereco, bairro)')
    .eq('id', id)
    .maybeSingle()
  if (!conversa) notFound()
  const c = conversa as unknown as {
    id: string
    wa_telefone: string
    estado: 'ia' | 'humano' | 'encerrada'
    cliente: { nome: string; endereco: string | null; bairro: string | null } | null
  }

  const { data } = await sb
    .from('mensagens')
    .select('id, autor, conteudo, tipo, criado_em')
    .eq('conversa_id', id)
    .order('criado_em', { ascending: true })
    .limit(300)
  const mensagens = (data ?? []) as Mensagem[]

  return (
    <div className="conversa-tela">
      <p>
        <Link href="/painel/conversas" className="voltar">
          Voltar para conversas
        </Link>
      </p>
      <div className="cabecalho">
        <div>
          <h1>{c.cliente?.nome ?? `+${c.wa_telefone}`}</h1>
          <p className="apoio numero">
            +{c.wa_telefone}
            {c.cliente?.endereco ? ` · ${[c.cliente.endereco, c.cliente.bairro].filter(Boolean).join(', ')}` : ''}
          </p>
        </div>
        <form action={mudarEstado} className="acoes-conversa">
          <input type="hidden" name="id" value={c.id} />
          {c.estado === 'ia' ? (
            <button name="estado" value="humano" className="botao">
              Assumir conversa
            </button>
          ) : (
            <button name="estado" value="ia" className="botao botao-claro">
              Devolver para a Laura
            </button>
          )}
          {c.estado !== 'encerrada' && (
            <button name="estado" value="encerrada" className="link-botao">
              Encerrar
            </button>
          )}
        </form>
      </div>

      {erro && (
        <p className="aviso aviso-erro" role="alert">
          {erro}
        </p>
      )}
      {licao && <p className="aviso aviso-ok">Lição guardada. A Laura passa a responder assim nas próximas conversas.</p>}
      {c.estado === 'humano' && (
        <p className="aviso">A Laura está fora desta conversa. Ela só volta a responder se você devolver.</p>
      )}

      <ol className="mensagens painel">
        {mensagens.map((m, i) => (
          <li key={m.id} className={`balao balao-${m.autor}`}>
            <span className="balao-autor">
              {AUTOR[m.autor]}
              {m.tipo === 'audio' && m.conteudo ? ' · áudio transcrito' : ''}
              {m.tipo === 'modelo' ? ' · mensagem automática' : ''}
              {m.tipo === 'image' && m.autor === 'cliente' ? ' · foto (descrição da Laura)' : ''}
            </span>
            {m.conteudo ?? <em className="fraco">[{m.tipo}: conteúdo não suportado]</em>}
            <time className="numero">
              {new Date(m.criado_em).toLocaleString('pt-BR', {
                timeZone: empresa.fuso,
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
            {podeEnsinar && m.autor === 'ia' && m.conteudo && (
              <details className="ensinar">
                <summary className="link-botao">Eu responderia diferente</summary>
                <form action={salvarLicao} className="formulario">
                  <input type="hidden" name="origem" value="correcao" />
                  <input type="hidden" name="conversa_id" value={c.id} />
                  <input type="hidden" name="resposta_laura" value={m.conteudo} />
                  <input type="hidden" name="volta" value={`/painel/conversas/${c.id}`} />
                  <label className="campo">
                    <span>Quando o cliente disser algo como</span>
                    <input
                      name="situacao"
                      maxLength={600}
                      required
                      defaultValue={[...mensagens.slice(0, i)].reverse().find((x) => x.autor === 'cliente')?.conteudo ?? ''}
                    />
                  </label>
                  <label className="campo">
                    <span>Responda assim</span>
                    <textarea name="resposta_ideal" rows={3} maxLength={2000} required />
                  </label>
                  <button className="botao">Guardar lição</button>
                </form>
              </details>
            )}
          </li>
        ))}
      </ol>

      <form action={responder} className="formulario">
        <input type="hidden" name="id" value={c.id} />
        <label className="campo">
          <span>Responder pelo WhatsApp da empresa</span>
          <textarea name="texto" rows={3} maxLength={4000} required />
        </label>
        <button className="botao">Enviar</button>
      </form>
    </div>
  )
}
