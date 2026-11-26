import { reais } from '@ialaura/shared'
import { frasesProvaSocial, horasEconomizadas, MINUTOS_POR_RESPOSTA, pct, tempoResposta, type Metricas } from '@/lib/metricas'

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string | number; nota?: string }) {
  return (
    <div className="indicador">
      <dt>{rotulo}</dt>
      <dd className="numero">{valor}</dd>
      {nota && <p className="fraco">{nota}</p>}
    </div>
  )
}

/** Blocos de números usados no admin geral e na página de cada empresa. */
export function BlocosMetricas({ m, dias, sujeito }: { m: Metricas; dias: number | null; sujeito?: string }) {
  const frases = frasesProvaSocial(m, dias, sujeito)
  const conversao = pct(m.conversas_viraram_visita, m.conversas)

  return (
    <>
      <section className="secao-admin">
        <h2>Prova social</h2>
        <dl className="indicadores">
          <Numero rotulo="Visitas marcadas pela Laura" valor={m.visitas_laura} />
          <Numero
            rotulo="Sem ninguém da equipe"
            valor={m.visitas_sem_humano}
            nota={m.visitas_laura ? `${pct(m.visitas_sem_humano, m.visitas_laura)}% das visitas da Laura` : undefined}
          />
          <Numero rotulo="Fora do horário" valor={m.visitas_fora_horario} nota="Antes das 8h, depois das 18h ou no fim de semana" />
          <Numero rotulo="Clientes que voltaram" valor={m.visitas_retorno} nota="Já tinham atendimento e marcaram de novo" />
          <Numero rotulo="Marcadas pelo site" valor={m.visitas_site} />
          <Numero rotulo="Valor das visitas da Laura" valor={reais(m.valor_visitas_laura_centavos)} nota="Pelo valor de visita de cada empresa" />
          <Numero rotulo="Serviços finalizados com valor" valor={reais(m.valor_servicos_laura_centavos)} nota="Só quando a empresa lançou o valor" />
          <Numero
            rotulo="Horas de atendimento poupadas"
            valor={horasEconomizadas(m)}
            nota={`Estimativa: ${MINUTOS_POR_RESPOSTA} min por resposta`}
          />
        </dl>

        {frases.length > 0 ? (
          <div className="frases">
            <h3>Frases prontas para divulgar</h3>
            <ul>
              {frases.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="fraco">Cada frase só aparece quando há número suficiente para sustentar. Confira antes de publicar.</p>
          </div>
        ) : (
          <p className="vazio">Ainda não há números suficientes neste período para montar frases.</p>
        )}
      </section>

      <section className="secao-admin">
        <h2>Atendimento</h2>
        <dl className="indicadores">
          <Numero rotulo="Conversas" valor={m.conversas} />
          <Numero rotulo="Viraram visita" valor={conversao != null ? `${conversao}%` : 'sem dados'} />
          <Numero rotulo="Precisaram de alguém" valor={m.conversas_com_humano} nota="Equipe assumiu ou respondeu" />
          <Numero rotulo="Mensagens de clientes" valor={m.mensagens_cliente} />
          <Numero rotulo="Respostas da Laura" valor={m.mensagens_laura} nota={`${m.mensagens_laura_fora_horario} fora do horário`} />
          <Numero rotulo="Tempo de resposta" valor={tempoResposta(m.resposta_mediana_s)} nota="Mediana" />
        </dl>
      </section>

      <section className="secao-admin">
        <h2>Qualidade e comparecimento</h2>
        <dl className="indicadores">
          <Numero rotulo="NPS" valor={m.nps ?? 'sem dados'} nota={`${m.pesquisas_respondidas} pesquisas respondidas`} />
          <Numero rotulo="Nota média dos técnicos" valor={m.nota_tecnico_media ?? 'sem dados'} nota="De 1 a 5" />
          <Numero rotulo="Pedidos de avaliação no Google" valor={m.avaliacoes_google_enviadas} />
          <Numero rotulo="Lembretes enviados" valor={m.lembretes_enviados} />
          <Numero
            rotulo="Cliente em casa, com lembrete"
            valor={m.comparecimento_com_lembrete != null ? `${m.comparecimento_com_lembrete}%` : 'sem dados'}
          />
          <Numero
            rotulo="Cliente em casa, sem lembrete"
            valor={m.comparecimento_sem_lembrete != null ? `${m.comparecimento_sem_lembrete}%` : 'sem dados'}
          />
        </dl>
      </section>
    </>
  )
}
