'use client'

import { useRef, useState, useTransition } from 'react'
import type { Turno } from '@/lib/laura/atendente'
import { responderSimulacao } from './acoes'

type Linha = Turno | { autor: 'sistema'; texto: string }

const SUGESTOES = [
  'Boa tarde, minha geladeira parou de gelar. Vocês atendem no meu bairro?',
  'Quanto custa a visita?',
  'Quero instalar um ar-condicionado de 12 mil BTUs, quanto fica?',
  'Quero falar com uma pessoa',
]

export function Simulador({ nome }: { nome: string }) {
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [texto, setTexto] = useState('')
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
      const r = await responderSimulacao(turnos)
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
