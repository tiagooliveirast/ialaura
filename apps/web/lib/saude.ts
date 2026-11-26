/**
 * Saúde de cada empresa cliente: sinais de que pode cancelar.
 * Serve para o gestor ligar ANTES do cancelamento.
 */
export type SinaisSaude = {
  whatsappLigado: boolean
  treino: number
  diasSemUso: number | null
  conversasEsperando: number
  inadimplente: boolean
  semVisitaNoPeriodo: boolean
  diasDeCasa: number
}

export type Saude = { nota: number; nivel: 'bem' | 'atencao' | 'risco'; motivos: string[] }

export function avaliarSaude(s: SinaisSaude): Saude {
  let nota = 100
  const motivos: string[] = []
  if (s.inadimplente) {
    nota -= 30
    motivos.push('pagamento atrasado')
  }
  if (!s.whatsappLigado) {
    nota -= s.diasDeCasa > 3 ? 30 : 10
    motivos.push('WhatsApp não ligado')
  }
  if (s.treino < 60) {
    nota -= 20
    motivos.push(`treinamento em ${s.treino}%`)
  }
  if (s.diasSemUso == null || s.diasSemUso >= 7) {
    nota -= 25
    motivos.push(s.diasSemUso == null ? 'nunca usou' : `${s.diasSemUso} dias sem uso`)
  }
  if (s.conversasEsperando >= 3) {
    nota -= 10
    motivos.push(`${s.conversasEsperando} conversas esperando a equipe`)
  }
  if (s.semVisitaNoPeriodo && s.whatsappLigado && s.diasDeCasa > 14) {
    nota -= 15
    motivos.push('a Laura não marcou visita no período')
  }
  nota = Math.max(0, nota)
  return { nota, nivel: nota >= 75 ? 'bem' : nota >= 50 ? 'atencao' : 'risco', motivos }
}
