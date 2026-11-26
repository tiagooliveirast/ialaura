/**
 * Modelos de mensagem que precisam estar aprovados no WhatsApp Manager (categoria Utilidade, pt_BR).
 * O texto aqui é o que deve ser cadastrado na Meta; os {{n}} são preenchidos na hora do envio.
 */
export const MODELOS = {
  lembreteVespera: {
    nome: 'laura_lembrete_visita',
    texto:
      'Olá, {{1}}! Passando para lembrar da sua visita técnica com a {{2}} amanhã {{3}}. Se precisar remarcar, é só responder esta mensagem.',
  },
  manutencaoTecnico: {
    nome: 'laura_manutencao_tecnico',
    texto:
      'Manutenção programada em 7 dias: {{1}}, {{2}}, no endereço {{3}}. Confira peças e materiais antes do dia.',
  },
  pesquisa: {
    nome: 'laura_pesquisa_satisfacao',
    texto:
      'Olá, {{1}}! Obrigado por chamar a {{2}}. Pode avaliar o atendimento em menos de um minuto? {{3}}',
  },
  tecnicoACaminho: {
    nome: 'laura_tecnico_a_caminho',
    texto: 'Olá, {{1}}! O técnico {{2}} da {{3}} já está a caminho da sua casa.',
  },
} as const
