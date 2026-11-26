import type { Metadata } from 'next'
import Link from 'next/link'
import { dataCurta, hojeEm, reais, ROTULO_PERIODO, ROTULO_STATUS, type Periodo, type StatusAtendimento } from '@ialaura/shared'
import { proximosDias } from '@/lib/laura/agenda'
import { completude, lerConhecimento } from '@/lib/laura/conhecimento'
import { pct, tempoResposta, type Metricas } from '@/lib/metricas'
import { exigirMembro } from '@/lib/sessao'
import { supabaseAdmin } from '@/lib/supabase/admin'
import './inicio-painel.css'

export const metadata: Metadata = { title: 'Início' }
export const dynamic = 'force-dynamic'

type Visita = {
  id: string
  data: string
  periodo: Periodo
  status: StatusAtendimento
  descricao: string | null
  tecnico_id: string | null
  cliente: { nome: string; bairro: string | null } | null
  tecnico: { nome: string } | null
}

const ABERTOS: StatusAtendimento[] = ['agendado', 'confirmado', 'a_caminho', 'atrasado', 'em_andamento']

function Indicador({ rotulo, valor, nota }: { rotulo: string; valor: string | number; nota?: string }) {
  return (
    <div className="ind">
      <dt>{rotulo}</dt>
      <dd className="numero">{valor}</dd>
      {nota && <p>{nota}</p>}
    </div>
  )
}

