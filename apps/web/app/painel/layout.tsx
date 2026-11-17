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
