'use client'

import { useState } from 'react'
import { finalizarVisita } from './acoes'

type Resultado = 'aprovado' | 'pensando' | 'recusado'

const OPCOES: Array<[Resultado, string]> = [
  ['aprovado', 'Fiz o serviço'],
  ['pensando', 'Cliente vai pensar'],
  ['recusado', 'Cliente não quis'],
]

/**
 * Finalizar a visita dizendo como ficou o orçamento.
 * Se o cliente não fechou, a Laura retoma a conversa com ele em 3 dias.
 */
export function Finalizar({ id, temPix }: { id: string; temPix: boolean }) {
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [enviando, setEnviando] = useState(false)

  return (
    <form
      action={finalizarVisita}
      className="finalizar"
      onSubmit={(e) => {
        if (enviando) return e.preventDefault()
        setEnviando(true)
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="resultado" value={resultado ?? ''} />
      <p className="finalizar-titulo">Como ficou?</p>
      <div className="finalizar-opcoes">
        {OPCOES.map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            className={`chip${resultado === valor ? ' chip-on' : ''}`}
            aria-pressed={resultado === valor}
            onClick={() => setResultado(valor)}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {resultado && (
        <>
          <label className="campo">
            <span>{resultado === 'aprovado' ? 'Valor cobrado (opcional)' : 'Valor do orçamento'}</span>
            <input name="valor" inputMode="decimal" maxLength={10} required={resultado !== 'aprovado'} />
          </label>
          {resultado === 'aprovado' && temPix && (
            <label className="marcar">
              <input type="checkbox" name="pix" defaultChecked /> Mandar a cobrança por Pix no WhatsApp do cliente (se tiver valor)
            </label>
          )}
          {resultado !== 'aprovado' && (
            <>
              <label className="campo">
                <span>O que pesou para o cliente? (opcional)</span>
                <input name="motivo" maxLength={300} />
              </label>
              <p className="fraco">A Laura volta a falar com o cliente em 3 dias para tentar fechar o conserto.</p>
            </>
          )}
          <button className="botao" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Finalizar visita'}
          </button>
        </>
      )}
    </form>
  )
}