export default async function Inicio() {
  const { sb, membro, empresa } = await exigirMembro()
  const admin = supabaseAdmin()
  const hoje = hojeEm(empresa.fuso)
  const [a, m, d] = hoje.split('-').map(Number)
  const inicioMes = new Date(Date.UTC(a!, m! - 1, 1)).toISOString()
  const em7 = new Date(Date.UTC(a!, m! - 1, d! + 7)).toISOString().slice(0, 10)

  const [visitas, conversasHumano, atrasados, dados, conta, servicos, areas, equipe, assinatura, metricas] = await Promise.all([
    sb
      .from('atendimentos')
      .select('id, data, periodo, status, descricao, tecnico_id, cliente:clientes(nome, bairro), tecnico:membros(nome)')
      .gte('data', hoje)
      .lte('data', em7)
      .not('status', 'in', '(cancelado)')
      .order('data')
      .order('periodo'),
    sb.from('conversas').select('id', { count: 'exact', head: true }).eq('estado', 'humano'),
    sb.from('atendimentos').select('id', { count: 'exact', head: true }).lt('data', hoje).in('status', ABERTOS),
    sb.from('empresas').select('valor_visita_centavos, conhecimento, slug').eq('id', empresa.id).single(),
    admin.from('whatsapp_contas').select('status').eq('empresa_id', empresa.id).maybeSingle(),
    sb.from('servicos').select('id', { count: 'exact', head: true }).eq('empresa_id', empresa.id),
    sb.from('areas_atendimento').select('id', { count: 'exact', head: true }).eq('empresa_id', empresa.id),
    sb.from('membros').select('id, nome, atende').eq('empresa_id', empresa.id).eq('ativo', true),
    sb.from('assinaturas').select('status, isenta').eq('empresa_id', empresa.id).maybeSingle(),
    admin.rpc('metricas', { p_inicio: inicioMes, p_empresa: empresa.id }),
  ])

  const lista = (visitas.data ?? []) as unknown as Visita[]
  const deHoje = lista.filter((v) => v.data === hoje)
  const c = lerConhecimento(dados.data?.conhecimento)
  const nomeIA = c.nome_assistente || 'Laura'
  const treino = completude(c, dados.data?.valor_visita_centavos != null, (servicos.count ?? 0) > 0, (areas.count ?? 0) > 0)
  const whatsLigado = conta.data?.status === 'ativa'
  const pessoas = equipe.data ?? []
  const emCampo = pessoas.filter((p) => p.atende)
  const pago = assinatura.data?.isenta || assinatura.data?.status === 'ativa'
  const mt = metricas.data as Metricas | null
  const dono = membro.papel === 'dono'
  const semTecnicoHoje = deHoje.filter((v) => !v.tecnico_id && ABERTOS.includes(v.status)).length
  const semConfirmarHoje = deHoje.filter((v) => v.status === 'agendado').length

  const passos = [
    { feito: treino >= 60, titulo: `Treinar a ${nomeIA}`, detalhe: `${treino}% preenchido`, link: '/painel/laura' },
    { feito: whatsLigado, titulo: 'Ligar o WhatsApp da empresa', detalhe: whatsLigado ? 'Ligado' : 'Em Configurações', link: '/painel/configuracoes' },
    { feito: emCampo.length > 0, titulo: 'Dizer quem vai a campo', detalhe: `${emCampo.length} em campo`, link: '/painel/equipe' },
    { feito: !!pago, titulo: 'Assinatura', detalhe: pago ? 'Ativa' : 'Pendente', link: '/painel/assinatura' },
  ]
  const faltam = passos.filter((p) => !p.feito)

  const dias = proximosDias(hoje, 7, c)
  const porDia = dias.map((dia) => ({ dia, total: lista.filter((v) => v.data === dia).length }))
  const maxDia = Math.max(1, ...porDia.map((p) => p.total))
  const capacidadeDia = Math.max(1, emCampo.length) * 2 * ((await sb.from('empresas').select('vagas_por_periodo').eq('id', empresa.id).single()).data?.vagas_por_periodo ?? 3)

  const precisa = [
    (conversasHumano.count ?? 0) > 0 && {
      texto: `${conversasHumano.count} ${conversasHumano.count === 1 ? 'conversa esperando' : 'conversas esperando'} alguém da equipe`,
      link: '/painel/conversas',
    },
    (atrasados.count ?? 0) > 0 && {
      texto: `${atrasados.count} ${atrasados.count === 1 ? 'visita de dias anteriores' : 'visitas de dias anteriores'} sem baixa`,
      link: '/painel/atendimentos',
    },
    semConfirmarHoje > 0 && {
      texto:
        semConfirmarHoje === 1
          ? '1 visita de hoje não foi confirmada pelo cliente. Vale ligar antes de sair'
          : `${semConfirmarHoje} visitas de hoje não foram confirmadas pelo cliente. Vale ligar antes de sair`,
      link: '/painel/atendimentos',
    },
    semTecnicoHoje > 0 && pessoas.length > 1 && { texto: `${semTecnicoHoje} visitas de hoje sem técnico`, link: '/painel/atendimentos' },
  ].filter(Boolean) as Array<{ texto: string; link: string }>

  return (
    <div className="inicio-painel">
      <div className="cabecalho">
        <div>
          <h1>Bom trabalho hoje</h1>
          <p className="apoio">
            {dataCurta(hoje)} · <span className="numero">{deHoje.length}</span> {deHoje.length === 1 ? 'visita' : 'visitas'} hoje
            {whatsLigado ? ` · ${nomeIA} atendendo no WhatsApp` : ` · ${nomeIA} ainda não está no WhatsApp`}
          </p>
        </div>
        <Link className="botao" href="/painel/novo">
          Marcar visita
        </Link>
      </div>

      {faltam.length > 0 && (
        <section className="passos-painel painel">
          <h2>Para deixar tudo funcionando</h2>
          <ol>
            {passos.map((p) => (
              <li key={p.titulo} className={p.feito ? 'feito' : undefined}>
                <span className="marca-passo" aria-hidden="true">
                  {p.feito ? '✓' : ''}
                </span>
                <Link href={p.link}>{p.titulo}</Link>
                <span className="fraco">{p.detalhe}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {precisa.length > 0 && (
        <section className="precisa">
          {precisa.map((p) => (
            <Link key={p.texto} href={p.link} className="precisa-item">
              {p.texto}
            </Link>
          ))}
        </section>
      )}

      <div className="grade-inicio">
        <section className="painel bloco-hoje">
          <div className="bloco-titulo">
            <h2>Hoje na rua</h2>
            <Link href="/painel/atendimentos" className="fraco">
              Ver todos
            </Link>
          </div>
          {deHoje.length === 0 ? (
            <p className="vazio-pequeno">Nenhuma visita hoje.</p>
          ) : (
            <ul className="lista-hoje">
              {deHoje.map((v) => (
                <li key={v.id}>
                  <span className="numero fraco">{ROTULO_PERIODO[v.periodo]}</span>
                  <span>
                    <strong>{v.cliente?.nome ?? 'Cliente'}</strong>
                    <span className="fraco">
                      {' '}
                      · {v.cliente?.bairro ?? 'sem bairro'} · {v.tecnico?.nome ?? 'sem técnico'}
                    </span>
                  </span>
                  <span className={`etiqueta status-${v.status}`}>{ROTULO_STATUS[v.status]}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="painel bloco-semana">
          <div className="bloco-titulo">
            <h2>Próximos dias</h2>
            <span className="fraco numero">{capacidadeDia} vagas por dia</span>
          </div>
          <ul className="barras">
            {porDia.map((p) => (
              <li key={p.dia}>
                <span className="barras-dia">{p.dia === hoje ? 'Hoje' : dataCurta(p.dia)}</span>
                <span className="barras-trilho">
                  <span
                    className={`barras-cheio ${p.total >= capacidadeDia ? 'lotado' : ''}`}
                    style={{ width: `${Math.min(100, (100 * p.total) / Math.max(maxDia, capacidadeDia))}%` }}
                  />
                </span>
                <span className="numero">{p.total}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mes">
        <div className="bloco-titulo">
          <h2>Este mês com a {nomeIA}</h2>
        </div>
        {mt ? (
          <dl className="inds">
            <Indicador rotulo="Visitas marcadas por ela" valor={mt.visitas_laura} nota={`${mt.visitas_sem_humano} sem ninguém da equipe`} />
            <Indicador rotulo="Fora do horário" valor={mt.visitas_fora_horario} nota="Noite e fim de semana" />
            <Indicador rotulo="Conversas" valor={mt.conversas} nota={`${pct(mt.conversas_viraram_visita, mt.conversas) ?? 0}% viraram visita`} />
            <Indicador rotulo="Tempo de resposta" valor={tempoResposta(mt.resposta_mediana_s)} />
            <Indicador rotulo="Marcadas pelo site" valor={mt.visitas_site} />
            <Indicador rotulo="Nota dos clientes (NPS)" valor={mt.nps ?? '–'} nota={`${mt.pesquisas_respondidas} respostas`} />
            {dono && <Indicador rotulo="Valor das visitas da Laura" valor={reais(mt.valor_visitas_laura_centavos)} />}
            <Indicador rotulo="Lembretes enviados" valor={mt.lembretes_enviados} />
          </dl>
        ) : (
          <p className="vazio-pequeno">Os números aparecem quando chegarem as primeiras conversas.</p>
        )}
      </section>

      <section className="painel link-site">
        <div>
          <h2>Site da empresa</h2>
          <p className="fraco">Coloque na bio do Instagram e no Google. O cliente agenda sozinho.</p>
        </div>
        <Link href={`/a/${dados.data?.slug ?? empresa.slug}`} className="numero" target="_blank">
          ialaura.vercel.app/a/{dados.data?.slug ?? empresa.slug}
        </Link>
      </section>
    </div>
  )
}
