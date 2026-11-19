import { hojeEm, PERIODOS, reais, ROTULO_PERIODO, type Periodo } from '@ialaura/shared'
import type { supabaseAdmin } from '@/lib/supabase/admin'

type SupabaseClient = ReturnType<typeof supabaseAdmin>
import { descreverVaga, proximosDias, vagasDisponiveis, type Vaga } from './agenda'
import { lerConhecimento } from './conhecimento'
import { custoMicroUsd, perguntar, type Ferramenta, type MensagemIA } from './ia'

type Empresa = {
  id: string
  nome: string
  cidade: string | null
  uf: string | null
  fuso: string
  valor_visita_centavos: number | null
  conhecimento: unknown
}

export type ResultadoAtendente = {
  resposta: string | null
  passouParaHumano: boolean
  atendimentoCriado: string | null
}

const FERRAMENTAS: Ferramenta[] = [
  {
    type: 'function',
    function: {
      name: 'marcar_visita',
      description:
        'Marca a visita técnica na agenda. Só chame depois que o cliente escolheu um dos horários da lista de vagas e informou nome e endereço com número.',
      parameters: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Nome do cliente' },
          endereco: { type: 'string', description: 'Rua e número' },
          bairro: { type: 'string' },
          referencia: { type: 'string', description: 'Ponto de referência, se o cliente informou' },
          data: { type: 'string', description: 'AAAA-MM-DD, exatamente como na lista de vagas' },
          periodo: { type: 'string', enum: [...PERIODOS] },
          descricao: { type: 'string', description: 'Aparelho e o problema relatado pelo cliente' },
        },
        required: ['nome', 'endereco', 'data', 'periodo', 'descricao'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'passar_para_humano',
      description:
        'Passa a conversa para uma pessoa da empresa e para de responder. Use quando o cliente pedir para falar com alguém, reclamar, perguntar algo que não está nas informações da empresa, ou pedir diagnóstico, orçamento de conserto ou preço de peça.',
      parameters: {
        type: 'object',
        properties: { motivo: { type: 'string' } },
        required: ['motivo'],
      },
    },
  },
]

function instrucoes(empresa: Empresa, servicos: string[], areas: string[], vagas: Vaga[], hoje: string): string {
  const c = lerConhecimento(empresa.conhecimento)
  const linhas = [
    `Você é a Laura, atendente da empresa "${empresa.nome}", uma assistência técnica${empresa.cidade ? ` em ${empresa.cidade}${empresa.uf ? `-${empresa.uf}` : ''}` : ''}.`,
    'Você responde clientes pelo WhatsApp. Seu trabalho é atender bem e marcar a visita técnica.',
    '',
    'REGRAS',
    '- Escreva como uma atendente de balcão educada: mensagens curtas, uma ou duas frases, sem listas longas e sem emojis em excesso.',
    '- Use SOMENTE as informações abaixo. Se o cliente perguntar algo que não está aqui, diga que vai verificar com a equipe e chame passar_para_humano.',
    '- Nunca dê diagnóstico, nunca diga o que pode ser o defeito, nunca passe preço de conserto ou de peça. Explique que o técnico avalia na visita.',
    '- Nunca invente horário. Ofereça só os horários da lista de vagas.',
    '- Para marcar: pergunte o aparelho e o problema, ofereça até 3 horários, peça nome e endereço com número e bairro. Depois chame marcar_visita.',
    '- Depois de marcar, confirme o dia e o período em uma frase.',
    '- Se o cliente pedir para falar com uma pessoa, chame passar_para_humano.',
    '',
    `HOJE: ${hoje}`,
    '',
    'INFORMAÇÕES DA EMPRESA',
    empresa.valor_visita_centavos != null
      ? `- Valor da visita técnica: ${reais(empresa.valor_visita_centavos)}`
      : '- Valor da visita: não informado (se perguntarem, passe para humano).',
    servicos.length ? `- Serviços e aparelhos: ${servicos.join('; ')}` : '- Serviços: não informados.',
    areas.length ? `- Atende em: ${areas.join('; ')}` : '- Área de atendimento: não informada (se perguntarem, passe para humano).',
    c.pagamento ? `- Formas de pagamento: ${c.pagamento}` : '',
    c.garantia ? `- Garantia: ${c.garantia}` : '',
    c.horario ? `- Horário de atendimento: ${c.horario}` : '',
    c.observacoes ? `- Outras informações: ${c.observacoes}` : '',
    '',
    'VAGAS DISPONÍVEIS (data AAAA-MM-DD | período)',
    ...(vagas.length
      ? vagas.slice(0, 12).map((v) => `- ${v.data} | ${v.periodo} (${descreverVaga(v)})`)
      : ['- Nenhuma vaga nos próximos dias. Diga que a agenda está cheia e passe para humano.']),
  ]
  return linhas.filter((l) => l !== '').join('\n')
}

/**
 * Lê a conversa, pergunta à IA e executa as ferramentas que ela pedir.
 * Usa o cliente service_role: quem chama já garantiu que a conversa é da empresa.
 */
