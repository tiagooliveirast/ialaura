'use client'

import { useState, useTransition } from 'react'
import { enviarFotos } from './acoes'

/** Reduz a foto no próprio celular (lado maior 1600 px, JPEG) para subir rápido mesmo com sinal fraco. */
async function reduzir(arquivo: File): Promise<Blob> {
  const img = await createImageBitmap(arquivo)
  const escala = Math.min(1, 1600 / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * escala)
  canvas.height = Math.round(img.height * escala)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('foto'))), 'image/jpeg', 0.8))
}

/** Fotos de antes e depois do serviço. Protegem o técnico numa reclamação e viram conteúdo para o Instagram. */
export function FotosVisita({ id, quantas }: { id: string; quantas: number }) {
  const [momento, setMomento] = useState<'antes' | 'depois'>(quantas > 0 ? 'depois' : 'antes')
  const [msg, setMsg] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function escolher(lista: FileList | null) {
    if (!lista?.length) return
    setMsg(null)
    iniciar(async () => {
      try {
        const dados = new FormData()
        dados.set('id', id)
        dados.set('momento', momento)
        for (const f of Array.from(lista).slice(0, 6)) dados.append('fotos', await reduzir(f), 'foto.jpg')
        const r = await enviarFotos(dados)
        setMsg(r.ok ? `${r.enviadas} foto(s) de ${momento} guardada(s).` : (r.erro ?? 'Não foi possível enviar.'))
      } catch {
        setMsg('Não foi possível ler a foto. Tente tirar de novo.')
      }
    })
  }

  return (
    <div className="fotos-visita">
      <p className="finalizar-titulo">Fotos {quantas > 0 ? `(${quantas} guardadas)` : ''}</p>
      <div className="finalizar-opcoes">
        {(['antes', 'depois'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={`chip${momento === m ? ' chip-on' : ''}`}
            aria-pressed={momento === m}
            onClick={() => setMomento(m)}
          >
            {m === 'antes' ? 'Antes do serviço' : 'Depois do serviço'}
          </button>
        ))}
      </div>
      <label className="botao botao-claro fotos-botao">
        {pendente ? 'Enviando…' : 'Tirar ou escolher fotos'}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          disabled={pendente}
          onChange={(e) => {
            escolher(e.target.files)
            e.target.value = ''
          }}
        />
      </label>
      {msg && <p className="fraco">{msg}</p>}
    </div>
  )
}
