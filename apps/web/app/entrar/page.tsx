import type { Metadata } from 'next'
import { criarConta, entrar } from './acoes'

export const metadata: Metadata = { title: 'Entrar' }

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; aviso?: string }>
}) {
  const { erro, aviso } = await searchParams

  return (
    <main className="estreito">
      <p className="marca">IA Laura</p>
      <h1>Entrar</h1>

      {erro && (
        <p className="aviso aviso-erro" role="alert">
          {erro}
        </p>
      )}
      {aviso === 'bloqueado' && (
        <p className="aviso" role="status">
          O acesso da sua empresa está pausado. Fale com o responsável.
        </p>
      )}
      {aviso === 'confirme' && (
        <p className="aviso" role="status">
          Conta criada. Abra o link que enviamos para o seu e-mail e depois entre aqui.
        </p>
      )}

      <form className="formulario">
        <label className="campo">
          <span>E-mail</span>
          <input name="email" type="email" autoComplete="email" inputMode="email" required />
        </label>
        <label className="campo">
          <span>Senha</span>
          <input name="senha" type="password" autoComplete="current-password" minLength={8} required />
          <small>Pelo menos 8 caracteres.</small>
        </label>

        <button className="botao" formAction={entrar}>
          Entrar
        </button>
        <button className="botao botao-claro" formAction={criarConta}>
          Criar conta com esses dados
        </button>
      </form>
    </main>
  )
}
