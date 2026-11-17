import Link from 'next/link'
import { exigirMembro } from '@/lib/sessao'
import { sair } from '../entrar/acoes'

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const { membro, empresa } = await exigirMembro()

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
        {membro.papel === 'tecnico' ? (
          <p className="aviso">
            Sua conta é de técnico. A agenda do técnico fica em um aplicativo próprio, que ainda está em construção.
          </p>
        ) : (
          children
        )}
      </main>
    </>
  )
}
