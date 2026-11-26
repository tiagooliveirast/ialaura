/** Dados de quem opera a plataforma, usados em Privacidade e Termos. Preencha na Vercel. */
export const PLATAFORMA = {
  nome: process.env.PLATAFORMA_NOME ?? 'NetxGestão',
  responsavel: process.env.PLATAFORMA_RESPONSAVEL ?? 'Tiago Oliveira da Silva',
  documento: process.env.PLATAFORMA_CNPJ ?? '',
  email: process.env.CONTATO_EMAIL ?? '',
  atualizado: '26 de novembro de 2026',
}

export function contato(): string {
  return PLATAFORMA.email ? `pelo e-mail ${PLATAFORMA.email}` : 'pelo suporte informado dentro do painel'
}
