'use client'

import { useRef, useState, useTransition } from 'react'
import type { Turno } from '@/lib/laura/atendente'
import { responderSimulacao } from './acoes'
import { ensinarNoSimulador } from './acoes-licoes'

type Linha = Turno | { autor: 'sistema'; texto: string }

const SUGESTOES = [
  'Boa tarde, minha geladeira parou de gelar. Vocês atendem no meu bairro?',
  'Quanto custa a visita?',
  'Quero instalar um ar-condicionado de 12 mil BTUs, quanto fica?',
  'Quero falar com uma pessoa',
  'Não vou poder amanhã, meu pai faleceu ontem',
  'Tá saindo um cheiro de queimado da máquina de lavar',
  'Preciso remarcar',
]

function Ensinar({ situacao, respostaLaura }: { situacao: string; respostaLaura: string }) {
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [quando, setQuando] = useState(situacao)
  const [estado, setEstado] = useState<'livre' | 'salvo' | string>('livre')
  const [pendente, iniciar] = useTransition()

  if (estado === 'salvo') return <span className="ensinar-ok">Lição guardada. Ela já responde assim na próxima.</span>
  if (!aberto) {
    return (
      <button type="button" className="link-botao ensinar-abrir" onClick={() => setAberto(true)}>
        Eu responderia diferente
      </button>
    )
  }
  return (
    <div className="ensinar">
      <label className="campo">
        <span>Quando o cliente disser algo como</span>
        <input value={quando} onChange={(e) => setQuando(e.target.value)} maxLength={600} />
      </label>
      <label className="campo">
        <span>Responda assim</span>
        <textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={2000} />
      </label>
      {estado !== 'livre' && <p className="aviso aviso-erro">{estado}</p>}
      <div className="ensinar-acoes">
        <button
          type="button"
          className="botao"
          disabled={pendente || !texto.trim()}
          onClick={() =>
            iniciar(async () => {
              const r = await ensinarNoSimulador({ situacao: quando, resposta_ideal: texto, resposta_laura: respostaLaura })
              setEstado(r.ok ? 'salvo' : (r.erro ?? 'Não foi possível salvar.'))
            })
          }
        >
          Guardar lição
        </button>
        <button type="button" className="link-botao" onClick={() => setAberto(false)}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

export function Simulador({ nome }: { nome: string }) {
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [texto, setTexto] = useState('')
  const [comVisita, setComVisita] = useState(false)
  const [pendente, iniciar] = useTransition()
  const fim = useRef<HTMLLIElement>(null)

  function enviar(mensagem: string) {
    const m = mensagem.trim()
    if (!m || pendente) return
    const novas: Linha[] = [...linhas, { autor: 'cliente', texto: m }]
    setLinhas(novas)
    setTexto('')
    iniciar(async () => {
      const turnos = novas.filter((l): l is Turno => l.autor !== 'sistema')
      const r = await responderSimulacao(turnos, comVisita)
      const depois: Linha[] = [...novas]
      if (r.erro) depois.push({ autor: 'sistema', texto: r.erro })
      for (const a of r.acoes) depois.push({ autor: 'sistema', texto: a })
      if (r.resposta) depois.push({ autor: 'laura', texto: r.resposta })
      setLinhas(depois)
      setTimeout(() => fim.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
    })
  }

  return (
    <div className="simulador painel">
      <div className="simulador-topo">
        <strong>Testar a {nome}</strong>
        <span className="fraco">Você escreve como cliente. Nada é salvo nem enviado.</span>
        {linhas.length > 0 && (
          <button type="button" className="link-botao" onClick={() => setLinhas([])}>
            Recomeçar
          </button>
        )}
        <label className="simulador-opcao">
          <input type="checkbox" checked={comVisita} onChange={(e) => setComVisita(e.target.checked)} /> Cliente já tem visita
          marcada (para testar remarcação)
        </label>
      </div>
      <ol className="mensagens simulador-mensagens">
        {linhas.length === 0 && (
          <li className="simulador-vazio">
            <p className="fraco">Comece com uma destas ou escreva a sua:</p>
            {SUGESTOES.map((s) => (
              <button key={s} type="button" className="sugestao" onClick={() => enviar(s)}>
                {s}
              </button>
            ))}
          </li>
        )}
        {linhas.map((l, i) =>
          l.autor === 'sistema' ? (
            <li key={i} className="balao-sistema">
              {l.texto}
            </li>
          ) : (
            <li key={i} className={`balao ${l.autor === 'cliente' ? 'balao-cliente' : 'balao-ia'}`}>
              <span className="balao-autor">{l.autor === 'cliente' ? 'Cliente (você)' : nome}</span>
              {l.texto}
              {l.autor === 'laura' && (
                <Ensinar
                  situacao={[...linhas.slice(0, i)].reverse().find((x) => x.autor === 'cliente')?.texto ?? ''}
                  respostaLaura={l.texto}
                />
              )}
            </li>
          ),
        )}
        {pendente && <li className="balao balao-ia digitando">{nome} está escrevendo…</li>}
        <li ref={fim} aria-hidden="true" />
      </ol>
      <form
        className="simulador-envio"
        onSubmit={(e) => {
          e.preventDefault()
          enviar(texto)
        }}
      >
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder=""
          aria-label="Mensagem do cliente"
          maxLength={2000}
        />
        <button className="botao" disabled={pendente || !texto.trim()}>
          Enviar
        </button>
      </form>
    </div>
  )
}
