'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { salvarEntrevista, type Respostas } from './acoes'

type Etapa =
  | { chave: 'servicos'; tipo: 'multi'; pergunta: string; opcoes: string[]; outro: string }
  | { chave: 'pagamento'; tipo: 'multi'; pergunta: string; opcoes: string[]; outro: string }
  | { chave: 'areas'; tipo: 'lista'; pergunta: string; ajuda: string }
  | { chave: 'valor_visita'; tipo: 'valor'; pergunta: string }
  | { chave: 'horario' | 'garantia' | 'marcas'; tipo: 'texto'; pergunta: string; atalhos: string[]; ajuda?: string }
  | { chave: 'dias'; tipo: 'dias'; pergunta: string }
  | { chave: 'tom'; tipo: 'tom'; pergunta: string }

const ETAPAS: Etapa[] = [
  {
    chave: 'servicos',
    tipo: 'multi',
    pergunta: 'Que aparelhos e serviços vocês atendem? Pode marcar vários.',
    opcoes: [
      'Conserto de geladeira',
      'Conserto de freezer',
      'Conserto de máquina de lavar',
      'Conserto de lava e seca',
      'Instalação de ar-condicionado',
      'Manutenção e limpeza de ar-condicionado',
      'Conserto de ar-condicionado',
      'Conserto de micro-ondas',
      'Conserto de fogão e cooktop',
      'Higienização de máquina de lavar',
      'Conserto de bebedouro',
      'Câmara fria e refrigeração comercial',
    ],
    outro: 'Outro serviço',
  },
  {
    chave: 'areas',
    tipo: 'lista',
    pergunta: 'Em quais bairros ou cidades vocês atendem? Um por linha.',
    ajuda: 'Escreva "bairro, cidade" ou só a cidade, se atende ela toda. Exemplo: "Itapuã, Salvador" ou "Lauro de Freitas".',
  },
  { chave: 'valor_visita', tipo: 'valor', pergunta: 'Quanto custa a visita técnica?' },
  {
    chave: 'horario',
    tipo: 'texto',
    pergunta: 'Qual é o horário de atendimento?',
    atalhos: ['Segunda a sexta, das 8h às 18h', 'Segunda a sexta, das 8h às 17h', 'Segunda a sábado, das 8h às 18h'],
  },
  { chave: 'dias', tipo: 'dias', pergunta: 'Vocês atendem no fim de semana?' },
  {
    chave: 'pagamento',
    tipo: 'multi',
    pergunta: 'Quais formas de pagamento vocês aceitam?',
    opcoes: ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Parcelado no cartão'],
    outro: 'Outra forma',
  },
  {
    chave: 'garantia',
    tipo: 'texto',
    pergunta: 'Qual é a garantia do serviço?',
    atalhos: ['90 dias de garantia na peça e na mão de obra', '30 dias de garantia na mão de obra', '3 meses de garantia'],
  },
  {
    chave: 'marcas',
    tipo: 'texto',
    pergunta: 'Quais marcas vocês atendem?',
    atalhos: ['Todas as marcas', 'Electrolux, Brastemp, Consul, LG e Samsung'],
    ajuda: 'Se tiver marca que vocês não atendem, dá para dizer depois em Treinar a Laura.',
  },
  { chave: 'tom', tipo: 'tom', pergunta: 'Por último: como a Laura deve conversar com os seus clientes?' },
]

const TONS: Array<{ valor: Respostas['tom']; rotulo: string; exemplo: string }> = [
  { valor: 'proximo', rotulo: 'Próxima e educada', exemplo: '"Oi, Maria! Consigo sim. Prefere amanhã de manhã ou à tarde?"' },
  { valor: 'formal', rotulo: 'Formal', exemplo: '"Boa tarde, senhora Maria. Temos horário amanhã pela manhã ou à tarde."' },
  { valor: 'descontraido', rotulo: 'Descontraída', exemplo: '"Opa, Maria! Bora resolver isso. Amanhã de manhã ou à tarde?"' },
]

