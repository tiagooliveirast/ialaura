import { PERIODOS, ROTULO_PERIODO, type Periodo } from '@ialaura/shared'
import type { supabaseAdmin } from '@/lib/supabase/admin'

type SupabaseClient = ReturnType<typeof supabaseAdmin>

export type Vaga = { data: string; periodo: Periodo; livres: number }

export type DiasDeAtendimento = { sabado?: boolean; domingo?: boolean }

/** Próximos dias a partir de hoje (AAAA-MM-DD), pulando sábado/domingo se a empresa não atende. */
export function proximosDias(hoje: string, quantos: number, dias: DiasDeAtendimento = {}): string[] {
  const [a, m, d] = hoje.split('-').map(Number)
  const lista: string[] = []
  for (let i = 0; lista.length < quantos && i < quantos * 2; i++) {
    const dt = new Date(Date.UTC(a!, m! - 1, d! + i))
    const semana = dt.getUTCDay()
    if (semana === 6 && dias.sabado === false) continue
    if (semana === 0 && !dias.domingo) continue
    lista.push(dt.toISOString().slice(0, 10))
  }
  return lista
}

/** Vagas livres por dia e período. Usa o cliente de servidor (service_role). */
export async function vagasDisponiveis(
  sb: SupabaseClient,
  empresaId: string,
  dias: string[],
): Promise<Vaga[]> {
  const combinacoes = dias.flatMap((data) => PERIODOS.map((periodo) => ({ data, periodo })))
  const vagas = await Promise.all(
    combinacoes.map(async ({ data, periodo }) => {
      const { data: livres } = await sb.rpc('vagas_livres', { p_empresa: empresaId, p_data: data, p_periodo: periodo })
      return { data, periodo, livres: typeof livres === 'number' ? livres : 0 }
    }),
  )
  return vagas.filter((v) => v.livres > 0)
}

export function descreverVaga(v: { data: string; periodo: Periodo }): string {
  const [a, m, d] = v.data.split('-').map(Number)
  const dia = new Date(Date.UTC(a!, m! - 1, d!)).toLocaleDateString('pt-BR', {
    timeZone: 'UTC',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  })
  return `${dia}, ${ROTULO_PERIODO[v.periodo].toLowerCase()}`
}
