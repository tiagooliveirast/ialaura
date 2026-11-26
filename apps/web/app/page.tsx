import type { Metadata } from 'next'
import Link from 'next/link'
import { PRECOS, reais } from '@ialaura/shared'
import './inicio.css'

export const metadata: Metadata = {
  title: { absolute: 'IA Laura: atendimento e agendamento no WhatsApp para assistência técnica' },
  description:
    'A Laura responde o cliente no WhatsApp, marca a visita na sua agenda, lembra na véspera e pede avaliação no Google. Para técnicos de linha branca e refrigeração.',
}

const perdas = [
  ['Cliente que esperou, fechou com outro', 'Você está com a mão no compressor e o WhatsApp tocando. Quando responde, ele já chamou o próximo da lista.'],
  ['A mesma pergunta, cinquenta vezes', 'Quanto é a visita? Atende no meu bairro? Aceita cartão? Tem garantia? Cada resposta é um serviço parado.'],
  ['Visita marcada que ninguém lembrou', 'O cliente esqueceu, você atravessou a cidade e voltou de mão vazia.'],
  ['Serviço bem feito que ninguém viu', 'O cliente ficou satisfeito, mas ninguém pediu a avaliação. No Google, quem aparece é o concorrente.'],
] as const

const passos = [
  ['O cliente chama', 'No WhatsApp da sua empresa, no número que ele já conhece.'],
  ['A Laura responde', 'Valor da visita, bairros atendidos, formas de pagamento, garantia, aparelhos e serviços. Do jeito que você ensinou.'],
  ['A visita entra na agenda', 'Ela confere as vagas de manhã e de tarde e marca. Você vê no painel, o técnico vê no celular.'],
  ['O resto acontece sozinho', 'Lembrete na véspera, aviso quando o técnico sai, pesquisa no dia seguinte e pedido de avaliação no Google para quem gostou.'],
] as const

const recursos = [
  ['Atendimento no WhatsApp', 'API oficial da Meta, no número da empresa. A qualquer hora, inclusive domingo à noite.'],
  ['Site da empresa', 'Página com seus serviços, sua área de atendimento e agendamento online. Serve para o Google e para o link da bio.'],
  ['Agenda por período', 'Vagas de manhã e de tarde para cada técnico. Ninguém marca duas visitas no mesmo horário.'],
  ['App do técnico', 'Ele vê só os próprios atendimentos, com endereço, e avisa: indo, atrasado, cheguei, finalizei.'],
  ['Lembretes', 'Véspera da visita e manutenção programada: a Laura avisa o cliente e o técnico na hora certa.'],
  ['Avaliação no Google', 'Pesquisa de satisfação no dia seguinte. Quem dá nota alta recebe o link para avaliar sua empresa.'],
  ['Painel do dono', 'Atendimentos por status, conversas e visitas do dia. Você acompanha sem ligar para ninguém.'],
  ['Você assume quando quiser', 'Entrou numa conversa, a Laura sai. Terminou, ela volta.'],
] as const

const duvidas = [
  ['Preciso trocar meu número de WhatsApp?', 'Não. A Laura funciona no número da sua empresa, pela API oficial da Meta. Na configuração você recebe o passo a passo.'],
  ['A Laura responde dúvida técnica de conserto?', 'Não, e é de propósito. Diagnóstico é com você. Ela cuida do atendimento: valor, área, pagamento e agenda.'],
  ['E se o cliente quiser falar com uma pessoa?', 'A Laura passa a conversa para você e para de responder até você liberar.'],
  ['Funciona para quem trabalha sozinho?', 'Foi pensada primeiro para isso. O plano Solo é para um técnico. Contratou alguém, é só adicionar.'],
  ['Tenho fidelidade?', 'Não. A assinatura é mensal e você cancela quando quiser.'],
] as const

