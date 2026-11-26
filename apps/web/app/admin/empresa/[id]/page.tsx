import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { inicioDoPeriodo, PERIODOS_ADMIN, type Metricas } from '@/lib/metricas'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { exigirAdmin } from '../../acoes'
import { BlocosMetricas } from '../../Metricas'
import '../../admin.css'

export const metadata: Metadata = { title: 'Empresa · Admin', robots: { index: false } }
export const dynamic = 'force-dynamic'

/** Estudo de caso de uma empresa: os números dela para virar depoimento e prova social. */
export default async function EmpresaAdmin({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ periodo?: string }>
}) {
  await exigirAdmin()
  const { id } = await params
  const { periodo } = await searchParams
  const { inicio, dias, chave } = inicioDoPeriodo(periodo)
  const sb = supabaseAdmin()

  const { data: empresa } = await sb.from('empresas').select('id, nome, cidade, uf, slug, criado_em').eq('id', id).maybeSingle()
  if (!empresa) notFound()
  const { data: m } = await sb.rpc('metricas', { p_inicio: inicio, p_empresa: id })

  return (
    <main className="largo admin">
      <p>
        <Link href={`/admin?periodo=${chave}`} className="voltar">
          Voltar para o admin
        </Link>
      </p>
      <div className="cabecalho">
        <div>
          <h1>{empresa.nome}</h1>
          <p className="apoio">
            {[empresa.cidade, empresa.uf].filter(Boolean).join(' - ') || 'Sem cidade'} · cliente desde{' '}
            {new Date(empresa.criado_em).toLocaleDateString('pt-BR')} · <Link href={`/a/${empresa.slug}`}>ver site</Link>
          </p>
        </div>
        <nav className="filtros filtros-admin" aria-label="Período">
          {PERIODOS_ADMIN.map(([k, rotulo]) => (
            <Link key={k} href={`/admin/empresa/${id}?periodo=${k}`} aria-current={k === chave ? 'page' : undefined}>
              {rotulo}
            </Link>
          ))}
        </nav>
      </div>
      {m ? (
        <BlocosMetricas m={m as Metricas} dias={dias} sujeito={`Na ${empresa.nome}, a Laura`} />
      ) : (
        <p className="aviso aviso-erro">Não foi possível calcular os números desta empresa.</p>
      )}
      <p className="fraco" style={{ marginTop: 24 }}>
        Antes de usar o nome da empresa em público, peça autorização ao dono.
      </p>
    </main>
  )
}
