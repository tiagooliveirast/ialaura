import type { Metadata } from 'next'
import Link from 'next/link'
import { PRECOS, reais } from '@ialaura/shared'
import { contato, PLATAFORMA } from '@/lib/plataforma'

export const metadata: Metadata = { title: 'Termos de Uso' }

export default function Termos() {
  return (
    <main className="estreito texto-legal">
      <p>
        <Link href="/" className="voltar">
          IA Laura
        </Link>
      </p>
      <h1>Termos de Uso</h1>
      <p className="fraco">Atualizados em {PLATAFORMA.atualizado}.</p>

      <p>
        Estes termos valem para quem contrata ou usa a IA Laura, serviço da {PLATAFORMA.nome}
        {PLATAFORMA.documento ? `, CNPJ ${PLATAFORMA.documento}` : ''}. Ao criar a conta, você concorda com eles.
      </p>

      <h2>O serviço</h2>
      <p>
        A IA Laura oferece site da empresa com agendamento, atendimento automático no WhatsApp por assistente virtual, agenda,
        lembretes, pesquisa de satisfação e painéis de acompanhamento. A assistente responde com base nas informações que a empresa
        cadastra; a empresa é responsável por mantê-las corretas (preços, horários, condições).
      </p>

      <h2>Assinatura e cobrança</h2>
      <p>
        Assinatura mensal, sem fidelidade: {reais(PRECOS.soloMensal)} por mês no plano Solo e {reais(PRECOS.tecnicoAdicional)} por
        técnico adicional. A cobrança é feita pelo Mercado Pago. O cancelamento pode ser feito a qualquer momento e vale a partir do
        próximo ciclo; não há devolução proporcional do mês em curso. Os preços podem mudar com aviso de 30 dias.
      </p>

      <h2>WhatsApp</h2>
      <p>
        O atendimento usa a API oficial do WhatsApp Business, da Meta. A empresa precisa de um número próprio para isso e deve seguir
        as políticas do WhatsApp Business, como não enviar propaganda a quem não pediu. Bloqueios ou limitações aplicados pela Meta ao
        número da empresa não são de responsabilidade da {PLATAFORMA.nome}.
      </p>

      <h2>Limites da assistente</h2>
      <p>
        A assistente não faz diagnóstico técnico, não promete descontos nem prazos fora do que a empresa cadastrou e passa a conversa
        para a equipe quando necessário. Respostas automáticas podem conter erros; a empresa acompanha as conversas pelo painel e pode
        corrigir a assistente a qualquer momento. A {PLATAFORMA.nome} não garante número mínimo de clientes ou de visitas, que
        dependem da procura de cada empresa.
      </p>

      <h2>Uso proibido</h2>
      <p>
        Não é permitido usar o serviço para spam, golpes, conteúdo ilegal ou para atender negócios diferentes do cadastrado. Nesses
        casos a conta pode ser suspensa.
      </p>

      <h2>Dados</h2>
      <p>
        O tratamento de dados segue a nossa <Link href="/privacidade">Política de Privacidade</Link>. A empresa garante que tem base
        legal para tratar os dados dos próprios clientes pelo serviço.
      </p>

      <h2>Contato</h2>
      <p>Dúvidas e suporte: {contato()}.</p>
    </main>
  )
}