const VAZIO: Respostas = {
  servicos: [],
  areas: [],
  valor_visita: '',
  visita_descontada: true,
  horario: '',
  sabado: true,
  domingo: false,
  pagamento: [],
  garantia: '',
  marcas: '',
  tom: 'proximo',
}

function resumoDa(e: Etapa, r: Respostas): string {
  switch (e.chave) {
    case 'servicos':
      return r.servicos.join(', ') || 'Pulei'
    case 'pagamento':
      return r.pagamento.join(', ') || 'Pulei'
    case 'areas':
      return r.areas.join('; ') || 'Pulei'
    case 'valor_visita':
      return r.valor_visita ? `R$ ${r.valor_visita}${r.visita_descontada ? ', descontada se fechar o conserto' : ''}` : 'Pulei'
    case 'dias':
      return [r.sabado ? 'Sábado sim' : 'Sábado não', r.domingo ? 'domingo sim' : 'domingo não'].join(', ')
    case 'tom':
      return TONS.find((t) => t.valor === r.tom)?.rotulo ?? ''
    default:
      return r[e.chave] || 'Pulei'
  }
}

export function Entrevista({ nome, empresa }: { nome: string; empresa: string }) {
  const [passo, setPasso] = useState(0)
  const [r, setR] = useState<Respostas>(VAZIO)
  const [outro, setOutro] = useState('')
  const [areasTexto, setAreasTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, iniciar] = useTransition()
  const router = useRouter()

  const etapa = ETAPAS[passo]
  const fim = passo >= ETAPAS.length

  function avancar() {
    setOutro('')
    setPasso((p) => p + 1)
  }

  function alternar(chave: 'servicos' | 'pagamento', v: string) {
    setR((a) => ({ ...a, [chave]: a[chave].includes(v) ? a[chave].filter((x) => x !== v) : [...a[chave], v] }))
  }

  function concluir() {
    setErro(null)
    iniciar(async () => {
      const res = await salvarEntrevista(r)
      if (res.ok) router.push('/painel/laura?salvo=1')
      else setErro(res.erro ?? 'Não foi possível salvar. Tente de novo.')
    })
  }

  return (
    <div className="entrevista">
      <p>
        <Link href="/painel/laura" className="voltar">
          Prefiro preencher tudo de uma vez
        </Link>
      </p>
      <div className="entrevista-progresso" aria-label={`Pergunta ${Math.min(passo + 1, ETAPAS.length)} de ${ETAPAS.length}`}>
        <div style={{ width: `${(Math.min(passo, ETAPAS.length) / ETAPAS.length) * 100}%` }} />
      </div>

      <ol className="mensagens entrevista-conversa">
        <li className="balao balao-ia">
          <span className="balao-autor">{nome}</span>
          Oi! Eu sou a {nome} e vou atender os clientes da {empresa}. Me responde {ETAPAS.length} perguntas rápidas que eu já
          começo a trabalhar. Dá para mudar tudo depois.
        </li>
        {ETAPAS.slice(0, passo).map((e) => (
          <li key={e.chave} className="entrevista-par">
            <div className="balao balao-ia">{e.pergunta}</div>
            <div className="balao balao-humano">{resumoDa(e, r)}</div>
          </li>
        ))}
        {!fim && etapa && (
          <li className="balao balao-ia">
            <span className="balao-autor">{nome}</span>
            {etapa.pergunta}
          </li>
        )}
        {fim && (
          <li className="balao balao-ia">
            <span className="balao-autor">{nome}</span>
            Pronto, já sei o básico para atender. Depois de salvar, teste comigo no simulador ao lado do treinamento. Quanto mais
            você me contar lá (preços, perguntas frequentes), melhor eu fico.
          </li>
        )}
      </ol>

      <div className="entrevista-resposta painel">
        {!fim && etapa?.tipo === 'multi' && (
          <>
            <div className="chips">
              {[...etapa.opcoes, ...r[etapa.chave].filter((v) => !etapa.opcoes.includes(v))].map((o) => (
                <button
                  key={o}
                  type="button"
                  className={`chip${r[etapa.chave].includes(o) ? ' chip-on' : ''}`}
                  aria-pressed={r[etapa.chave].includes(o)}
                  onClick={() => alternar(etapa.chave, o)}
                >
                  {o}
                </button>
              ))}
            </div>
            <form
              className="entrevista-outro"
              onSubmit={(ev) => {
                ev.preventDefault()
                if (outro.trim()) alternar(etapa.chave, outro.trim())
                setOutro('')
              }}
            >
              <input value={outro} onChange={(ev) => setOutro(ev.target.value)} aria-label={etapa.outro} maxLength={80} />
              <button className="botao botao-claro" disabled={!outro.trim()}>
                Adicionar
              </button>
            </form>
          </>
        )}

        {!fim && etapa?.tipo === 'lista' && (
          <label className="campo">
            <textarea
              rows={5}
              value={areasTexto}
              onChange={(ev) => {
                setAreasTexto(ev.target.value)
                setR((a) => ({ ...a, areas: ev.target.value.split('\n').map((l) => l.trim()).filter(Boolean) }))
              }}
              aria-label="Bairros ou cidades"
            />
            <small>{etapa.ajuda}</small>
          </label>
        )}

        {!fim && etapa?.tipo === 'valor' && (
          <div className="entrevista-valor">
            <label className="campo">
              <span>Valor em reais</span>
              <input
                inputMode="decimal"
                value={r.valor_visita}
                onChange={(ev) => setR((a) => ({ ...a, valor_visita: ev.target.value }))}
                maxLength={10}
              />
            </label>
            <label className="marcar">
              <input
                type="checkbox"
                checked={r.visita_descontada}
                onChange={(ev) => setR((a) => ({ ...a, visita_descontada: ev.target.checked }))}
              />{' '}
              O valor da visita é descontado se o cliente fechar o conserto
            </label>
          </div>
        )}

        {!fim && etapa?.tipo === 'texto' && (
          <>
            <div className="chips">
              {etapa.atalhos.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`chip${r[etapa.chave] === a ? ' chip-on' : ''}`}
                  onClick={() => setR((x) => ({ ...x, [etapa.chave]: a }))}
                >
                  {a}
                </button>
              ))}
            </div>
            <label className="campo">
              <span>Ou escreva do seu jeito</span>
              <input
                value={r[etapa.chave]}
                onChange={(ev) => setR((x) => ({ ...x, [etapa.chave]: ev.target.value }))}
                maxLength={300}
              />
              {etapa.ajuda && <small>{etapa.ajuda}</small>}
            </label>
          </>
        )}

        {!fim && etapa?.tipo === 'dias' && (
          <div className="opcoes">
            <label className="marcar">
              <input type="checkbox" checked={r.sabado} onChange={(ev) => setR((a) => ({ ...a, sabado: ev.target.checked }))} />{' '}
              Atendemos no sábado
            </label>
            <label className="marcar">
              <input type="checkbox" checked={r.domingo} onChange={(ev) => setR((a) => ({ ...a, domingo: ev.target.checked }))} />{' '}
              Atendemos no domingo
            </label>
          </div>
        )}

        {!fim && etapa?.tipo === 'tom' && (
          <div className="tons">
            {TONS.map((t) => (
              <button
                key={t.valor}
                type="button"
                className={`tom${r.tom === t.valor ? ' tom-on' : ''}`}
                aria-pressed={r.tom === t.valor}
                onClick={() => setR((a) => ({ ...a, tom: t.valor }))}
              >
                <strong>{t.rotulo}</strong>
                <span>{t.exemplo}</span>
              </button>
            ))}
          </div>
        )}

        {erro && (
          <p className="aviso aviso-erro" role="alert">
            {erro}
          </p>
        )}

        <div className="entrevista-acoes">
          {passo > 0 && (
            <button type="button" className="link-botao" onClick={() => setPasso((p) => p - 1)} disabled={salvando}>
              Voltar
            </button>
          )}
          {fim ? (
            <button type="button" className="botao" onClick={concluir} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar e testar a Laura'}
            </button>
          ) : (
            <button type="button" className="botao" onClick={avancar}>
              Continuar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
