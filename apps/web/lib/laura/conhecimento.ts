/** O que o dono ensina para a Laura na tela de configurações. Fica em laura.empresas.conhecimento. */
export type Conhecimento = {
  pagamento?: string
  garantia?: string
  horario?: string
  observacoes?: string
  sabado?: boolean
  domingo?: boolean
}

export function lerConhecimento(valor: unknown): Conhecimento {
  if (!valor || typeof valor !== 'object') return {}
  const v = valor as Record<string, unknown>
  const texto = (k: string) => (typeof v[k] === 'string' && (v[k] as string).trim() !== '' ? (v[k] as string) : undefined)
  return {
    pagamento: texto('pagamento'),
    garantia: texto('garantia'),
    horario: texto('horario'),
    observacoes: texto('observacoes'),
    sabado: typeof v.sabado === 'boolean' ? v.sabado : true,
    domingo: v.domingo === true,
  }
}
