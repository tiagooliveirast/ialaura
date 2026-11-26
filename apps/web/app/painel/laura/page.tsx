import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { completude, lerConhecimento, PERGUNTAR_ANTES, TRANSFERIR_QUANDO } from '@/lib/laura/conhecimento'
import { exigirMembro } from '@/lib/sessao'
import { salvarTreinamento } from './acoes'
import { Simulador } from './Simulador'

export const metadata: Metadata = { title: 'Treinar a Laura' }
export const dynamic = 'force-dynamic'

function Campo({
  nome,
  rotulo,
  valor,
  ajuda,
  linhas,
  max = 1000,
}: {
  nome: string
  rotulo: string
  valor?: string
  ajuda?: string
  linhas?: number
  max?: number
}) {
  return (
    <label className="campo">
      <span>{rotulo}</span>
      {linhas ? (
        <textarea name={nome} rows={linhas} maxLength={max} defaultValue={valor ?? ''} />
      ) : (
        <input name={nome} maxLength={max} defaultValue={valor ?? ''} />
      )}
      {ajuda && <small>{ajuda}</small>}
    </label>
  )
}

export default async function TreinarLaura({ searchParams }: { searchParams: Promise<{ erro?: string; salvo?: string }> }) {
  const { erro, salvo } = await searchParams
  const { sb, membro, empresa } = await exigirMembro()
  if (membro.papel === 'tecnico') redirect('/tecnico')
  const podeEditar = membro.papel === 'dono'

  const [{ data: dados }, { data: servicos }, { data: areas }] = await Promise.all([
    sb.from('empresas').select('valor_visita_centavos, conhecimento').eq('id', empresa.id).single(),
    sb.from('servicos').select('nome').eq('empresa_id', empresa.id).order('nome'),
    sb.from('areas_atendimento').select('bairro, cidade').eq('empresa_id', empresa.id),
  ])
  const c = lerConhecimento(dados?.conhecimento)
  const nome = c.nome_assistente || 'Laura'
  const valor = dados?.valor_visita_centavos != null ? (dados.valor_visita_centavos / 100).toFixed(2).replace('.', ',') : ''
  const pronto = completude(c, dados?.valor_visita_centavos != null, (servicos?.length ?? 0) > 0, (areas?.length ?? 0) > 0)
  const faq = [...(c.faq ?? []), ...Array.from({ length: Math.max(3, 8 - (c.faq?.length ?? 0)) }, () => ({ pergunta: '', resposta: '' }))].slice(0, 20)

  return (
    <div className="treino">
      <div className="cabecalho">
        <div>
          <h1>Treinar a {nome}</h1>
          <p className="apoio">
            Quanto mais você preencher, melhor ela responde. O que ficar vazio, ela não inventa: passa a conversa para você.
          </p>
        </div>
        <div className="completude" aria-label={`Treinamento ${pronto}% completo`}>
          <span className="numero">{pronto}%</span>
          <div className="barra-progresso">
            <div style={{ width: `${pronto}%` }} />
          </div>
          <small className="fraco">do treinamento</small>
        </div>
      </div>

      {erro && (
        <p className="aviso aviso-erro" role="alert">
          {erro}
        </p>
      )}
      {salvo && <p className="aviso aviso-certo" role="status">Treinamento salvo. A {nome} já responde com as informações novas.</p>}

      <div className="treino-grade">
        <form action={salvarTreinamento} className="treino-form">
          <fieldset disabled={!podeEditar} className="sem-borda">
            <details open className="bloco-treino">
              <summary>
                <strong>1. Quem é a assistente</strong>
                <span className="fraco">nome, jeito de falar, saudação</span>
              </summary>
              <div className="formulario">
                <div className="dupla">
                  <Campo nome="nome_assistente" rotulo="Nome da assistente" valor={c.nome_assistente} ajuda="Padrão: Laura" max={40} />
                  <label className="campo">
                    <span>Jeito de falar</span>
                    <select name="tom" defaultValue={c.tom ?? 'proximo'}>
                      <option value="proximo">Próximo e educado</option>
                      <option value="formal">Formal (senhor, senhora)</option>
                      <option value="descontraido">Descontraído</option>
                    </select>
                  </label>
                </div>
                <label className="marcar">
                  <input type="checkbox" name="emojis" defaultChecked={c.emojis} /> Pode usar emojis de vez em quando
                </label>
                <Campo
                  nome="saudacao"
                  rotulo="Primeira mensagem para o cliente"
                  valor={c.saudacao}
                  linhas={2}
                  ajuda={`Por exemplo: Olá! Aqui é a ${nome}, da ${empresa.nome}. Como posso te ajudar?`}
                />
              </div>
            </details>

            <details open className="bloco-treino">
              <summary>
                <strong>2. Sobre a empresa</strong>
                <span className="fraco">o que a Laura conta quando perguntam</span>
              </summary>
              <div className="formulario">
                <Campo nome="descricao" rotulo="Quem é a empresa, em poucas linhas" valor={c.descricao} linhas={3} />
                <Campo nome="diferenciais" rotulo="Diferenciais" valor={c.diferenciais} linhas={2} ajuda="Por exemplo: técnicos certificados, peças originais, atendimento no mesmo dia." />
                <div className="dupla">
                  <Campo nome="anos_mercado" rotulo="Tempo de mercado" valor={c.anos_mercado} max={40} ajuda="Por exemplo: 18 anos" />
                  <Campo nome="instagram" rotulo="Instagram" valor={c.instagram} max={100} />
                </div>
                <Campo nome="site" rotulo="Site" valor={c.site} max={200} />
                <Campo nome="endereco_oficina" rotulo="Endereço da oficina ou loja" valor={c.endereco_oficina} max={300} />
                <label className="marcar">
                  <input type="checkbox" name="atende_na_oficina" defaultChecked={c.atende_na_oficina} /> O cliente pode levar o aparelho até a
                  oficina
                </label>
              </div>
            </details>

            <details open className="bloco-treino">
              <summary>
                <strong>3. Serviços, marcas e preços</strong>
                <span className="fraco">o que você faz e o que pode ser informado</span>
              </summary>
              <div className="formulario">
                <label className="campo">
                  <span>Serviços e aparelhos, um por linha</span>
                  <textarea name="servicos" rows={6} defaultValue={(servicos ?? []).map((s) => s.nome).join('\n')} />
                  <small>Por exemplo: Conserto de geladeira, Instalação de ar-condicionado split, Higienização de máquina de lavar.</small>
                </label>
                <Campo
                  nome="precos"
                  rotulo="Preços que a Laura pode passar"
                  valor={c.precos}
                  linhas={5}
                  max={3000}
                  ajuda="Um por linha. Por exemplo: Higienização de lavadora: R$ 180. Instalação de split 9 a 12 mil BTUs: a partir de R$ 450. O que não estiver aqui, ela diz que o técnico orça na visita."
                />
                <Campo nome="marcas" rotulo="Marcas atendidas" valor={c.marcas} linhas={2} ajuda="Ou escreva: todas as marcas." />
                <Campo nome="nao_atende" rotulo="O que a empresa NÃO atende" valor={c.nao_atende} linhas={2} ajuda="Por exemplo: ar-condicionado central, aparelhos industriais, micro-ondas." />
              </div>
            </details>

            <details open className="bloco-treino">
              <summary>
                <strong>4. Visita técnica</strong>
                <span className="fraco">valor, região, prazo e o que perguntar</span>
              </summary>
              <div className="formulario">
                <div className="dupla">
                  <label className="campo">
                    <span>Valor da visita (R$)</span>
                    <input name="valor_visita" inputMode="decimal" defaultValue={valor} />
                  </label>
                  <Campo nome="prazo" rotulo="Prazo para atender" valor={c.prazo} max={300} ajuda="Por exemplo: em até 2 dias úteis" />
                </div>
                <label className="marcar">
                  <input type="checkbox" name="visita_descontada" defaultChecked={c.visita_descontada} /> A visita é descontada se o cliente
                  aprovar o conserto
                </label>
                <label className="campo">
                  <span>Bairros e cidades atendidos, um por linha</span>
                  <textarea
                    name="areas"
                    rows={5}
                    defaultValue={(areas ?? []).map((a) => (a.bairro ? `${a.bairro}, ${a.cidade}` : a.cidade)).join('\n')}
                  />
                  <small>Escreva "Bairro, Cidade" ou só a cidade, se atende a cidade toda.</small>
                </label>
                <Campo nome="taxa_regiao" rotulo="Taxa ou regra por região" valor={c.taxa_regiao} linhas={2} ajuda="Por exemplo: Camaçari e Dias d'Ávila têm acréscimo de R$ 30 na visita." />
                <Campo nome="urgencia" rotulo="Urgência e atendimento no mesmo dia" valor={c.urgencia} linhas={2} ajuda="Por exemplo: atendemos no mesmo dia se houver vaga, com taxa de R$ 40." />
                <fieldset className="opcoes coluna">
                  <legend>Antes de marcar, a Laura também pergunta</legend>
                  {PERGUNTAR_ANTES.map(([k, rotulo]) => (
                    <label key={k}>
                      <input type="checkbox" name={`perguntar_${k}`} defaultChecked={c.perguntar_antes?.includes(k)} /> {rotulo}
                    </label>
                  ))}
                </fieldset>
              </div>
            </details>

            <details open className="bloco-treino">
              <summary>
                <strong>5. Condições</strong>
                <span className="fraco">pagamento, garantia, horário, cancelamento</span>
              </summary>
              <div className="formulario">
                <Campo nome="pagamento" rotulo="Formas de pagamento" valor={c.pagamento} ajuda="Por exemplo: Pix, dinheiro e cartão em até 3x sem juros." />
                <Campo nome="garantia" rotulo="Garantia" valor={c.garantia} ajuda="Por exemplo: 90 dias no serviço e na peça trocada." />
                <Campo nome="horario" rotulo="Horário de atendimento" valor={c.horario} max={300} ajuda="Por exemplo: segunda a sexta, das 8h às 18h; sábado até 12h." />
                <Campo nome="fora_horario" rotulo="O que dizer fora do horário" valor={c.fora_horario} linhas={2} ajuda="A Laura responde a qualquer hora; aqui você diz como ela explica que a equipe volta no dia seguinte." />
                <Campo nome="cancelamento" rotulo="Cancelamento e remarcação" valor={c.cancelamento} linhas={2} ajuda="Por exemplo: pode remarcar sem custo até a véspera." />
                <Campo nome="orcamento" rotulo="Orçamento" valor={c.orcamento} linhas={2} ajuda="Por exemplo: o orçamento é feito na visita e vale por 7 dias." />
              </div>
            </details>

            <details open className="bloco-treino">
              <summary>
                <strong>6. Perguntas frequentes</strong>
                <span className="fraco">a Laura responde com as suas palavras</span>
              </summary>
              <div className="formulario">
                {faq.map((f, i) => (
                  <div key={i} className="faq-par">
                    <label className="campo">
                      <span>Pergunta {i + 1}</span>
                      <input name={`faq_p_${i}`} maxLength={300} defaultValue={f.pergunta} />
                    </label>
                    <label className="campo">
                      <span>Resposta</span>
                      <textarea name={`faq_r_${i}`} rows={2} maxLength={1000} defaultValue={f.resposta} />
                    </label>
                  </div>
                ))}
              </div>
            </details>

            <details open className="bloco-treino">
              <summary>
                <strong>7. Limites</strong>
                <span className="fraco">quando passar para você e o que nunca dizer</span>
              </summary>
              <div className="formulario">
                <fieldset className="opcoes coluna">
                  <legend>Passar a conversa para a equipe quando</legend>
                  {TRANSFERIR_QUANDO.map(([k, rotulo]) => (
                    <label key={k}>
                      <input type="checkbox" name={`transferir_${k}`} defaultChecked={c.transferir_quando?.includes(k)} /> {rotulo}
                    </label>
                  ))}
                </fieldset>
                <Campo nome="transferir_extra" rotulo="Outra situação para passar para você" valor={c.transferir_extra} linhas={2} />
                <Campo nome="proibido" rotulo="O que a Laura nunca deve dizer ou prometer" valor={c.proibido} linhas={2} ajuda="Por exemplo: não prometer horário exato de chegada; não falar de concorrentes." />
                <Campo nome="observacoes" rotulo="Outras informações importantes" valor={c.observacoes} linhas={4} max={3000} />
              </div>
            </details>
          </fieldset>

          {podeEditar ? (
            <div className="salvar-fixo">
              <button className="botao">Salvar treinamento</button>
            </div>
          ) : (
            <p className="aviso">Só o dono da empresa pode mudar o treinamento.</p>
          )}
        </form>

        <aside className="treino-lado">
          <Simulador nome={nome} />
          <p className="fraco" style={{ marginTop: 8 }}>
            Salve o treinamento antes de testar: o simulador usa a versão salva.
          </p>
        </aside>
      </div>
    </div>
  )
}