export async function atender(
  sb: SupabaseClient,
  empresa: Empresa,
  conversa: { id: string; wa_telefone: string },
): Promise<ResultadoAtendente> {
  const hoje = hojeEm(empresa.fuso)
  const c = lerConhecimento(empresa.conhecimento)

  const [{ data: servicos }, { data: areas }, { data: historico }] = await Promise.all([
    sb.from('servicos').select('nome, aparelho').eq('empresa_id', empresa.id).eq('ativo', true),
    sb.from('areas_atendimento').select('cidade, bairro').eq('empresa_id', empresa.id),
    sb
      .from('mensagens')
      .select('autor, conteudo')
      .eq('conversa_id', conversa.id)
      .order('criado_em', { ascending: false })
      .limit(20),
  ])

  const vagas = await vagasDisponiveis(sb, empresa.id, proximosDias(hoje, 7, c).filter((d) => d > hoje))

  const mensagens: MensagemIA[] = [
    {
      role: 'system',
      content: instrucoes(
        empresa,
        (servicos ?? []).map((s) => [s.nome, s.aparelho].filter(Boolean).join(' - ')),
        (areas ?? []).map((a) => [a.bairro, a.cidade].filter(Boolean).join(', ')),
        vagas,
        hoje,
      ),
    },
    ...(historico ?? [])
      .reverse()
      .filter((m) => m.conteudo)
      .map(
        (m): MensagemIA =>
          m.autor === 'cliente'
            ? { role: 'user', content: m.conteudo as string }
            : { role: 'assistant', content: m.conteudo as string },
      ),
  ]

  let passouParaHumano = false
  let atendimentoCriado: string | null = null

  for (let rodada = 0; rodada < 3; rodada++) {
    const r = await perguntar(mensagens, FERRAMENTAS)
    await sb.from('uso_ia').insert({
      empresa_id: empresa.id,
      conversa_id: conversa.id,
      modelo: r.modelo,
      tokens_entrada: r.tokensEntrada,
      tokens_saida: r.tokensSaida,
      custo_micro_usd: custoMicroUsd(r.tokensEntrada, r.tokensSaida),
    })

    const chamadas = r.mensagem.tool_calls ?? []
    if (chamadas.length === 0) {
      return { resposta: r.mensagem.content?.trim() || null, passouParaHumano, atendimentoCriado }
    }

    mensagens.push({ role: 'assistant', content: r.mensagem.content, tool_calls: chamadas })

    for (const chamada of chamadas) {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(chamada.function.arguments || '{}')
      } catch {
        // argumento inválido: a resposta da ferramenta explica o erro para o modelo
      }

      let resultado: string
      if (chamada.function.name === 'passar_para_humano') {
        await sb.from('conversas').update({ estado: 'humano' }).eq('id', conversa.id)
        passouParaHumano = true
        resultado = 'Conversa passada para a equipe. Avise o cliente que alguém da empresa vai responder em breve.'
      } else if (chamada.function.name === 'marcar_visita') {
        const r2 = await marcarVisita(sb, empresa.id, conversa, args, vagas)
        if (r2.ok) atendimentoCriado = r2.atendimentoId
        resultado = r2.mensagem
      } else {
        resultado = 'Ferramenta desconhecida.'
      }
      mensagens.push({ role: 'tool', tool_call_id: chamada.id, content: resultado })
    }
  }

  return {
    resposta: passouParaHumano ? 'Vou passar sua mensagem para a equipe, já já alguém te responde.' : null,
    passouParaHumano,
    atendimentoCriado,
  }
}

async function marcarVisita(
  sb: SupabaseClient,
  empresaId: string,
  conversa: { id: string; wa_telefone: string },
  args: Record<string, unknown>,
  vagas: Vaga[],
): Promise<{ ok: true; atendimentoId: string; mensagem: string } | { ok: false; mensagem: string }> {
  const texto = (k: string) => (typeof args[k] === 'string' ? (args[k] as string).trim() : '')
  const nome = texto('nome')
  const endereco = texto('endereco')
  const data = texto('data')
  const periodo = texto('periodo') as Periodo

  if (nome.length < 2) return { ok: false, mensagem: 'Falta o nome do cliente. Pergunte o nome.' }
  if (endereco.length < 5) return { ok: false, mensagem: 'Falta o endereço com número. Pergunte.' }
  if (!PERIODOS.includes(periodo) || !vagas.some((v) => v.data === data && v.periodo === periodo)) {
    return { ok: false, mensagem: 'Esse horário não está na lista de vagas. Ofereça um horário da lista.' }
  }

  // Confere de novo: a vaga pode ter acabado durante a conversa.
  const { data: livres } = await sb.rpc('vagas_livres', { p_empresa: empresaId, p_data: data, p_periodo: periodo })
  if (typeof livres !== 'number' || livres < 1) {
    return { ok: false, mensagem: 'Esse horário acabou de ser preenchido. Ofereça outro da lista.' }
  }

  const bairro = texto('bairro') || null
  const referencia = texto('referencia')
  const { data: cliente, error: erroCliente } = await sb
    .from('clientes')
    .upsert(
      { empresa_id: empresaId, telefone: conversa.wa_telefone, nome, endereco, bairro },
      { onConflict: 'empresa_id,telefone' },
    )
    .select('id')
    .single<{ id: string }>()
  if (erroCliente || !cliente) return { ok: false, mensagem: 'Erro ao salvar o cliente. Passe para humano.' }

  const descricao = [texto('descricao'), referencia ? `Referência: ${referencia}` : ''].filter(Boolean).join('\n')
  const { data: atendimento, error } = await sb
    .from('atendimentos')
    .insert({ empresa_id: empresaId, cliente_id: cliente.id, data, periodo, descricao: descricao || null, origem: 'whatsapp' })
    .select('id')
    .single<{ id: string }>()
  if (error || !atendimento) return { ok: false, mensagem: 'Erro ao marcar. Passe para humano.' }

  await sb.from('conversas').update({ cliente_id: cliente.id }).eq('id', conversa.id)

  return {
    ok: true,
    atendimentoId: atendimento.id,
    mensagem: `Visita marcada para ${descreverVaga({ data, periodo })} (${ROTULO_PERIODO[periodo]}). Confirme ao cliente.`,
  }
}