export default function Inicio() {
  return (
    <div className="inicio">
      <header className="topo">
        <div className="faixa topo-dentro">
          <span className="logo">IA Laura</span>
          <nav aria-label="Principal">
            <a href="#como-funciona" className="so-largo">
              Como funciona
            </a>
            <a href="#preco" className="so-largo">
              Preço
            </a>
            <Link href="/entrar" className="topo-entrar">
              Entrar
            </Link>
            <Link href="/entrar?modo=cadastro" className="topo-cadastrar">
              Cadastrar
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="faixa abertura">
          <div>
            <p className="sobretitulo">Para assistência técnica de linha branca e refrigeração</p>
            <h1>Enquanto você conserta, a Laura atende o WhatsApp e marca a próxima visita.</h1>
            <p className="abertura-texto">
              Ela responde o cliente na hora, confere a agenda, marca a visita, lembra na véspera e pede avaliação no
              Google para quem gostou. Você só aparece para fazer o serviço.
            </p>
            <div className="acoes">
              <Link href="/entrar?modo=cadastro" className="botao botao-grande">
                Criar minha conta
              </Link>
              <a href="#como-funciona" className="link-seta">
                Ver como funciona
              </a>
            </div>
            <p className="letra-miuda">
              <span className="numero">{reais(PRECOS.soloMensal)}</span> por mês no plano Solo. Sem fidelidade.
            </p>
          </div>

          <figure className="conversa">
            <figcaption>
              <strong>Sua empresa</strong>
              <span>respondido pela Laura</span>
            </figcaption>
            <ol>
              <li className="msg msg-cliente">
                Boa noite. Minha geladeira parou de gelar embaixo. Vocês atendem em Itapuã?
                <time>21:47</time>
              </li>
              <li className="msg msg-laura">
                Boa noite! Atendemos em Itapuã, sim. A visita técnica custa R$ 90 e, se você aprovar o conserto, esse valor
                é descontado. Tenho vaga amanhã à tarde ou quinta de manhã. Qual fica melhor?
                <time>21:47</time>
              </li>
              <li className="msg msg-cliente">
                Amanhã à tarde
                <time>21:48</time>
              </li>
              <li className="msg msg-laura">
                Pronto, visita marcada para amanhã à tarde. Me passa o endereço com número e um ponto de referência?
                <time>21:48</time>
              </li>
            </ol>
            <p className="conversa-nota">Exemplo ilustrativo. Valores e regras são os que você cadastrar.</p>
          </figure>
        </section>

        <section className="bloco bloco-escuro">
          <div className="faixa">
            <h2>Quanto serviço escapa por falta de quem atenda</h2>
            <ul className="perdas">
              {perdas.map(([titulo, texto]) => (
                <li key={titulo}>
                  <h3>{titulo}</h3>
                  <p>{texto}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="como-funciona" className="bloco">
          <div className="faixa">
            <h2>Como funciona</h2>
            <ol className="passos">
              {passos.map(([titulo, texto], i) => (
                <li key={titulo}>
                  <span className="passo-numero numero">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <h3>{titulo}</h3>
                    <p>{texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bloco bloco-papel">
          <div className="faixa">
            <h2>O que vem na assinatura</h2>
            <dl className="recursos">
              {recursos.map(([titulo, texto]) => (
                <div key={titulo}>
                  <dt>{titulo}</dt>
                  <dd>{texto}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="bloco">
          <figure className="faixa autor">
            <blockquote>
              Passei 18 anos atendendo cliente com uma mão e segurando a ferramenta com a outra. A Laura é o que eu queria
              ter tido: alguém que atende bem enquanto eu trabalho.
            </blockquote>
            <figcaption>Tiago Oliveira, técnico de refrigeração e criador da IA Laura</figcaption>
          </figure>
        </section>

        <section id="preco" className="bloco bloco-papel">
          <div className="faixa">
            <h2>Preço</h2>
            <div className="planos">
              <article className="plano plano-destaque">
                <h3>Solo</h3>
                <p className="plano-preco numero">
                  {reais(PRECOS.soloMensal)}
                  <span>por mês</span>
                </p>
                <p className="plano-para">Para quem atende sozinho.</p>
                <ul>
                  <li>Atendimento da Laura no WhatsApp</li>
                  <li>Site da empresa com agendamento online</li>
                  <li>Agenda, lembretes e pesquisa de satisfação</li>
                  <li>Pedido de avaliação no Google</li>
                </ul>
                <Link href="/entrar?modo=cadastro" className="botao">
                  Criar minha conta
                </Link>
              </article>
              <article className="plano">
                <h3>Equipe</h3>
                <p className="plano-preco numero">
                  + {reais(PRECOS.tecnicoAdicional)}
                  <span>por técnico, por mês</span>
                </p>
                <p className="plano-para">Tudo do plano Solo, mais um acesso para cada técnico.</p>
                <ul>
                  <li>App do técnico com a agenda dele</li>
                  <li>Status em tempo real: indo, atrasado, finalizado</li>
                  <li>Vagas multiplicadas pelo número de técnicos</li>
                  <li>Nota do técnico na pesquisa de satisfação</li>
                </ul>
                <p className="plano-exemplo">
                  Exemplo: dono e mais 2 técnicos ={' '}
                  <span className="numero">{reais(PRECOS.soloMensal + 2 * PRECOS.tecnicoAdicional)}</span> por mês.
                </p>
              </article>
            </div>
            <p className="letra-miuda">Assinatura mensal, sem fidelidade.</p>
          </div>
        </section>

        <section className="bloco">
          <div className="faixa faixa-estreita">
            <h2>Dúvidas comuns</h2>
            <div className="duvidas">
              {duvidas.map(([pergunta, resposta]) => (
                <details key={pergunta}>
                  <summary>{pergunta}</summary>
                  <p>{resposta}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bloco bloco-escuro fechamento">
          <div className="faixa">
            <h2>O próximo cliente vai chamar hoje. Quem vai responder?</h2>
            <Link href="/entrar?modo=cadastro" className="botao botao-grande">
              Criar minha conta
            </Link>
          </div>
        </section>
      </main>

      <footer className="rodape">
        <div className="faixa rodape-dentro">
          <span>IA Laura</span>
          <Link href="/entrar">Entrar</Link>
        </div>
      </footer>
    </div>
  )
}
