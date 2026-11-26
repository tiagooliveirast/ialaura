import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { empresaLiberada } from '@/lib/cobranca'
import { exigirMembro } from '@/lib/sessao'
import { sair } from '../entrar/acoes'

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const { membro, empresa } = await exigirMembro()
  if (membro.papel === 'tecnico') redirect('/tecnico')
  const caminho = (await headers()).get('x-caminho') ?? ''
  if (!caminho.startsWith('/painel/assinatura') && !(await empresaLiberada(empresa.id))) {
    redirect(membro.papel === 'dono' ? '/painel/assinatura' : '/entrar?aviso=bloqueado')
  }

  return (
    <>
      <header className="barra">
        <div className="barra-dentro">
          <Link href="/painel" className="barra-empresa">
            {empresa.nome}
          </Link>
          <nav className="barra-menu" aria-label="Painel">
            <Link href="/painel">Início</Link>
            <Link href="/painel/atendimentos">Atendimentos</Link>
            <Link href="/painel/conversas">Conversas</Link>
            <Link href="/painel/laura">Treinar a Laura</Link>
            {membro.papel === 'dono' && <Link href="/painel/equipe">Equipe</Link>}
            {membro.papel === 'dono' && <Link href="/painel/configuracoes">Configurações</Link>}
            {membro.papel === 'dono' && <Link href="/painel/assinatura">Assinatura</Link>}
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
