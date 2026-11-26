import type { Metadata } from 'next'
import Link from 'next/link'
import { contato, PLATAFORMA } from '@/lib/plataforma'

export const metadata: Metadata = { title: 'Política de Privacidade' }

export default function Privacidade() {
  return (
    <main className="estreito texto-legal">
      <p>
        <Link href="/" className="voltar">
          IA Laura
        </Link>
      </p>
      <h1>Política de Privacidade</h1>
      <p className="fraco">Atualizada em {PLATAFORMA.atualizado}.</p>

      <p>
        A IA Laura é um serviço da {PLATAFORMA.nome}, de responsabilidade de {PLATAFORMA.responsavel}
        {PLATAFORMA.documento ? `, CNPJ ${PLATAFORMA.documento}` : ''}. Esta política explica quais dados tratamos, por quê e quais
        são os seus direitos, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).
      </p>

      <h2>Quem é quem</h2>
      <p>
        <strong>Empresas clientes</strong> (assistências técnicas) contratam a IA Laura para atender os próprios clientes. Para os
        dados dos clientes dessas empresas, a empresa é a <strong>controladora</strong> e a {PLATAFORMA.nome} é a{' '}
        <strong>operadora</strong>: tratamos esses dados só para prestar o serviço contratado. Para os dados de cadastro das empresas
        e de quem usa o painel, a {PLATAFORMA.nome} é a controladora.
      </p>

      <h2>Dados que tratamos</h2>
      <ul>
        <li>Cadastro de quem usa o painel: nome, e-mail, telefone, foto (opcional) e dados da empresa.</li>
        <li>
          Dados dos clientes das empresas: nome, telefone de WhatsApp, endereço do atendimento, mensagens trocadas, áudios
          (transcritos em texto), fotos enviadas (descritas em texto), visitas, orçamentos, avaliações.
        </li>
        <li>Localização do técnico apenas no momento em que ele informa o andamento da visita, quando ele permite no celular.</li>
        <li>Fotos de antes e depois do serviço, quando o técnico envia.</li>
        <li>Dados de pagamento da assinatura, processados pelo Mercado Pago. Não guardamos número de cartão.</li>
      </ul>

      <h2>Para que usamos</h2>
      <ul>
        <li>Responder os clientes no WhatsApp, marcar, confirmar e remarcar visitas, enviar lembretes e pesquisas de satisfação.</li>
        <li>Mostrar à empresa a agenda, os atendimentos e os indicadores do negócio.</li>
        <li>Cobrar a assinatura e prestar suporte.</li>
        <li>Melhorar as respostas da assistente para a própria empresa, a partir das correções que a empresa aprova.</li>
      </ul>
      <p>Não vendemos dados. Não usamos os dados de uma empresa para atender outra.</p>

      <h2>Com quem compartilhamos</h2>
      <p>
        Apenas com os fornecedores necessários para o serviço funcionar: Meta (WhatsApp Business), OpenAI (geração das respostas,
        transcrição de áudio e leitura de fotos, sem uso para treinar modelos dela, conforme os termos da API), Supabase (banco de
        dados), Vercel (hospedagem), Google (login com Google, quando escolhido) e Mercado Pago (cobrança). Quando a empresa também
        usa a Helô, os dois sistemas compartilham dados da mesma empresa para montar o Painel do Dono.
      </p>

      <h2>Por quanto tempo guardamos</h2>
      <p>
        Enquanto a empresa mantiver a conta ativa. Depois do cancelamento, os dados ficam guardados por até 90 dias para permitir a
        volta e então são apagados, exceto o que a lei obriga a manter (por exemplo, registros de cobrança).
      </p>

      <h2>Seus direitos e exclusão de dados</h2>
      <p>
        Você pode pedir acesso, correção, portabilidade ou exclusão dos seus dados {contato()}. Se você é cliente de uma assistência
        técnica que usa a IA Laura, pode pedir diretamente à empresa ou a nós, e encaminhamos o pedido a ela. Para apagar os dados
        ligados ao seu número de WhatsApp, envie o pedido informando o número; respondemos em até 15 dias.
      </p>

      <h2>Segurança</h2>
      <p>
        Os dados ficam em servidores com criptografia em trânsito e em repouso. Cada empresa só enxerga os próprios dados, e o técnico
        não vê o telefone do cliente. Chaves de acesso ficam apenas no servidor.
      </p>

      <h2>Contato</h2>
      <p>Dúvidas sobre esta política: {contato()}.</p>
    </main>
  )
}
