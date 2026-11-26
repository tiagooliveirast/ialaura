import type { Metadata } from 'next'
import Link from 'next/link'
import { criarConta, entrar, entrarComGoogle } from './acoes'

export const metadata: Metadata = { title: 'Entrar' }

/**
 * O Google está ligado no banco compartilhado com a Helô.
 * Enquanto o site usa o banco de teste (sem LAURA_SUPABASE_URL), o botão fica escondido.
 */
function googleDisponivel(): boolean {
  return !!process.env.LAURA_SUPABASE_URL || process.env.GOOGLE_LOGIN === '1'
}

function BotaoGoogle({ rotulo }: { rotulo: string }) {
  return (
    <form action={entrarComGoogle} className="formulario">
      <button className="botao botao-claro botao-google">
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
          <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
        </svg>
        {rotulo}
      </button>
    </form>
  )
}

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; aviso?: string; modo?: string }>
}) {
  const { erro, aviso, modo } = await searchParams
  const cadastro = modo === 'cadastro'
  const google = googleDisponivel()

  return (
    <main className="estreito">
      <p className="marca">
        <Link href="/" className="sem-sublinhado">
          IA Laura
        </Link>
      </p>
      <h1>{cadastro ? 'Criar sua conta' : 'Entrar'}</h1>
      {cadastro && (
        <p className="apoio">Três passos: sua conta, os dados da empresa e a assinatura. Leva uns 3 minutos.</p>
      )}

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

      {google && (
        <>
          <BotaoGoogle rotulo={cadastro ? 'Criar conta com o Google' : 'Entrar com o Google'} />
          <p className="divisor">
            <span>ou com e-mail e senha</span>
          </p>
        </>
      )}

      <form className={`formulario ${google ? 'sem-margem-topo' : ''}`}>
        <label className="campo">
          <span>E-mail</span>
          <input name="email" type="email" autoComplete="email" inputMode="email" required />
        </label>
        <label className="campo">
          <span>Senha</span>
          <input
            name="senha"
            type="password"
            autoComplete={cadastro ? 'new-password' : 'current-password'}
            minLength={8}
            required
          />
          <small>Pelo menos 8 caracteres.</small>
        </label>

        {cadastro ? (
          <button className="botao" formAction={criarConta}>
            Criar conta
          </button>
        ) : (
          <button className="botao" formAction={entrar}>
            Entrar
          </button>
        )}
      </form>

      <p className="troca-modo">
        {cadastro ? (
          <>
            Já tem conta? <Link href="/entrar">Entrar</Link>
          </>
        ) : (
          <>
            Ainda não tem conta? <Link href="/entrar?modo=cadastro">Criar conta</Link>
          </>
        )}
      </p>
    </main>
  )
}
