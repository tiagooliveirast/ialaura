import type { Metadata } from 'next'
import Link from 'next/link'
import { reais } from '@ialaura/shared'
import { inicioDoPeriodo, PERIODOS_ADMIN, type Metricas } from '@/lib/metricas'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { exigirAdmin } from '../acoes'
import '../admin.css'

export const metadata: Metadata = { title: 'Card de resultados', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * Arte quadrada (1080 x 1080) com os números de todas as empresas, pronta para print e Instagram.
 * Só mostra o que tem número de verdade.
 */
export default async function Card({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  await exigirAdmin()
  const { periodo } = await searchParams
  const { inicio, dias, chave } = inicioDoPeriodo(periodo)
  const sb = supabaseAdmin()
  const [{ data: m }, { data: rec }, { count: empresas }] = await Promise.all([
    sb.rpc('metricas', { p_inicio: inicio }),
    sb.from('atendimentos').select('orcamento_centavos').eq('orcamento_status', 'recuperado').gte('recuperado_em', inicio),
    sb.from('whatsapp_contas').select('empresa_id', { count: 'exact', head: true }).eq('status', 'ativa'),
  ])
  const mt = m as Metricas | null
  const recuperado = (rec ?? []).reduce((t, r) => t + (r.orcamento_centavos ?? 0), 0)
  const quando = dias ? `nos últimos ${dias} dias` : 'desde o começo'

  const numeros = [
    mt && mt.visitas_laura > 0 && { valor: String(mt.visitas_laura), texto: 'visitas técnicas marcadas pela Laura, sem ninguém pegar no celular' },
    mt && mt.visitas_fora_horario > 0 && { valor: String(mt.visitas_fora_horario), texto: 'clientes atendidos à noite e no fim de semana' },
    recuperado > 0 && { valor: reais(recuperado), texto: 'em orçamentos que não tinham fechado e voltaram' },
    mt && mt.mensagens_laura > 0 && { valor: String(mt.mensagens_laura), texto: 'respostas no WhatsApp' },
  ].filter(Boolean) as Array<{ valor: string; texto: string }>

  return (
    <main className="largo admin">
      <p>
        <Link href="/admin" className="voltar">
          Voltar ao admin
        </Link>
      </p>
      <nav className="filtros filtros-admin" aria-label="Período">
        {PERIODOS_ADMIN.map(([k, rotulo]) => (
          <Link key={k} href={`/admin/card?periodo=${k}`} aria-current={k === chave ? 'page' : undefined}>
            {rotulo}
          </Link>
        ))}
      </nav>
      <p className="fraco">Tire um print do quadrado abaixo para postar.</p>

      <div className="card-ig">
        <p className="card-ig-marca">IA Laura</p>
        <h1 className="card-ig-titulo">O que a Laura fez pelas assistências técnicas {quando}</h1>
        {numeros.length === 0 ? (
          <p className="card-ig-texto">Os números aparecem quando as primeiras empresas começarem a usar.</p>
        ) : (
          <ul className="card-ig-lista">
            {numeros.slice(0, 3).map((n) => (
              <li key={n.texto}>
                <strong className="numero">{n.valor}</strong>
                <span>{n.texto}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="card-ig-rodape">
          {empresas ? `${empresas} ${empresas === 1 ? 'empresa' : 'empresas'} usando · ` : ''}@tiagooliveiratecnico
        </p>
      </div>
    </main>
  )
}
