import { z } from 'zod'

// Espelha os enums do banco (supabase/migrations/0001_fundacao.sql). Mudou lá, muda aqui.
export const PAPEIS = ['dono', 'atendente', 'tecnico'] as const
export const PERIODOS = ['manha', 'tarde'] as const
export const STATUS_ATENDIMENTO = [
  'agendado',
  'confirmado',
  'a_caminho',
  'atrasado',
  'em_andamento',
  'finalizado',
  'cancelado',
  'nao_compareceu',
] as const

export type Papel = (typeof PAPEIS)[number]
export type Periodo = (typeof PERIODOS)[number]
export type StatusAtendimento = (typeof STATUS_ATENDIMENTO)[number]

// Como cada status aparece para as pessoas. Status sempre com palavra, nunca só cor.
export const ROTULO_STATUS: Record<StatusAtendimento, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  a_caminho: 'Técnico a caminho',
  atrasado: 'Atrasado',
  em_andamento: 'Em andamento',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
  nao_compareceu: 'Cliente não estava',
}

export const ROTULO_PERIODO: Record<Periodo, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
}

// O que o técnico pode marcar pelo app. O resto é do escritório.
export const STATUS_DO_TECNICO = ['a_caminho', 'atrasado', 'em_andamento', 'finalizado'] as const

/** Deixa só dígitos e garante DDI 55. Aceita "(71) 99999-0000", "+55 71 99999-0000" etc. */
export function normalizarTelefone(entrada: string): string | null {
  const d = entrada.replace(/\D/g, '')
  const semDdi = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d
  if (semDdi.length !== 10 && semDdi.length !== 11) return null
  return `55${semDdi}`
}

export const telefone = z
  .string()
  .transform((v, ctx) => {
    const n = normalizarTelefone(v)
    if (!n) {
      ctx.addIssue({ code: 'custom', message: 'Telefone com DDD, por exemplo 71 99999-0000.' })
      return z.NEVER
    }
    return n
  })

export const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.')

/** Pedido de agendamento vindo do site público ou da IA. */
export const pedidoAgendamento = z.object({
  empresaId: z.string().uuid(),
  nome: z.string().trim().min(2, 'Informe o nome do cliente.').max(120),
  telefone,
  endereco: z.string().trim().min(5, 'Informe rua e número.').max(240),
  bairro: z.string().trim().max(80).optional(),
  cidade: z.string().trim().max(80).optional(),
  servicoId: z.string().uuid().optional(),
  descricao: z.string().trim().max(1000).optional(),
  data: dataISO,
  periodo: z.enum(PERIODOS),
  origem: z.enum(['site', 'whatsapp', 'painel', 'helo']),
})
export type PedidoAgendamento = z.infer<typeof pedidoAgendamento>

/** Resposta da pesquisa de satisfação (link público com token). */
export const respostaPesquisa = z.object({
  token: z.string().uuid(),
  notaNps: z.number().int().min(0).max(10),
  notaTecnico: z.number().int().min(1).max(5),
  comentario: z.string().trim().max(1000).optional(),
})

/** Link do Google só vai para quem deu nota alta. */
export const NOTA_MINIMA_PARA_PEDIR_AVALIACAO = 9

/** Centavos → "R$ 197,00". */
export function reais(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Preços vigentes, em centavos. O painel admin pode sobrepor por empresa.
export const PRECOS = {
  soloMensal: 19700,
  tecnicoAdicional: 4900,
  comboHeloMensal: 22700,
  comboTecnicoAdicional: 6900,
} as const

export function mensalidade(tecnicosCobrados: number, combo = false): number {
  const base = combo ? PRECOS.comboHeloMensal : PRECOS.soloMensal
  const extra = combo ? PRECOS.comboTecnicoAdicional : PRECOS.tecnicoAdicional
  return base + Math.max(0, tecnicosCobrados) * extra
}

/** "Sheik Manutenções" → "sheik-manutencoes". Vira o endereço do site da empresa. */
export function slugificar(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/** Data de hoje (AAAA-MM-DD) no fuso da empresa, não no do servidor. */
export function hojeEm(fuso = 'America/Bahia'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(new Date())
}

/** "2026-11-17" → "ter., 17/11". */
export function dataCurta(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  if (!a || !m || !d) return iso
  return new Date(Date.UTC(a, m - 1, d)).toLocaleDateString('pt-BR', {
    timeZone: 'UTC',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
}

/** Atendimento lançado pelo escritório no painel. */
export const novoAtendimento = z.object({
  nome: z.string().trim().min(2, 'Informe o nome do cliente.').max(120),
  telefone,
  endereco: z.string().trim().min(5, 'Informe rua e número.').max(240),
  bairro: z.string().trim().max(80).optional(),
  descricao: z.string().trim().max(1000).optional(),
  data: dataISO,
  periodo: z.enum(PERIODOS),
})

export const novaEmpresa = z.object({
  nome: z.string().trim().min(2, 'Informe o nome da empresa.').max(80),
  meuNome: z.string().trim().min(2, 'Informe o seu nome.').max(80),
  telefone,
  cidade: z.string().trim().min(2, 'Informe a cidade.').max(80),
  uf: z.string().trim().length(2, 'UF com duas letras, por exemplo BA.').toUpperCase(),
})
