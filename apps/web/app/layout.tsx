import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Public_Sans } from 'next/font/google'
import './globals.css'

const texto = Public_Sans({ subsets: ['latin'], variable: '--fonte-texto', display: 'swap' })
const titulo = Bricolage_Grotesque({ subsets: ['latin'], variable: '--fonte-display', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'IA Laura', template: '%s · IA Laura' },
  description:
    'Atendimento no WhatsApp, agendamento online e site para assistências técnicas. A Laura responde o cliente e marca a visita.',
}

export const viewport: Viewport = {
  themeColor: '#12233f',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${texto.variable} ${titulo.variable}`}>
      <body
        style={{
          ['--fonte' as string]: 'var(--fonte-texto), system-ui, sans-serif',
          ['--fonte-titulo' as string]: 'var(--fonte-display), var(--fonte)',
        }}
      >
        {children}
      </body>
    </html>
  )
}
