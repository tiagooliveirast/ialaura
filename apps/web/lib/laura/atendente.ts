import { hojeEm, PERIODOS, reais, ROTULO_PERIODO, type Periodo } from '@ialaura/shared'
import type { supabaseAdmin } from '@/lib/supabase/admin'
import { descreverVaga, proximosDias, vagasDisponiveis, type Vaga } from './agenda'
import { lerConhecimento, PERGUNTAR_ANTES, TRANSFERIR_QUANDO, type Conhecimento } from './conhecimento'
import { custoMicroUsd, perguntar, type Ferramenta, type MensagemIA } from './ia'
import { licoesAtivas, SITUACOES_HUMANAS, type Licao } from './licoes'

type SupabaseClient = ReturnType<typeof supabaseAdmin>

export type EmpresaIA = {
  id: string
  nome: string
  cidade: string | null
  uf: string | null
  fuso: string
  valor_visita_centavos: number | null
  conhecimento: unknown
}

export type Imagem = { link: string; legenda: string }

export type ResultadoAtendente = {
  imagens: Imagem[]
  resposta: string | null
  passouParaHumano: boolean
  atendimentoCriado: string | null
  acoes: string[]
}

export type Turno = { autor: 'cliente' | 'laura'; texto: string }

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
          descricao: { type: 'string', description: 'Aparelho, marca, modelo e o problema relatado pelo cliente' },
        },
        required: ['nome', 'endereco', 'data', 'periodo', 'descricao'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirmar_visita',
      description:
        'Marca como confirmada uma visita da lista VISITAS DESTE CLIENTE. Use quando o cliente confirmar que vai estar em casa (por exemplo "Confirmo", "Pode vir", "ok, estarei aqui").',
      parameters: {
        type: 'object',
        properties: { visita: { type: 'string', description: 'Código da visita, exatamente como na lista VISITAS DESTE CLIENTE' } },
        required: ['visita'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remarcar_visita',
      description:
        'Muda a data de uma visita que o cliente já tem marcada (lista VISITAS DESTE CLIENTE). Só chame depois que o cliente escolheu um novo horário da lista de vagas.',
      parameters: {
        type: 'object',
        properties: {
          visita: { type: 'string', description: 'Código da visita, exatamente como na lista VISITAS DESTE CLIENTE' },
          data: { type: 'string', description: 'Nova data AAAA-MM-DD, exatamente como na lista de vagas' },
          periodo: { type: 'string', enum: [...PERIODOS] },
        },
        required: ['visita', 'data', 'periodo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'desmarcar_visita',
      description:
        'Desmarca uma visita que o cliente já tem marcada. Use quando o cliente pedir para cancelar, ou quando ele não puder agora e preferir remarcar depois (por exemplo luto, doença, viagem). Antes, confirme com o cliente.',
      parameters: {
        type: 'object',
        properties: {
          visita: { type: 'string', description: 'Código da visita, exatamente como na lista VISITAS DESTE CLIENTE' },
          motivo: { type: 'string', description: 'Motivo em poucas palavras, como o cliente contou' },
          remarcar_depois: { type: 'boolean', description: 'true se o cliente quer remarcar mais tarde' },
        },
        required: ['visita', 'motivo', 'remarcar_depois'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'passar_para_humano',
      description:
        'Passa a conversa para uma pessoa da empresa e para de responder. Use nas situações listadas em QUANDO PASSAR PARA A EQUIPE, quando o cliente pedir para falar com alguém, ou quando a pergunta não estiver respondida nas informações da empresa.',
      parameters: { type: 'object', properties: { motivo: { type: 'string' } }, required: ['motivo'] },
    },
  },
]

const TOM: Record<NonNullable<Conhecimento['tom']>, string> = {
  proximo: 'educado e próximo, como uma boa atendente de balcão; trate o cliente por "você"',
  formal: 'formal e cordial; trate o cliente por "o senhor" ou "a senhora" até ele pedir o contrário',
  descontraido: 'leve e descontraído, sem perder a educação; trate o cliente por "você"',
}

function linha(rotulo: string, valor: string | undefined | null): string {
  return valor ? `- ${rotulo}: ${valor}` : ''
}

export type VisitaCliente = { id: string; codigo: string; data: string; periodo: Periodo; descricao: string | null }

export function montarInstrucoes(
  empresa: EmpresaIA,
  servicos: string[],
  areas: string[],
  vagas: Vaga[],
  hoje: string,
  licoes: Licao[] = [],
  visitasCliente: VisitaCliente[] = [],
): string {
  const c = lerConhecimento(empresa.conhecimento)
  const nome = c.nome_assistente || 'Laura'
  const onde = empresa.cidade ? ` em ${empresa.cidade}${empresa.uf ? `-${empresa.uf}` : ''}` : ''
  const perguntar = (c.perguntar_antes ?? []).map((k) => PERGUNTAR_ANTES.find(([x]) => x === k)?.[1]).filter(Boolean)
  const transferir = (c.transferir_quando ?? []).map((k) => TRANSFERIR_QUANDO.find(([x]) => x === k)?.[1]).filter(Boolean)

  const partes = [
    `Você é ${nome}, atendente da empresa "${empresa.nome}", uma assistência técnica${onde}.`,
    'Você responde clientes pelo WhatsApp. Seu trabalho é tirar dúvidas de atendimento e marcar a visita técnica.',
    '',
    'COMO ESCREVER',
    `- Tom: ${TOM[c.tom ?? 'proximo']}.`,
    '- Mensagens curtas: no máximo três frases. Uma pergunta por vez.',
    c.emojis ? '- Pode usar um emoji de vez em quando, sem exagero.' : '- Não use emojis.',
    c.saudacao ? `- Na primeira mensagem da conversa, cumprimente assim (pode adaptar): "${c.saudacao}"` : '',
    '',
    'REGRAS QUE VOCÊ NUNCA QUEBRA',
    '- Use SOMENTE as informações abaixo. Se não estiver aqui, diga que vai confirmar com a equipe e chame passar_para_humano.',
    '- Nunca dê diagnóstico, nunca diga qual pode ser o defeito. Diga que o técnico avalia na visita.',
    '- Nunca invente preço, prazo, desconto ou horário. Ofereça só os horários da lista de vagas.',
    '- Não fale de assuntos fora do atendimento da empresa.',
    c.proibido ? `- Nunca diga ou prometa: ${c.proibido}` : '',
    '',
    'PARA MARCAR A VISITA',
    '- Pergunte qual é o aparelho e o que está acontecendo.',
    perguntar.length ? `- Antes de marcar, pergunte também: ${perguntar.join('; ')}.` : '',
    '- Ofereça até 3 horários da lista de vagas.',
    '- Peça nome e endereço com número e bairro. Depois chame marcar_visita.',
    '- Depois de marcar, confirme o dia e o período em uma frase.',
    '',
    SITUACOES_HUMANAS,
    '',
    'VISITA JÁ MARCADA',
    '- Na véspera a empresa pede confirmação ao cliente. Se ele confirmar ("Confirmo", "Pode vir", "ok"), chame confirmar_visita e agradeça em uma frase curta.',
    '- Se ele tocar em "Preciso remarcar", pergunte com gentileza qual dia fica melhor e ofereça os horários da lista de vagas.',
    '- Se o cliente não puder no dia, ofereça remarcar com os horários da lista de vagas e chame remarcar_visita.',
    '- Se ele não souber quando vai poder, chame desmarcar_visita com remarcar_depois = true e diga que fica à disposição: é só chamar quando quiser.',
    '- Nunca pressione o cliente para manter a visita.',
    '',
    'ORÇAMENTO QUE NÃO FECHOU',
    '- Se o cliente responder à mensagem sobre o orçamento e quiser fazer o conserto ("Quero agendar" ou "Aprovo o conserto"), marque a visita com marcar_visita; na descrição comece com "Conserto aprovado:" e o valor do orçamento.',
    '- Se tiver dúvida, responda com as informações da empresa; dúvida técnica ou pedido de desconto vai para a equipe.',
    '- Mensagem de manutenção de retorno: se o cliente quiser ("Quero agendar"), marque a visita com marcar_visita citando o serviço de manutenção.',
    '- Se disser "Agora não", agradeça, diga que fica à disposição e pergunte só uma vez, com leveza, se algo pesou na decisão. Não insista e não ofereça desconto.',
    '',
    'QUANDO PASSAR PARA A EQUIPE (chame passar_para_humano)',
    '- O cliente pede para falar com uma pessoa.',
    ...transferir.map((t) => `- ${t}.`),
    c.transferir_extra ? `- ${c.transferir_extra}` : '',
    '',
    `HOJE: ${hoje}`,
    '',
    'SOBRE A EMPRESA',
    linha('Quem somos', c.descricao),
    linha('Diferenciais', c.diferenciais),
    linha('Tempo de mercado', c.anos_mercado),
    c.endereco_oficina
      ? `- Endereço: ${c.endereco_oficina}${c.atende_na_oficina ? ' (o cliente também pode levar o aparelho até lá)' : ' (atendimento só a domicílio)'}`
      : '',
    linha('Site', c.site),
    linha('Instagram', c.instagram),
    '',
    'SERVIÇOS, MARCAS E PREÇOS',
    servicos.length ? `- Serviços e aparelhos: ${servicos.join('; ')}` : '- Serviços: não informados (pergunte à equipe).',
    linha('Marcas atendidas', c.marcas),
    linha('NÃO atendemos', c.nao_atende),
    c.precos ? `- Preços que você pode informar (só estes):\n${c.precos}` : '- Preço de serviço: não informe; diga que o técnico passa o orçamento na visita.',
    '',
    'VISITA TÉCNICA',
    empresa.valor_visita_centavos != null
      ? `- Valor da visita: ${reais(empresa.valor_visita_centavos)}${c.visita_descontada ? ', descontado do serviço se o cliente aprovar o conserto' : ''}.`
      : '- Valor da visita: não informado (se perguntarem, passe para a equipe).',
    linha('Taxa ou regra por região', c.taxa_regiao),
    areas.length ? `- Atendemos em: ${areas.join('; ')}` : '- Área de atendimento: não informada (se perguntarem, passe para a equipe).',
    linha('Prazo para atender', c.prazo),
    linha('Urgência e mesmo dia', c.urgencia),
    '',
    'CONDIÇÕES',
    linha('Formas de pagamento', c.pagamento),
    c.pix_chave ? `- Chave Pix da empresa (pode passar quando o cliente pedir para pagar): ${c.pix_chave}${c.pix_nome ? `, em nome de ${c.pix_nome}` : ''}` : '',
    linha('Garantia', c.garantia),
    linha('Horário de atendimento', c.horario),
    linha('Se o cliente chamar fora do horário', c.fora_horario),
    linha('Cancelamento e remarcação', c.cancelamento),
    linha('Orçamento', c.orcamento),
    linha('Outras informações', c.observacoes),
    '',
    ...(c.faq?.length
      ? ['PERGUNTAS FREQUENTES (responda com estas palavras, adaptando ao contexto)', ...c.faq.map((f) => `- P: ${f.pergunta}\n  R: ${f.resposta}`), '']
      : []),
    ...(licoes.length
      ? [
          'LIÇÕES DO DONO (a empresa ensinou assim; siga o jeito e as palavras, adaptando ao contexto. Elas valem mais que o jeito padrão)',
          ...licoes.map((l) => `- Quando: ${l.situacao}\n  Responda assim: ${l.resposta_ideal}`),
          '',
        ]
      : []),
    ...(visitasCliente.length
      ? [
          'VISITAS DESTE CLIENTE (código | data | período | o que é)',
          ...visitasCliente.map((v) => `- ${v.codigo} | ${v.data} | ${v.periodo} (${descreverVaga(v)}) | ${v.descricao ?? 'sem descrição'}`),
          '',
        ]
      : []),
    'VAGAS DISPONÍVEIS (data AAAA-MM-DD | período)',
    ...(vagas.length
      ? vagas.slice(0, 12).map((v) => `- ${v.data} | ${v.periodo} (${descreverVaga(v)})`)
      : ['- Nenhuma vaga nos próximos dias. Diga que a agenda está cheia e passe para a equipe.']),
  ]
  return partes.filter((l) => l !== '').join('\n')
}

async function contexto(sb: SupabaseClient, empresa: EmpresaIA, telefone: string | null, visitasFicticias: VisitaCliente[] = []) {
  const hoje = hojeEm(empresa.fuso)
  const c = lerConhecimento(empresa.conhecimento)
  const [{ data: servicos }, { data: areas }, licoes, visitas] = await Promise.all([
    sb.from('servicos').select('nome, aparelho').eq('empresa_id', empresa.id).eq('ativo', true),
    sb.from('areas_atendimento').select('cidade, bairro').eq('empresa_id', empresa.id),
    licoesAtivas(sb, empresa.id),
    telefone ? visitasDoCliente(sb, empresa.id, telefone, hoje) : Promise.resolve(visitasFicticias),
  ])
  const vagas = await vagasDisponiveis(sb, empresa.id, proximosDias(hoje, 7, c).filter((d) => d > hoje))
  const sistema = montarInstrucoes(
    empresa,
    (servicos ?? []).map((s) => [s.nome, s.aparelho].filter(Boolean).join(' - ')),
    (areas ?? []).map((a) => [a.bairro, a.cidade].filter(Boolean).join(', ')),
    vagas,
    hoje,
    licoes,
    visitas,
  )
  return { sistema, vagas, visitas }
}

/** Visitas futuras do cliente desta conversa. O código curto evita mostrar o id inteiro ao modelo. */
async function visitasDoCliente(sb: SupabaseClient, empresaId: string, telefone: string, hoje: string): Promise<VisitaCliente[]> {
  const { data: cliente } = await sb
    .from('clientes')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('telefone', telefone)
    .maybeSingle<{ id: string }>()
  if (!cliente) return []
  const { data } = await sb
    .from('atendimentos')
    .select('id, data, periodo, descricao')
    .eq('empresa_id', empresaId)
    .eq('cliente_id', cliente.id)
    .gte('data', hoje)
    .in('status', ['agendado', 'confirmado', 'atrasado'])
    .order('data')
    .limit(5)
  return (data ?? []).map((a) => ({ id: a.id, codigo: a.id.slice(0, 8), data: a.data, periodo: a.periodo as Periodo, descricao: a.descricao }))
}

type Executor = (nome: string, args: Record<string, unknown>, vagas: Vaga[], visitas: VisitaCliente[]) => Promise<{ resultado: string; acao?: string; atendimentoId?: string; humano?: boolean; imagem?: Imagem }>

/** Laço da conversa com o modelo: até 3 rodadas de ferramenta. */
async function conversar(
  sb: SupabaseClient,
  empresa: EmpresaIA,
  turnos: Turno[],
  executar: Executor,
  conversaId: string | null,
  telefone: string | null,
  visitasFicticias: VisitaCliente[] = [],
): Promise<ResultadoAtendente> {
  const { sistema, vagas, visitas } = await contexto(sb, empresa, telefone, visitasFicticias)
  const mensagens: MensagemIA[] = [
    { role: 'system', content: sistema },
    ...turnos.map((t): MensagemIA => (t.autor === 'cliente' ? { role: 'user', content: t.texto } : { role: 'assistant', content: t.texto })),
  ]

  let passouParaHumano = false
  let atendimentoCriado: string | null = null
  const acoes: string[] = []
  const imagens: Imagem[] = []

  for (let rodada = 0; rodada < 3; rodada++) {
    const r = await perguntar(mensagens, FERRAMENTAS)
    await sb.from('uso_ia').insert({
      empresa_id: empresa.id,
      conversa_id: conversaId,
      modelo: r.modelo,
      tokens_entrada: r.tokensEntrada,
      tokens_saida: r.tokensSaida,
      custo_micro_usd: custoMicroUsd(r.tokensEntrada, r.tokensSaida),
    })

    const chamadas = r.mensagem.tool_calls ?? []
    if (chamadas.length === 0) {
      return { resposta: r.mensagem.content?.trim() || null, passouParaHumano, atendimentoCriado, acoes, imagens }
    }
    mensagens.push({ role: 'assistant', content: r.mensagem.content, tool_calls: chamadas })

    for (const chamada of chamadas) {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(chamada.function.arguments || '{}')
      } catch {
        // argumento inválido: o executor responde com erro para o modelo corrigir
      }
      const e = await executar(chamada.function.name, args, vagas, visitas)
      if (e.humano) passouParaHumano = true
      if (e.atendimentoId) atendimentoCriado = e.atendimentoId
      if (e.acao) acoes.push(e.acao)
      if (e.imagem) imagens.push(e.imagem)
      mensagens.push({ role: 'tool', tool_call_id: chamada.id, content: e.resultado })
    }
  }

  return {
    resposta: passouParaHumano ? 'Vou passar sua mensagem para a equipe, já já alguém te responde.' : null,
    passouParaHumano,
    atendimentoCriado,
    acoes,
    imagens,
  }
}

/** Atendimento real no WhatsApp: lê o histórico do banco e executa as ferramentas de verdade. */
export async function atender(
  sb: SupabaseClient,
  empresa: EmpresaIA,
  conversa: { id: string; wa_telefone: string },
): Promise<ResultadoAtendente> {
  const { data: historico } = await sb
    .from('mensagens')
    .select('autor, conteudo, tipo')
    .eq('conversa_id', conversa.id)
    .order('criado_em', { ascending: false })
    .limit(20)
  const turnos: Turno[] = (historico ?? [])
    .reverse()
    .filter((m) => m.conteudo)
    .map((m) => ({
      autor: m.autor === 'cliente' ? 'cliente' : 'laura',
      texto: m.tipo === 'audio' ? `(áudio transcrito) ${m.conteudo}` : (m.conteudo as string),
    }))

  return conversar(
    sb,
    empresa,
    turnos,
    async (nome, args, vagas, visitas) => {
      if (nome === 'remarcar_visita' || nome === 'desmarcar_visita' || nome === 'confirmar_visita') {
        return mexerNaVisita(sb, empresa.id, nome, args, vagas, visitas)
      }
      if (nome === 'passar_para_humano') {
        await sb.from('conversas').update({ estado: 'humano' }).eq('id', conversa.id)
        return { resultado: 'Conversa passada para a equipe. Avise o cliente que alguém da empresa vai responder em breve.', humano: true }
      }
      if (nome === 'marcar_visita') {
        const r = await marcarVisita(sb, empresa.id, conversa, args, vagas)
        return r.ok ? { resultado: r.mensagem, atendimentoId: r.atendimentoId } : { resultado: r.mensagem }
      }
      return { resultado: 'Ferramenta desconhecida.' }
    },
    conversa.id,
    conversa.wa_telefone,
  )
}

/** Simulação no painel: mesma inteligência, nada é gravado nem enviado. */
export async function simular(
  sb: SupabaseClient,
  empresa: EmpresaIA,
  turnos: Turno[],
  comVisitaMarcada = false,
): Promise<ResultadoAtendente> {
  const ficticia: VisitaCliente[] = []
  if (comVisitaMarcada) {
    const hoje = hojeEm(empresa.fuso)
    const [amanha] = proximosDias(hoje, 3, lerConhecimento(empresa.conhecimento)).filter((d) => d > hoje)
    if (amanha) ficticia.push({ id: '', codigo: 'teste001', data: amanha, periodo: 'manha', descricao: 'Geladeira não está gelando (visita de teste)' })
  }
  return conversar(
    sb,
    empresa,
    turnos,
    async (nome, args, vagas, visitas) => {
      if (nome === 'remarcar_visita' || nome === 'desmarcar_visita' || nome === 'confirmar_visita') {
        const v = visitas.find((x) => x.codigo === String(args.visita ?? ''))
        if (!v) return { resultado: 'Visita não encontrada na lista VISITAS DESTE CLIENTE.' }
        if (nome === 'confirmar_visita') {
          return { resultado: 'Visita confirmada. Agradeça ao cliente.', acao: `Confirmaria a visita de ${descreverVaga(v)}` }
        }
        if (nome === 'desmarcar_visita') {
          return {
            resultado: 'Visita desmarcada. Confirme ao cliente com cuidado.',
            acao: `Desmarcaria a visita de ${descreverVaga(v)} (motivo: ${String(args.motivo ?? '')}${args.remarcar_depois ? '; cliente quer remarcar depois' : ''})`,
          }
        }
        const data = String(args.data ?? '')
        const periodo = String(args.periodo ?? '') as Periodo
        if (!vagas.some((x) => x.data === data && x.periodo === periodo)) {
          return { resultado: 'Esse horário não está na lista de vagas. Ofereça um horário da lista.' }
        }
        return {
          resultado: `Visita remarcada para ${descreverVaga({ data, periodo })}. Confirme ao cliente.`,
          acao: `Remarcaria a visita de ${descreverVaga(v)} para ${descreverVaga({ data, periodo })}`,
        }
      }
      if (nome === 'passar_para_humano') {
        return {
          resultado: 'Conversa passada para a equipe. Avise o cliente que alguém vai responder em breve.',
          humano: true,
          acao: `Passaria a conversa para a equipe (motivo: ${String(args.motivo ?? 'não informado')})`,
        }
      }
      if (nome === 'marcar_visita') {
        const data = String(args.data ?? '')
        const periodo = String(args.periodo ?? '') as Periodo
        if (!vagas.some((v) => v.data === data && v.periodo === periodo)) {
          return { resultado: 'Esse horário não está na lista de vagas. Ofereça um horário da lista.' }
        }
        return {
          resultado: `Visita marcada para ${descreverVaga({ data, periodo })} (${ROTULO_PERIODO[periodo]}). Confirme ao cliente.`,
          acao: `Marcaria visita: ${String(args.nome ?? '')}, ${String(args.endereco ?? '')}, ${descreverVaga({ data, periodo })}. ${String(args.descricao ?? '')}`,
        }
      }
      return { resultado: 'Ferramenta desconhecida.' }
    },
    null,
    null,
    ficticia,
  )
}

/** Remarcar ou desmarcar de verdade. A troca de status cai na linha do tempo pelo gatilho do banco. */
async function mexerNaVisita(
  sb: SupabaseClient,
  empresaId: string,
  nome: 'remarcar_visita' | 'desmarcar_visita' | 'confirmar_visita',
  args: Record<string, unknown>,
  vagas: Vaga[],
  visitas: VisitaCliente[],
): Promise<{ resultado: string; acao?: string; imagem?: Imagem }> {
  const codigo = typeof args.visita === 'string' ? args.visita.trim() : ''
  const escolhida = visitas.find((v) => v.codigo === codigo)
  if (!escolhida) {
    return { resultado: 'Visita não encontrada na lista VISITAS DESTE CLIENTE. Confira o código.' }
  }
  const { data: alvo } = await sb
    .from('atendimentos')
    .select('id, descricao')
    .eq('empresa_id', empresaId)
    .eq('id', escolhida.id)
    .in('status', ['agendado', 'confirmado', 'atrasado'])
    .maybeSingle<{ id: string; descricao: string | null }>()
  if (!alvo) return { resultado: 'Não achei essa visita. Passe para a equipe.' }

  if (nome === 'confirmar_visita') {
    const { error } = await sb.from('atendimentos').update({ status: 'confirmado' }).eq('id', alvo.id)
    if (error) return { resultado: 'Erro ao confirmar. Passe para a equipe.' }
    // Foto de quem vai: o cliente vê o rosto de quem vai entrar na casa dele.
    const { data: quem } = await sb
      .from('atendimentos')
      .select('tecnico:membros(nome, foto_url)')
      .eq('id', alvo.id)
      .single()
    const tecnico = (quem as unknown as { tecnico: { nome: string; foto_url: string | null } | null } | null)?.tecnico
    if (tecnico?.foto_url) {
      const nome = tecnico.nome.trim().split(/\s+/)[0]
      return {
        resultado: `Visita confirmada. A foto do técnico ${nome} já vai para o cliente; agradeça e diga que é ele quem vai.`,
        acao: 'confirmou',
        imagem: { link: tecnico.foto_url, legenda: `Este é o ${nome}, da nossa equipe. É ele quem vai até você.` },
      }
    }
    return { resultado: 'Visita confirmada. Agradeça ao cliente.', acao: 'confirmou' }
  }

  if (nome === 'desmarcar_visita') {
    const motivo = String(args.motivo ?? '').slice(0, 200)
    const nota = `Desmarcada pela Laura a pedido do cliente: ${motivo}${args.remarcar_depois ? ' (quer remarcar depois)' : ''}`
    const { error } = await sb
      .from('atendimentos')
      .update({ status: 'cancelado', descricao: [alvo.descricao, nota].filter(Boolean).join('\n') })
      .eq('id', alvo.id)
    if (error) return { resultado: 'Erro ao desmarcar. Passe para a equipe.' }
    return { resultado: 'Visita desmarcada. Confirme ao cliente com cuidado.', acao: nota }
  }

  const data = String(args.data ?? '')
  const periodo = String(args.periodo ?? '') as Periodo
  if (!PERIODOS.includes(periodo) || !vagas.some((v) => v.data === data && v.periodo === periodo)) {
    return { resultado: 'Esse horário não está na lista de vagas. Ofereça um horário da lista.' }
  }
  const { data: livres } = await sb.rpc('vagas_livres', { p_empresa: empresaId, p_data: data, p_periodo: periodo })
  if (typeof livres !== 'number' || livres < 1) return { resultado: 'Esse horário acabou de ser preenchido. Ofereça outro.' }
  const { error } = await sb.from('atendimentos').update({ data, periodo, status: 'agendado' }).eq('id', alvo.id)
  if (error) return { resultado: 'Erro ao remarcar. Passe para a equipe.' }
  return { resultado: `Visita remarcada para ${descreverVaga({ data, periodo })}. Confirme ao cliente.`, acao: 'remarcou' }
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

  const { data: livres } = await sb.rpc('vagas_livres', { p_empresa: empresaId, p_data: data, p_periodo: periodo })
  if (typeof livres !== 'number' || livres < 1) {
    return { ok: false, mensagem: 'Esse horário acabou de ser preenchido. Ofereça outro da lista.' }
  }

  const bairro = texto('bairro') || null
  const referencia = texto('referencia')
  const { data: cliente, error: erroCliente } = await sb
    .from('clientes')
    .upsert({ empresa_id: empresaId, telefone: conversa.wa_telefone, nome, endereco, bairro }, { onConflict: 'empresa_id,telefone' })
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
  // Cliente com orçamento em aberto marcou de novo: conta como orçamento recuperado pela Laura.
  await sb
    .from('atendimentos')
    .update({ orcamento_status: 'recuperado', recuperado_em: new Date().toISOString() })
    .eq('empresa_id', empresaId)
    .eq('cliente_id', cliente.id)
    .in('orcamento_status', ['pensando', 'recusado'])
  return {
    ok: true,
    atendimentoId: atendimento.id,
    mensagem: `Visita marcada para ${descreverVaga({ data, periodo })} (${ROTULO_PERIODO[periodo]}). Confirme ao cliente.`,
  }
}
