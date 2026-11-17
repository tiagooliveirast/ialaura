import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Pedido recebido' }

export default async function Pronto({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return (
    <main className="estreito">
      <h1>Pedido recebido</h1>
      <p className="apoio">A empresa vai confirmar a visita pelo seu WhatsApp. Você não precisa fazer mais nada.</p>
      <p style={{ marginTop: 24 }}>
        <Link href={`/a/${slug}`} className="voltar">
          Fazer outro pedido
        </Link>
      </p>
    </main>
  )
}
