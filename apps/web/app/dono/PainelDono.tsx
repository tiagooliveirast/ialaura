'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type Numero = { rotulo: string; valor: string; nota?: string; destaque?: boolean; alerta?: boolean }
type Tecnico = {
  id: string
  nome: string
  foto: string | null
  situacao: string
  emAtendimento: boolean
  feitas: number
  total: number
  mapa: string | null
  horario: string | null
}

export type Bloco =
  | { id: string; titulo: string; tipo: 'numeros'; numeros: Numero[] }
  | { id: string; titulo: string; tipo: 'tecnicos'; tecnicos: Tecnico[] }
  | { id: string; titulo: string; tipo: 'funil'; etapas: Array<{ rotulo: string; valor: number }> }

const CHAVE = 'laura-dono-ocultos'

function ler(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? '[]') as string[]
  } catch {
    return []
  }
}

/** Painel do Dono: o dono escolhe os blocos (guardado neste aparelho) e a tela se atualiza sozinha a cada minuto. */
export function PainelDono({
  empresa,
  blocos,
  modoTv,
  atualizadoEm,
  fuso,
}: {
  empresa: string
  blocos: Bloco[]
  modoTv: boolean
  atualizadoEm: string
  fuso: string
}) {
  const router = useRouter()
  const [ocultos, setOcultos] = useState<string[]>([])
  const [editando, setEditando] = useState(false)

  useEffect(() => setOcultos(ler()), [])
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 60_000)
    return () => clearInterval(t)
  }, [router])

  function alternar(id: string) {
    const novo = ocultos.includes(id) ? ocultos.filter((x) => x !== id) : [...ocultos, id]
    setOcultos(novo)
    try {
      localStorage.setItem(CHAVE, JSON.stringify(novo))
    } catch {
      // sem armazenamento: vale só nesta visita
    }
  }

  const hora = new Date(atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: fuso })

  return (
    <main className={`dono${modoTv ? ' dono-tv' : ''}`}>
      <header className="dono-topo">
        <div>
          <p className="dono-marca">Painel do Dono</p>
          <h1>{empresa}</h1>
        </div>
        <div className="dono-acoes">
          <span className="fraco">Atualizado às {hora}</span>
          {!modoTv && (
            <>
              <button type="button" className="link-botao" onClick={() => setEditando((e) => !e)}>
                {editando ? 'Pronto' : 'Escolher blocos'}
              </button>
              <Link href="/dono?tv=1" className="botao botao-claro">
                Modo TV
              </Link>
              <Link href="/painel" className="link-botao">
                Voltar ao painel
              </Link>
            </>
          )}
          {modoTv && (
            <Link href="/dono" className="link-botao dono-sair-tv">
              Sair do modo TV
            </Link>
          )}
        </div>
      </header>

      {editando && (
        <div className="dono-escolha">
          {blocos.map((b) => (
            <label key={b.id} className="marcar">
              <input type="checkbox" checked={!ocultos.includes(b.id)} onChange={() => alternar(b.id)} /> {b.titulo}
            </label>
          ))}
        </div>
      )}

      <div className="dono-grade">
        {blocos
          .filter((b) => !ocultos.includes(b.id))
          .map((b) => (
            <section key={b.id} className={`dono-bloco dono-${b.tipo}`}>
              <h2>{b.titulo}</h2>
              {b.tipo === 'numeros' && (
                <dl className="dono-numeros">
                  {b.numeros.map((n) => (
                    <div key={n.rotulo} className={`${n.destaque ? 'destaque' : ''}${n.alerta ? ' alerta' : ''}`}>
                      <dt>{n.rotulo}</dt>
                      <dd className="numero">{n.valor}</dd>
                      {n.nota && <p className="fraco">{n.nota}</p>}
                    </div>
                  ))}
                </dl>
              )}
              {b.tipo === 'tecnicos' &&
                (b.tecnicos.length === 0 ? (
                  <p className="fraco">Ninguém marcado como &quot;vai a campo&quot; em Equipe.</p>
                ) : (
                  <ul className="dono-tecnicos">
                    {b.tecnicos.map((t) => (
                      <li key={t.id} className={t.emAtendimento ? 'ativo' : undefined}>
                        {t.foto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={t.foto} alt="" className="avatar" width={40} height={40} />
                        ) : (
                          <span className="avatar avatar-vazio" aria-hidden="true">
                            {t.nome.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <div>
                          <strong>{t.nome}</strong>
                          <p>{t.situacao}</p>
                          <p className="fraco numero">
                            {t.feitas} de {t.total} visitas
                            {t.mapa && (
                              <>
                                {' · '}
                                <a href={t.mapa} target="_blank" rel="noopener noreferrer">
                                  posição às {t.horario}
                                </a>
                              </>
                            )}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ))}
              {b.tipo === 'funil' && (
                <ol className="dono-funil">
                  {b.etapas.map((e, i) => {
                    const max = Math.max(1, b.etapas[0]!.valor, ...b.etapas.map((x) => x.valor))
                    const anterior = i > 0 ? b.etapas[i - 1]!.valor : null
                    return (
                      <li key={e.rotulo}>
                        <span className="dono-funil-rotulo">{e.rotulo}</span>
                        <span className="dono-funil-barra">
                          <span style={{ width: `${Math.max(4, (e.valor / max) * 100)}%` }} />
                        </span>
                        <span className="numero dono-funil-valor">
                          {e.valor}
                          {anterior ? <small> · {Math.round((100 * e.valor) / anterior)}%</small> : null}
                        </span>
                      </li>
                    )
                  })}
                </ol>
              )}
            </section>
          ))}
      </div>
    </main>
  )
}
