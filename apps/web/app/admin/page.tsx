import type { Metadata } from 'next'
import Link from 'next/link'
import { reais } from '@ialaura/shared'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { alternarIsencao, exigirAdmin } from './acoes'

export const metadata: Metadata = { title: 'Admin', robots: { index: false } }
export const dynamic = 'force-dynamic'

type Linha = {
  id: string
  nome: string
  slug: string
  cidade: string | null
  criado_em: string
  assinaturas: { status: string; isenta: boolean; tecnicos_cobrados: number } | null
}

/** Painel do dono da plataforma: todas as empresas, situação da assinatura e custo de IA no mês. */
export default async function Admin() {
  await exigirAdmin()
  const sb = supabaseAdmin()
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const [{ data: empresas }, { data: uso }, { data: whats }] = await Promise.all([
    sb
      .from('empresas')
      .select('id, nome, slug, cidade, criado_em, assinaturas(status, isenta, tecnicos_cobrados)')
      .order('criado_em', { ascending: false }),
    sb.from('uso_ia').select('empresa_id, custo_micro_usd').gte('criado_em', inicioMes),
    sb.from('whatsapp_contas').select('empresa_id, status'),
  ])

  const custo = new Map<string, number>()
  for (const u of uso ?? []) custo.set(u.empresa_id, (custo.get(u.empresa_id) ?? 0) + Number(u.custo_micro_usd))
  const whatsDe = new Map((whats ?? []).map((w) => [w.empresa_id, w.status]))
  const lista = (empresas ?? []) as unknown as Linha[]
  const pagantes = lista.filter((e) => e.assinaturas?.status === 'ativa' && !e.assinaturas.isenta).length

  return (
    <main className="largo">
      <h1>Admin da IA Laura</h1>
      <p className="apoio">
        <span className="numero">{lista.length}</span> empresas, <span className="numero">{pagantes}</span> pagando.
        Custo de IA em dólar, no mês.
      </p>
      <div className="painel rolagem" style={{ marginTop: 20 }}>
        <table className="tabela">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Assinatura</th>
              <th>WhatsApp</th>
              <th>IA no mês</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.id}>
                <td>
                  {e.nome}
                  <br />
                  <Link href={`/a/${e.slug}`} className="fraco">
                    /a/{e.slug}
                  </Link>
                  {e.cidade ? <span className="fraco"> · {e.cidade}</span> : null}
                </td>
                <td>
                  {e.assinaturas?.isenta ? 'Isenta' : (e.assinaturas?.status ?? 'sem registro')}
                  {e.assinaturas?.tecnicos_cobrados ? (
                    <span className="fraco numero"> · +{e.assinaturas.tecnicos_cobrados} téc.</span>
                  ) : null}
                </td>
                <td>{whatsDe.get(e.id) ?? <span className="fraco">não ligado</span>}</td>
                <td className="numero">US$ {((custo.get(e.id) ?? 0) / 1_000_000).toFixed(2)}</td>
                <td>
                  <form action={alternarIsencao}>
                    <input type="hidden" name="empresa" value={e.id} />
                    <input type="hidden" name="isenta" value={e.assinaturas?.isenta ? '0' : '1'} />
                    <button className="link-botao">{e.assinaturas?.isenta ? 'Voltar a cobrar' : 'Liberar sem cobrança'}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fraco" style={{ marginTop: 8 }}>
        Mensalidade base hoje: {reais(43700)}.
      </p>
    </main>
  )
}
