import { PRECOS, reais } from '@ialaura/shared'

const entregas = [
  ['Responde no WhatsApp', 'Valor da visita, formas de pagamento, bairros atendidos e garantia, na hora, a qualquer hora.'],
  ['Marca a visita', 'Confere as vagas de manhã e de tarde e fecha o horário sem você parar o serviço.'],
  ['Avisa antes', 'Lembra o cliente na véspera e avisa quando a manutenção programada está chegando.'],
  ['Pergunta como foi', 'No dia seguinte, pede a nota do atendimento. Quem gostou recebe o link de avaliação no Google.'],
] as const

export default function Pagina() {
  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: '56px 20px 80px' }}>
      <p style={{ margin: 0, fontWeight: 700, color: 'var(--marinho)' }}>IA Laura</p>

      <h1 style={{ fontSize: 'clamp(2rem, 6vw, 3.25rem)', marginTop: 40, maxWidth: '18ch' }}>
        O cliente chama no WhatsApp. A Laura atende e marca a visita.
      </h1>
      <p style={{ fontSize: '1.125rem', color: 'var(--texto-2)', maxWidth: '52ch', marginTop: 16 }}>
        Para assistências técnicas de linha branca e refrigeração. Você continua no serviço; o atendimento não fica
        esperando.
      </p>

      <p style={{ marginTop: 28 }}>
        <a className="botao" href="#planos">
          Ver o plano
        </a>
      </p>

      <dl style={{ marginTop: 64, borderTop: '1px solid var(--linha)' }}>
        {entregas.map(([nome, texto]) => (
          <div
            key={nome}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(140px, 1fr) 2fr',
              gap: 16,
              padding: '18px 0',
              borderBottom: '1px solid var(--linha)',
            }}
          >
            <dt style={{ fontWeight: 600, color: 'var(--marinho)' }}>{nome}</dt>
            <dd style={{ margin: 0, color: 'var(--texto-2)' }}>{texto}</dd>
          </div>
        ))}
      </dl>

      <section id="planos" className="painel" style={{ marginTop: 64, padding: 28 }}>
        <h2 style={{ fontSize: '1.5rem' }}>Plano Solo</h2>
        <p className="numero" style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--marinho)', margin: '12px 0 0' }}>
          {reais(PRECOS.soloMensal)} <span style={{ fontSize: '1rem', fontWeight: 400 }}>por mês</span>
        </p>
        <p style={{ color: 'var(--texto-2)', margin: '8px 0 0' }}>
          Site da empresa, agendamento online e atendimento no WhatsApp. Tem equipe? Cada técnico a mais custa{' '}
          <span className="numero">{reais(PRECOS.tecnicoAdicional)}</span> por mês.
        </p>
      </section>
    </main>
  )
}
