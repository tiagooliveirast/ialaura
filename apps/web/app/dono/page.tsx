import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { hojeEm, PRECOS, reais, ROTULO_STATUS, type StatusAtendimento } from '@ialaura/shared'
import { empresaLiberada } from '@/lib/cobranca'
import { dinheiroDoMes, resumoHelo, temHelo } from '@/lib/dono'
import { inicioDoDia } from '@/lib/laura/resumo'
import type { Metricas } from '@/lib/metricas'
import { exigirMembro } from '@/lib/sessao'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { PainelDono, type Bloco } from './PainelDono'
import './dono.css'

export const metadata: Metadata = { title: 'Painel do Dono' }
export const dynamic = 'force-dynamic'

type VisitaHoje = {
  id: string
  periodo: 'manha' | 'tarde'
  status: StatusAtendimento
  tecnico_id: string | null
  cliente: { bairro: string | null } | null
}

const HELO_URL = process.env.HELO_URL ?? 'https://refriclube.app.br'

export default async function Dono({ searchParams }: { searchParams: Promise<{ tv?: string }> }) {
  const { tv } = await searchParams
  const { user, membro, empresa } = await exigirMembro()
  if (membro.papel !== 'dono') redirect('/painel')

  const [laura, comHelo] = await Promise.all([empresaLiberada(empresa.id), temHelo(user.id)])
  if (!laura || !comHelo) {
    return (
      <main className="estreito dono-bloqueado">
        <p>
          <Link href="/painel" className="voltar">
            Voltar ao painel
          </Link>
        </p>
        <h1>Painel do Dono</h1>
        <p className="apoio">
          A visão completa da sua empresa numa tela só: técnicos na rua, faturamento e lucro do mês, funil de atendimento, qualidade
          e agenda. Dá para deixar aberto numa TV na oficina.
        </p>
        <p>
          Ele aparece para quem usa a <strong>IA Laura</strong> e a <strong>Helô</strong> juntas, porque junta o atendimento da Laura
          com o financeiro da Helô. As duas juntas saem por {reais(PRECOS.comboHeloMensal)} por mês.
        </p>
        <ul className="dono-falta">
          <li className={laura ? 'ok' : undefined}>IA Laura {laura ? 'ativa' : 'sem assinatura ativa'}</li>
          <li className={comHelo ? 'ok' : undefined}>Helô {comHelo ? 'ativa' : 'não encontrada nesta conta'}</li>
        </ul>
        {!comHelo && (
          <>
            <p className="fraco">
              Use o mesmo e-mail nas duas. Se você já usa a Helô com outro e-mail, fale com o suporte para juntar as contas.
            </p>
            <a className="botao" href={HELO_URL} target="_blank" rel="noopener noreferrer">
              Conhecer a Helô
            </a>
          </>
        )}
      </main>
    )
  }

  const admin = supabaseAdmin()
  const hoje = hojeEm(empresa.fuso)
  const [a, m] = hoje.split('-').map(Number)
  const inicioMesData = `${a}-${String(m).padStart(2, '0')}-01`
  const inicioMes = new Date(Date.UTC(a!, m! - 1, 1)).toISOString()

  const [visitasHoje, equipe, metricas, doMes, dinheiro, notas, config, eventos, helo] = await Promise.all([
    admin
      .from('atendimentos')
      .select('id, periodo, status, tecnico_id, cliente:clientes(bairro)')
      .eq('empresa_id', empresa.id)
      .eq('data', hoje)
      .neq('status', 'cancelado'),
    admin.from('membros').select('id, nome, foto_url').eq('empresa_id', empresa.id).eq('ativo', true).eq('atende', true),
    admin.rpc('metricas', { p_inicio: inicioMes, p_empresa: empresa.id }),
    admin
      .from('atendimentos')
      .select('status, valor_centavos, orcamento_status, data')
      .eq('empresa_id', empresa.id)
      .gte('data', inicioMesData)
      .lte('data', hoje),
    dinheiroDoMes(user.id, inicioMesData),
    admin.from('pesquisas').select('nota_nps').eq('empresa_id', empresa.id).gte('respondido_em', inicioMes).not('nota_nps', 'is', null),
    admin.from('empresas').select('mostrar_valores_tv').eq('id', empresa.id).single<{ mostrar_valores_tv: boolean }>(),
    admin
      .from('atendimento_eventos')
      .select('atendimento_id, status, lat, lng, criado_em')
      .eq('empresa_id', empresa.id)
      .gte('criado_em', inicioDoDia(empresa.fuso))
      .order('criado_em', { ascending: false }),
    resumoHelo(user.id, inicioMesData, hoje),
  ])

  const modoTv = tv === '1'
  const mostrarValores = !modoTv || config.data?.mostrar_valores_tv === true
  const mt = metricas.data as Metricas | null
  const visitas = (visitasHoje.data ?? []) as unknown as VisitaHoje[]
  const pessoas = (equipe.data ?? []) as Array<{ id: string; nome: string; foto_url: string | null }>
  const evs = (eventos.data ?? []) as Array<{ atendimento_id: string; status: string; lat: number | null; lng: number | null; criado_em: string }>

  // Técnicos: visita atual (a caminho / em andamento), quantas fez e última posição do dia.
  const tecnicos = pessoas.map((p) => {
    const minhas = visitas.filter((v) => v.tecnico_id === p.id)
    const atual = minhas.find((v) => ['a_caminho', 'em_andamento', 'atrasado'].includes(v.status))
    const ids = new Set(minhas.map((v) => v.id))
    const ultimo = evs.find((e) => ids.has(e.atendimento_id) && e.lat != null && e.lng != null)
    return {
      id: p.id,
      nome: p.nome.split(/\s+/)[0] ?? p.nome,
      foto: p.foto_url,
      situacao: atual ? `${ROTULO_STATUS[atual.status]}${atual.cliente?.bairro ? ` · ${atual.cliente.bairro}` : ''}` : minhas.length ? 'Entre visitas' : 'Sem visitas hoje',
      emAtendimento: !!atual,
      feitas: minhas.filter((v) => v.status === 'finalizado').length,
      total: minhas.length,
      mapa: ultimo ? `https://www.google.com/maps?q=${ultimo.lat},${ultimo.lng}` : null,
      horario: ultimo ? new Date(ultimo.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: empresa.fuso }) : null,
    }
  })

  const mes = (doMes.data ?? []) as Array<{ status: string; valor_centavos: number | null; orcamento_status: string | null }>
  const realizadas = mes.filter((v) => v.status === 'finalizado')
  const comValor = realizadas.filter((v) => (v.valor_centavos ?? 0) > 0)
  const ticketLaura = comValor.length ? Math.round(comValor.reduce((t, v) => t + (v.valor_centavos ?? 0), 0) / comValor.length) : null
  const ticket = dinheiro.entradas ? Math.round(dinheiro.recebido / dinheiro.entradas) : ticketLaura
  const consertos = mes.filter((v) => v.orcamento_status === 'aprovado' || v.orcamento_status === 'recuperado').length
  const notasNps = (notas.data ?? []) as Array<{ nota_nps: number }>
  const recomendam = notasNps.length ? Math.round((10 * notasNps.filter((n) => n.nota_nps >= 9).length) / notasNps.length) : null

  const blocos: Bloco[] = [
    {
      id: 'rua',
      titulo: 'Na rua agora',
      origem: 'Laura',
      tipo: 'tecnicos',
      tecnicos,
    },
    {
      id: 'dinheiro',
      titulo: 'Dinheiro do mês',
      origem: 'Helô',
      tipo: 'numeros',
      numeros: mostrarValores
        ? [
            { rotulo: 'Recebido', valor: reais(dinheiro.recebido), destaque: true },
            { rotulo: 'Lucro', valor: reais(dinheiro.lucro), alerta: dinheiro.lucro < 0 },
            { rotulo: 'A receber', valor: reais(dinheiro.aReceber) },
            { rotulo: 'Atrasado', valor: reais(helo.vencidoAReceber), alerta: helo.vencidoAReceber > 0 },
            { rotulo: 'Despesas pagas', valor: reais(dinheiro.despesas) },
            { rotulo: 'Ticket médio', valor: ticket ? reais(ticket) : '–' },
            ...(helo.retiradaPct && dinheiro.lucro > 0
              ? [
                  {
                    rotulo: 'Pode retirar',
                    valor: reais(Math.round((dinheiro.lucro * helo.retiradaPct) / 100)),
                    nota: `${helo.retiradaPct}% do lucro, como definido na Helô`,
                  },
                ]
              : []),
          ]
        : [{ rotulo: 'Valores escondidos na TV', valor: '–', nota: 'Ligue em Configurações para mostrar' }],
      meta:
        mostrarValores && helo.metaLucro
          ? { rotulo: 'Meta de lucro do mês', atual: Math.max(0, dinheiro.lucro), alvo: helo.metaLucro, texto: `${reais(Math.max(0, dinheiro.lucro))} de ${reais(helo.metaLucro)}` }
          : undefined,
    },
    {
      id: 'orcamentos',
      titulo: 'Orçamentos do mês',
      origem: 'Helô',
      tipo: 'numeros',
      numeros: [
        {
          rotulo: 'Aprovação',
          valor: helo.orcamentos.aprovados + helo.orcamentos.rejeitados ? `${Math.round((100 * helo.orcamentos.aprovados) / (helo.orcamentos.aprovados + helo.orcamentos.rejeitados))}%` : '–',
          destaque: true,
        },
        { rotulo: 'Enviados', valor: String(helo.orcamentos.enviados) },
        { rotulo: 'Aprovados', valor: String(helo.orcamentos.aprovados), nota: mostrarValores ? reais(helo.orcamentos.valorAprovado) : undefined },
        { rotulo: 'Esperando resposta', valor: String(helo.orcamentos.emAberto), nota: mostrarValores ? reais(helo.orcamentos.valorEmAberto) : undefined },
        {
          rotulo: 'Recuperados pela Laura',
          valor: String(mes.filter((v) => v.orcamento_status === 'recuperado').length),
        },
      ],
    },
    {
      id: 'os',
      titulo: 'Ordens de serviço',
      origem: 'Helô',
      tipo: 'numeros',
      numeros: [
        { rotulo: 'Concluídas no mês', valor: String(helo.os.concluidasMes), destaque: true },
        { rotulo: 'Em andamento', valor: String(helo.os.andamento) },
        { rotulo: 'Pendentes', valor: String(helo.os.pendentes) },
        {
          rotulo: 'Concluídas sem pagamento',
          valor: String(helo.os.concluidasSemPagar),
          nota: mostrarValores && helo.os.valorSemPagar ? reais(helo.os.valorSemPagar) : undefined,
          alerta: helo.os.concluidasSemPagar > 0,
        },
      ],
    },
    {
      id: 'recorrencia',
      titulo: 'Manutenções e clientes',
      origem: 'Helô',
      tipo: 'numeros',
      numeros: [
        { rotulo: 'Manutenções vencidas', valor: String(helo.manutencoes.vencidas), alerta: helo.manutencoes.vencidas > 0, destaque: true },
        { rotulo: 'Nos próximos 7 dias', valor: String(helo.manutencoes.prox7) },
        { rotulo: 'Nos próximos 30 dias', valor: String(helo.manutencoes.prox30) },
        {
          rotulo: 'Planos de manutenção',
          valor: String(helo.planos.ativos),
          nota: mostrarValores && helo.planos.receitaMensal ? `${reais(helo.planos.receitaMensal)} por mês garantidos` : undefined,
        },
        { rotulo: 'Clientes', valor: String(helo.clientes.ativos), nota: `${helo.clientes.novosMes} novos no mês` },
      ],
    },
    {
      id: 'funil',
      titulo: 'Do WhatsApp ao conserto (mês)',
      origem: 'Laura',
      tipo: 'funil',
      etapas: [
        { rotulo: 'Conversas', valor: mt?.conversas ?? 0 },
        { rotulo: 'Visitas marcadas', valor: mes.length },
        { rotulo: 'Visitas feitas', valor: realizadas.length },
        { rotulo: 'Consertos fechados', valor: consertos },
      ],
    },
    {
      id: 'hoje',
      titulo: 'Hoje',
      origem: 'Laura + Helô',
      tipo: 'numeros',
      numeros: [
        { rotulo: 'Visitas', valor: String(visitas.length), destaque: true },
        { rotulo: 'Compromissos na agenda da Helô', valor: String(helo.agendaHoje) },
        { rotulo: 'Feitas', valor: String(visitas.filter((v) => v.status === 'finalizado').length) },
        { rotulo: 'Em andamento', valor: String(visitas.filter((v) => ['a_caminho', 'em_andamento'].includes(v.status)).length) },
        {
          rotulo: 'Sem técnico',
          valor: String(visitas.filter((v) => !v.tecnico_id).length),
          alerta: visitas.some((v) => !v.tecnico_id),
        },
        {
          rotulo: 'Não confirmadas',
          valor: String(visitas.filter((v) => v.status === 'agendado').length),
          alerta: visitas.some((v) => v.status === 'agendado'),
        },
      ],
    },
    {
      id: 'qualidade',
      titulo: 'Qualidade (mês)',
      origem: 'Laura + Helô',
      tipo: 'numeros',
      numeros: [
        { rotulo: 'Recomendariam você', valor: recomendam == null ? '–' : `${recomendam} em 10`, destaque: true },
        {
          rotulo: 'Estrelas nas OS',
          valor: helo.avaliacoes.media == null ? '–' : String(helo.avaliacoes.media).replace('.', ','),
          nota: `${helo.avaliacoes.respondidas} avaliações na Helô`,
        },
        {
          rotulo: 'Em casa na visita',
          valor: mt?.comparecimento_com_lembrete != null ? `${mt.comparecimento_com_lembrete}%` : '–',
          nota: 'com lembrete',
        },
        { rotulo: 'Marcadas fora do horário', valor: String(mt?.visitas_fora_horario ?? 0) },
        { rotulo: 'Resposta da Laura', valor: mt?.resposta_mediana_s != null ? `${Math.max(1, Math.round(mt.resposta_mediana_s))} s` : '–' },
      ],
    },
  ]

  return <PainelDono empresa={empresa.nome} blocos={blocos} modoTv={modoTv} atualizadoEm={new Date().toISOString()} fuso={empresa.fuso} />
}
