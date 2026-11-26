/**
 * Tudo o que o dono ensina para a Laura. Fica em laura.empresas.conhecimento (jsonb).
 * Campo vazio = a Laura não fala do assunto e passa para a equipe.
 */
export type Pergunta = { pergunta: string; resposta: string }

export type Conhecimento = {
  // Identidade
  nome_assistente?: string
  tom?: 'proximo' | 'formal' | 'descontraido'
  emojis?: boolean
  saudacao?: string
  // Empresa
  descricao?: string
  diferenciais?: string
  anos_mercado?: string
  endereco_oficina?: string
  atende_na_oficina?: boolean
  site?: string
  instagram?: string
  // Serviços e preços
  precos?: string
  marcas?: string
  nao_atende?: string
  // Visita
  visita_descontada?: boolean
  taxa_regiao?: string
  prazo?: string
  urgencia?: string
  perguntar_antes?: string[]
  // Condições
  pagamento?: string
  garantia?: string
  horario?: string
  sabado?: boolean
  domingo?: boolean
  fora_horario?: string
  cancelamento?: string
  orcamento?: string
  // Perguntas frequentes e regras
  faq?: Pergunta[]
  transferir_quando?: string[]
  transferir_extra?: string
  proibido?: string
  observacoes?: string
}

export const PERGUNTAR_ANTES = [
  ['marca', 'Marca do aparelho'],
  ['modelo', 'Modelo ou capacidade (BTUs, litros, kg)'],
  ['idade', 'Há quanto tempo tem o aparelho'],
  ['foto', 'Foto do aparelho ou da etiqueta'],
  ['referencia', 'Ponto de referência do endereço'],
] as const

export const TRANSFERIR_QUANDO = [
  ['reclamacao', 'Reclamação ou cliente irritado'],
  ['garantia', 'Pedido de garantia de serviço já feito'],
  ['empresa', 'Empresa, condomínio ou contrato'],
  ['orcamento', 'Pedido de orçamento de conserto ou peça'],
  ['retorno', 'Cliente com visita já marcada querendo mudar'],
] as const

const TONS = ['proximo', 'formal', 'descontraido'] as const

function texto(v: unknown, max = 2000): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : undefined
}

function lista(v: unknown, permitidos: readonly (readonly [string, string])[]): string[] {
  const ok = new Set(permitidos.map(([k]) => k))
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && ok.has(x)) : []
}

export function lerConhecimento(valor: unknown): Conhecimento {
  if (!valor || typeof valor !== 'object') return { sabado: true, emojis: false, tom: 'proximo', visita_descontada: false }
  const v = valor as Record<string, unknown>
  const faq = Array.isArray(v.faq)
    ? (v.faq as unknown[])
        .map((f) => {
          const p = f as Record<string, unknown>
          return { pergunta: texto(p?.pergunta, 300) ?? '', resposta: texto(p?.resposta, 1000) ?? '' }
        })
        .filter((f) => f.pergunta && f.resposta)
        .slice(0, 20)
    : []
  return {
    nome_assistente: texto(v.nome_assistente, 40),
    tom: TONS.includes(v.tom as (typeof TONS)[number]) ? (v.tom as Conhecimento['tom']) : 'proximo',
    emojis: v.emojis === true,
    saudacao: texto(v.saudacao, 500),
    descricao: texto(v.descricao, 1000),
    diferenciais: texto(v.diferenciais, 1000),
    anos_mercado: texto(v.anos_mercado, 40),
    endereco_oficina: texto(v.endereco_oficina, 300),
    atende_na_oficina: v.atende_na_oficina === true,
    site: texto(v.site, 200),
    instagram: texto(v.instagram, 100),
    precos: texto(v.precos, 3000),
    marcas: texto(v.marcas, 1000),
    nao_atende: texto(v.nao_atende, 1000),
    visita_descontada: v.visita_descontada === true,
    taxa_regiao: texto(v.taxa_regiao, 1000),
    prazo: texto(v.prazo, 300),
    urgencia: texto(v.urgencia, 500),
    perguntar_antes: lista(v.perguntar_antes, PERGUNTAR_ANTES),
    pagamento: texto(v.pagamento, 1000),
    garantia: texto(v.garantia, 1000),
    horario: texto(v.horario, 300),
    sabado: typeof v.sabado === 'boolean' ? v.sabado : true,
    domingo: v.domingo === true,
    fora_horario: texto(v.fora_horario, 500),
    cancelamento: texto(v.cancelamento, 1000),
    orcamento: texto(v.orcamento, 1000),
    faq,
    transferir_quando: lista(v.transferir_quando, TRANSFERIR_QUANDO),
    transferir_extra: texto(v.transferir_extra, 1000),
    proibido: texto(v.proibido, 1000),
    observacoes: texto(v.observacoes, 3000),
  }
}

/** Quanto do treinamento está preenchido (0 a 100), para mostrar no painel. */
export function completude(c: Conhecimento, temValorVisita: boolean, temServicos: boolean, temAreas: boolean): number {
  const itens = [
    temValorVisita,
    temServicos,
    temAreas,
    !!c.pagamento,
    !!c.garantia,
    !!c.horario,
    !!c.descricao,
    !!c.precos,
    !!c.marcas,
    !!c.prazo,
    !!c.cancelamento,
    (c.faq?.length ?? 0) >= 3,
  ]
  return Math.round((100 * itens.filter(Boolean).length) / itens.length)
}
