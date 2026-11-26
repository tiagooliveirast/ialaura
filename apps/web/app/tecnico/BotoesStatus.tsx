'use client'

import { useRef, useState } from 'react'
import type { StatusAtendimento } from '@ialaura/shared'
import { informarStatus } from './acoes'

/**
 * Botões de andamento do técnico. Antes de enviar, pede a posição do celular (no máximo 5 segundos).
 * Se o técnico negar ou o GPS demorar, o status vai do mesmo jeito, sem localização.
 */
export function BotoesStatus({ id, opcoes }: { id: string; opcoes: Array<[StatusAtendimento, string]> }) {
  const form = useRef<HTMLFormElement>(null)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [escolhendoChegada, setEscolhendoChegada] = useState(false)

  function tocar(status: StatusAtendimento, chegada?: number) {
    const f = form.current
    if (!f || enviando) return
    // "Estou indo": antes pergunta em quanto tempo chega, para avisar o cliente com previsão.
    if (status === 'a_caminho' && chegada === undefined) {
      setEscolhendoChegada(true)
      return
    }
    setEnviando(status)
    ;(f.elements.namedItem('status') as HTMLInputElement).value = status
    ;(f.elements.namedItem('chegada') as HTMLInputElement).value = chegada ? String(chegada) : ''

    const enviar = (pos?: GeolocationPosition) => {
      if (pos) {
        ;(f.elements.namedItem('lat') as HTMLInputElement).value = String(pos.coords.latitude)
        ;(f.elements.namedItem('lng') as HTMLInputElement).value = String(pos.coords.longitude)
        ;(f.elements.namedItem('precisao') as HTMLInputElement).value = String(Math.round(pos.coords.accuracy))
      }
      f.requestSubmit()
    }

    if (!('geolocation' in navigator)) return enviar()
    navigator.geolocation.getCurrentPosition(enviar, () => enviar(), {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 60000,
    })
  }

  return (
    <form ref={form} action={informarStatus} className="visita-acoes">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" />
      <input type="hidden" name="lat" />
      <input type="hidden" name="lng" />
      <input type="hidden" name="precisao" />
      <input type="hidden" name="chegada" />
      {escolhendoChegada ? (
        <div className="chegada">
          <p className="finalizar-titulo">Chego em mais ou menos:</p>
          <div className="finalizar-opcoes">
            {[15, 30, 45, 60].map((min) => (
              <button
                key={min}
                type="button"
                className="botao"
                disabled={!!enviando}
                onClick={() => tocar('a_caminho', min)}
              >
                {enviando ? 'Enviando…' : min === 60 ? '1 hora' : `${min} min`}
              </button>
            ))}
            <button type="button" className="link-botao" onClick={() => setEscolhendoChegada(false)} disabled={!!enviando}>
              Voltar
            </button>
          </div>
        </div>
      ) : (
        opcoes.map(([status, rotulo], i) => (
        <button
          key={status}
          type="button"
          onClick={() => tocar(status)}
          disabled={!!enviando}
          className={i === 0 ? 'botao' : 'botao botao-claro'}
        >
          {enviando === status ? 'Enviando…' : rotulo}
        </button>
      ))
      )}
    </form>
  )
}
