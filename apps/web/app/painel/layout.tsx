import Link from 'next/link'
import { redirect } from 'next/navigation'
import { exigirMembro } from '@/lib/sessao'
import { sair } from '../entrar/acoes'

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const { membro, empresa } = await exigirMembro()
  if (membro.papel === 'tecnico') redirect('/tecnico')

  return (
    <>
      <header className="barra">
        <div className="barra-dentro">
          <Link href="/painel" className="barra-empresa">
            {empresa.nome}
          </Link>
          <nav className="barra-menu" aria-label="Painel">
            <Link href="/painel">Atendimentos</Link>
            <Link href="/painel/conversas">Conversas</Link>
            {membro.papel === 'dono' && <Link href="/painel/equipe">Equipe</Link>}
            {membro.papel === 'dono' && <Link href="/painel/configuracoes">Configurações</Link>}
          </nav>
          <form action={sair}>
            <span className="barra-usuario">{membro.nome}</span>
            <button className="link-botao">Sair</button>
          </form>
        </div>
      </header>
      <main className="largo">
        {children}
      </main>
    </>
  )
}
