import { reais } from '@ialaura/shared'

export type Metricas = {
  visitas_total: number
  visitas_laura: number
  visitas_sem_humano: number
  visitas_fora_horario: number
  visitas_retorno: number
  visitas_site: number
  valor_visitas_laura_centavos: number
  valor_servicos_laura_centavos: number
  conversas: number
  conversas_viraram_visita: number
  conversas_com_humano: number
  mensagens_cliente: number
  mensagens_laura: number
  mensagens_laura_fora_horario: number
  resposta_mediana_s: number | null
  lembretes_enviados: number
  lembretes_falhos: number
  comparecimento_com_lembrete: number | null
  comparecimento_sem_lembrete: number | null
  pesquisas_respondidas: number
  nps: number | null
  nota_tecnico_media: number | null
  avaliacoes_google_enviadas: number
  custo_ia_micro_usd: number
  fila_com_erro: number
}

export const PERIODOS_ADMIN = [
  ['7', '7 dias'],
  ['30', '30 dias'],
  ['90', '90 dias'],
  ['tudo', 'Desde o início'],
] as const

export function inicioDoPeriodo(p: string | undefined): { inicio: string; dias: number | null; chave: string } {
  const chave = PERIODOS_ADMIN.some(([k]) => k === p) ? p! : '30'
  if (chave === 'tudo') return { inicio: '2020-01-01T00:00:00Z', dias: null, chave }
  const dias = Number(chave)
  return { inicio: new Date(Date.now() - dias * 86400_000).toISOString(), dias, chave }
}

export function pct(parte: number, todo: number): number | null {
  return todo > 0 ? Math.round((100 * parte) / todo) : null
}

/** Minutos que alguém da empresa gastaria respondendo. Estimativa declarada na tela. */
export const MINUTOS_POR_RESPOSTA = 1.5

export function horasEconomizadas(m: Metricas): number {
  return Math.round((m.mensagens_laura * MINUTOS_POR_RESPOSTA) / 60)
}

export function tempoResposta(s: number | null): string {
  if (s == null) return 'sem dados'
  if (s < 60) return `${Math.round(s)} s`
  return `${Math.round(s / 60)} min`
}

/** Frases prontas para post, página de vendas ou conversa. Só entram as que têm número para sustentar. */
export function frasesProvaSocial(m: Metricas, dias: number | null, sujeito = 'A Laura'): string[] {
  const quando = dias ? `nos últimos ${dias} dias` : 'desde o início'
  const f: string[] = []
  if (m.visitas_laura > 0) f.push(`${sujeito} marcou ${m.visitas_laura} visitas técnicas sozinha ${quando}.`)
  if (m.visitas_fora_horario > 0)
    f.push(
      `${m.visitas_fora_horario} dessas visitas foram marcadas à noite ou no fim de semana, quando ninguém da empresa estava atendendo.`,
    )
  const semHumano = pct(m.visitas_sem_humano, m.visitas_laura)
  if (semHumano != null && m.visitas_laura >= 5)
    f.push(`${semHumano}% das visitas foram marcadas sem ninguém da equipe precisar pegar no celular.`)
  if (m.resposta_mediana_s != null && m.mensagens_laura >= 20)
    f.push(`O cliente recebe resposta em ${tempoResposta(m.resposta_mediana_s)}, a qualquer hora do dia.`)
  if (m.visitas_retorno > 0) f.push(`${m.visitas_retorno} clientes antigos voltaram e marcaram de novo pelo WhatsApp.`)
  if (m.mensagens_laura >= 50)
    f.push(`Foram ${m.mensagens_laura} respostas no WhatsApp, cerca de ${horasEconomizadas(m)} horas de atendimento que a equipe não precisou fazer.`)
  if (m.valor_visitas_laura_centavos > 0)
    f.push(`Só em visitas técnicas marcadas pela Laura, foram ${reais(m.valor_visitas_laura_centavos)}.`)
  if (
    m.comparecimento_com_lembrete != null &&
    m.comparecimento_sem_lembrete != null &&
    m.comparecimento_com_lembrete > m.comparecimento_sem_lembrete
  )
    f.push(
      `Com o lembrete da véspera, ${m.comparecimento_com_lembrete}% dos clientes estavam em casa na visita, contra ${m.comparecimento_sem_lembrete}% sem lembrete.`,
    )
  if (m.nps != null && m.pesquisas_respondidas >= 10) f.push(`Nota de recomendação dos clientes (NPS): ${m.nps}.`)
  if (m.avaliacoes_google_enviadas > 0)
    f.push(`${m.avaliacoes_google_enviadas} clientes satisfeitos foram convidados a avaliar a empresa no Google.`)
  return f
}
