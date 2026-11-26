import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { mensalidade, PRECOS, reais } from '@ialaura/shared'
import { cobrancaAtiva, contarTecnicosAdicionais, sincronizar } from '@/lib/cobranca'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { siteUrl } from '@/lib/laura/lembretes'
import { exigirMembro } from '@/lib/sessao'
import { assinar } from './acoes'

export const metadata: Metadata = { title: 'Assinatura' }
export const dynamic = 'force-dynamic'

const STATUS = {
  pendente: 'Aguardando o primeiro pagamento',
  ativa: 'Ativa',
  inadimplente: 'Pagamento atrasado',
  cancelada: 'Cancelada',
} as const

type Assinatura = {
  status: keyof typeof STATUS
  isenta: boolean
  tecnicos_cobrados: number
  proxima_cobranca: string | null
  mp_preapproval_id: string | null
}

export default async function PaginaAssinatura({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; voltou?: string; novo?: string }>
}) {
  const { erro, voltou, novo } = await searchParams
  const { sb, membro } = await exigirMembro()
  if (membro.papel !== 'dono') redirect('/painel')

  const lerAssinatura = () =>
    sb
      .from('assinaturas')
      .select('status, isenta, tecnicos_cobrados, proxima_cobranca, mp_preapproval_id')
      .eq('empresa_id', membro.empresa_id)
      .maybeSingle<Assinatura>()

  let { data: a } = await lerAssinatura()
  // Voltou do Mercado Pago: confere na hora em vez de esperar o aviso.
  if (voltou && a?.mp_preapproval_id) {
    try {
      await sincronizar(a.mp_preapproval_id)
      a = (await lerAssinatura()).data
    } catch {
      // segue com o que tem; a rotina diária confere de novo
    }
  }
  const adicionais = await contarTecnicosAdicionais(membro.empresa_id)
  const admin = supabaseAdmin()
  const [{ data: minha }, { data: indicadas }] = await Promise.all([
    admin.from('empresas').select('slug').eq('id', membro.empresa_id).single<{ slug: string }>(),
    admin
      .from('empresas')
      .select('id, assinaturas(status, isenta), indicacao_recompensada_em')
      .eq('indicado_por', membro.empresa_id),
  ])
  const ind = (indicadas ?? []) as unknown as Array<{
    id: string
    assinaturas: { status: string; isenta: boolean } | null
    indicacao_recompensada_em: string | null
  }>
  const indPagando = ind.filter((i) => i.assinaturas?.status === 'ativa' && !i.assinaturas.isenta).length
  const linkIndicacao = minha ? `${siteUrl()}/i/${minha.slug}` : null
  const valor = mensalidade(Math.max(adicionais, a?.tecnicos_cobrados ?? 0))

  return (
    <div className="estreito sem-topo largura-media">
      <h1>{novo ? 'Último passo: assinatura' : 'Assinatura'}</h1>
      {novo && (
        <p className="apoio">
          Empresa cadastrada. Assine para a Laura começar a atender. Depois você preenche as configurações e liga o WhatsApp.
        </p>
      )}
      {erro && (
        <p className="aviso aviso-erro" role="alert">
          {erro}
        </p>
      )}

      <dl className="resumo painel">
        <div>
          <dt>Situação</dt>
          <dd>{a?.isenta ? 'Liberada sem cobrança' : STATUS[a?.status ?? 'pendente']}</dd>
        </div>
        <div>
          <dt>Plano</dt>
          <dd>
            IA Laura, <span className="numero">{reais(PRECOS.soloMensal)}</span> com 1 pessoa em campo
          </dd>
        </div>
        <div>
          <dt>Técnicos a mais</dt>
          <dd>
            <span className="numero">{adicionais}</span> × <span className="numero">{reais(PRECOS.tecnicoAdicional)}</span>
          </dd>
        </div>
        <div>
          <dt>Mensalidade</dt>
          <dd className="numero">{a?.isenta ? reais(0) : reais(valor)}</dd>
        </div>
        {a?.proxima_cobranca && (
          <div>
            <dt>Próxima cobrança</dt>
            <dd className="numero">{a.proxima_cobranca.split('-').reverse().join('/')}</dd>
          </div>
        )}
      </dl>

      {!a?.isenta && a?.status !== 'ativa' && (
        <form action={assinar} style={{ marginTop: 24 }}>
          <p className="comparacao">
            Dá cerca de <span className="numero">{reais(Math.round(valor / 30))}</span> por dia. Uma atendente com carteira assinada
            custa mais de R$ 2.500 por mês com os encargos e trabalha 8 horas por dia. A Laura responde a qualquer hora, inclusive
            à noite e no fim de semana, quando o cliente mais procura.
          </p>
          <button className="botao">Assinar pelo Mercado Pago</button>
          <p className="fraco" style={{ marginTop: 8 }}>
            Cobrança mensal no cartão. Ao adicionar um técnico, a próxima fatura já vem com ele. Ao remover, ele ainda
            aparece na fatura seguinte.
          </p>
        </form>
      )}
      {!cobrancaAtiva() && (
        <p className="aviso">Período de implantação: o sistema está liberado mesmo sem assinatura.</p>
      )}

      {linkIndicacao && (
        <section className="painel indique">
          <h2>Indique e ganhe um mês grátis</h2>
          <p>
            Conhece outro técnico ou assistência que perde cliente por demorar a responder no WhatsApp? Mande o seu link. Quando
            ele assinar, você ganha <strong>um mês da Laura sem pagar</strong>, e não tem limite de indicações.
          </p>
          <p className="indique-link numero">{linkIndicacao}</p>
          <a
            className="botao"
            href={`https://wa.me/?text=${encodeURIComponent(
              `Estou usando a IA Laura na minha assistência: ela responde os clientes no WhatsApp na hora, marca as visitas e confirma na véspera. Vale a pena conhecer: ${linkIndicacao}`,
            )}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Mandar pelo WhatsApp
          </a>
          <p className="fraco" style={{ marginTop: 10 }}>
            {ind.length === 0
              ? 'Nenhuma indicação ainda.'
              : `${ind.length} ${ind.length === 1 ? 'empresa entrou' : 'empresas entraram'} pelo seu link, ${indPagando} já ${indPagando === 1 ? 'assinou' : 'assinaram'}.`}
          </p>
        </section>
      )}
    </div>
  )
}
