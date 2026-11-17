import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { supabaseServidor } from '@/lib/supabase/server'
import { criarEmpresa } from './acoes'

export const metadata: Metadata = { title: 'Cadastrar empresa' }

export default async function Comecar({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  const sb = await supabaseServidor()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) redirect('/entrar')

  const { data: jaTem } = await sb.from('membros').select('id').eq('user_id', user.id).limit(1).maybeSingle()
  if (jaTem) redirect('/painel')

  return (
    <main className="estreito">
      <p className="marca">IA Laura</p>
      <h1>Cadastre a sua empresa</h1>
      <p className="apoio">São cinco campos. O resto você ajusta depois, com calma.</p>

      {erro && (
        <p className="aviso aviso-erro" role="alert">
          {erro}
        </p>
      )}

      <form className="formulario" action={criarEmpresa}>
        <label className="campo">
          <span>Nome da empresa</span>
          <input name="nome" required maxLength={80} autoComplete="organization" />
        </label>
        <label className="campo">
          <span>Seu nome</span>
          <input name="meuNome" required maxLength={80} autoComplete="name" />
        </label>
        <label className="campo">
          <span>WhatsApp da empresa, com DDD</span>
          <input name="telefone" type="tel" inputMode="tel" required autoComplete="tel" />
        </label>
        <div className="dupla">
          <label className="campo">
            <span>Cidade</span>
            <input name="cidade" required maxLength={80} autoComplete="address-level2" />
          </label>
          <label className="campo campo-curto">
            <span>UF</span>
            <input name="uf" required maxLength={2} autoComplete="address-level1" autoCapitalize="characters" />
          </label>
        </div>
        <button className="botao">Cadastrar empresa</button>
      </form>
    </main>
  )
}
