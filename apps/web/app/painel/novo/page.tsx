import type { Metadata } from 'next'
import Link from 'next/link'
import { hojeEm, PERIODOS, ROTULO_PERIODO } from '@ialaura/shared'
import { exigirMembro } from '@/lib/sessao'
import { criarAtendimento } from '../acoes'

export const metadata: Metadata = { title: 'Marcar visita' }

export default async function Novo({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  const { empresa } = await exigirMembro()
  const hoje = hojeEm(empresa.fuso)

  return (
    <div className="estreito sem-topo">
      <p>
        <Link href="/painel" className="voltar">
          Voltar para atendimentos
        </Link>
      </p>
      <h1>Marcar visita</h1>

      {erro && (
        <p className="aviso aviso-erro" role="alert">
          {erro}
        </p>
      )}

      <form className="formulario" action={criarAtendimento}>
        <label className="campo">
          <span>Nome do cliente</span>
          <input name="nome" required maxLength={120} autoComplete="off" />
        </label>
        <label className="campo">
          <span>WhatsApp do cliente, com DDD</span>
          <input name="telefone" type="tel" inputMode="tel" required autoComplete="off" />
        </label>
        <label className="campo">
          <span>Endereço (rua e número)</span>
          <input name="endereco" required maxLength={240} autoComplete="off" />
        </label>
        <label className="campo">
          <span>Bairro</span>
          <input name="bairro" maxLength={80} autoComplete="off" />
        </label>
        <div className="dupla">
          <label className="campo">
            <span>Dia</span>
            <input name="data" type="date" required min={hoje} defaultValue={hoje} />
          </label>
          <label className="campo">
            <span>Período</span>
            <select name="periodo" required defaultValue={PERIODOS[0]}>
              {PERIODOS.map((p) => (
                <option key={p} value={p}>
                  {ROTULO_PERIODO[p]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="campo">
          <span>O que o cliente relatou</span>
          <textarea name="descricao" rows={3} maxLength={1000} />
        </label>
        <button className="botao">Marcar visita</button>
      </form>
    </div>
  )
}
