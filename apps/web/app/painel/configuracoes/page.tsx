import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { lerConhecimento } from '@/lib/laura/conhecimento'
import { situacaoModelos, type SituacaoModelo } from '@/lib/laura/modelos'
import { exigirMembro } from '@/lib/sessao'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ligarWhatsapp, pausarWhatsapp, recadastrarModelos, salvarConfiguracoes } from './acoes'

export const metadata: Metadata = { title: 'Configurações' }

type Empresa = {
  vagas_por_periodo: number
  link_avaliacao_google: string | null
  mostrar_valores_tv: boolean
  resumo_diario: boolean
  tecnico_ve_valores: boolean
  resumo_telefone: string | null
  conhecimento: unknown
}

export default async function Configuracoes({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; salvo?: string }>
}) {
  const { erro, salvo } = await searchParams
  const { sb, membro } = await exigirMembro()
  if (membro.papel !== 'dono') redirect('/painel')

  const [{ data: empresa }, { data: conta }] = await Promise.all([
    sb
      .from('empresas')
      .select('vagas_por_periodo, link_avaliacao_google, mostrar_valores_tv, resumo_diario, resumo_telefone, tecnico_ve_valores, conhecimento')
      .eq('id', membro.empresa_id)
      .single<Empresa>(),
    supabaseAdmin()
      .from('whatsapp_contas')
      .select('phone_number_id, waba_id, status')
      .eq('empresa_id', membro.empresa_id)
      .maybeSingle<{ phone_number_id: string; waba_id: string; status: string }>(),
  ])

  const c = lerConhecimento(empresa?.conhecimento)
  let modelos: SituacaoModelo[] | null = null
  let erroModelos: string | null = null
  if (conta) {
    try {
      modelos = await situacaoModelos(conta.waba_id)
    } catch (e) {
      erroModelos = e instanceof Error ? e.message : 'Não foi possível consultar a Meta.'
    }
  }
  const STATUS_MODELO: Record<string, string> = {
    APPROVED: 'Aprovado',
    PENDING: 'Em análise',
    REJECTED: 'Recusado',
    PAUSED: 'Pausado',
    DISABLED: 'Desativado',
  }

  return (
    <div className="estreito sem-topo largura-media">
      <h1>Configurações</h1>
      <p className="apoio">Agenda, WhatsApp e avaliações.</p>

      {erro && (
        <p className="aviso aviso-erro" role="alert">
          {erro}
        </p>
      )}
      {salvo === '1' && <p className="aviso aviso-certo" role="status">Configurações salvas.</p>}
      {salvo === 'whatsapp' && <p className="aviso aviso-certo" role="status">WhatsApp ligado. A Laura já responde nesse número.</p>}
      {salvo === 'modelos' && <p className="aviso aviso-certo" role="status">Modelos enviados para a Meta. A aprovação leva de minutos a algumas horas.</p>}

      <p className="aviso">
        O que a Laura responde (valor da visita, serviços, preços, bairros, perguntas frequentes) fica em{' '}
        <a href="/painel/laura">Treinar a Laura</a>.
      </p>

      <form className="formulario" action={salvarConfiguracoes}>
        <h2 className="secao">Agenda</h2>
        <label className="campo">
          <span>Visitas por período, por pessoa em campo</span>
          <input name="vagas" type="number" min={1} max={20} required defaultValue={empresa?.vagas_por_periodo ?? 3} />
          <small>Com 3 e duas pessoas em campo, a agenda abre 6 vagas de manhã e 6 à tarde.</small>
        </label>
        <fieldset className="opcoes">
          <legend>Dias que a empresa atende, além de segunda a sexta</legend>
          <label>
            <input type="checkbox" name="sabado" defaultChecked={c.sabado !== false} /> Sábado
          </label>
          <label>
            <input type="checkbox" name="domingo" defaultChecked={c.domingo === true} /> Domingo
          </label>
        </fieldset>

        <h2 className="secao">Avaliações e tela da empresa</h2>
        <label className="campo">
          <span>Link para avaliar a empresa no Google</span>
          <input name="link_google" type="url" maxLength={300} defaultValue={empresa?.link_avaliacao_google ?? ''} />
          <small>Vai para os clientes que dão nota 9 ou 10 na pesquisa.</small>
        </label>
        <label className="marcar">
          <input type="checkbox" name="mostrar_valores_tv" defaultChecked={empresa?.mostrar_valores_tv === true} /> Mostrar valores
          em reais no painel de indicadores
        </label>

        <h2 className="secao">O que o técnico vê</h2>
        <label className="marcar">
          <input type="checkbox" name="tecnico_ve_valores" defaultChecked={empresa?.tecnico_ve_valores === true} /> Mostrar para os
          técnicos quanto eles fizeram em serviços no mês
        </label>
        <p className="fraco">
          Desligado, o técnico vê só quantas visitas e consertos fez. Útil para quem trabalha com comissão; deixe desligado se
          preferir que a equipe não veja o faturamento.
        </p>

        <h2 className="secao">Pix para receber dos clientes</h2>
        <label className="campo">
          <span>Chave Pix</span>
          <input name="pix_chave" maxLength={120} defaultValue={c.pix_chave ?? ''} />
          <small>
            Quando o técnico finaliza a visita com o valor, a cobrança com esta chave pode ir direto para o WhatsApp do cliente. A
            Laura também passa a chave quando o cliente pergunta como pagar.
          </small>
        </label>
        <label className="campo">
          <span>Nome que aparece no Pix</span>
          <input name="pix_nome" maxLength={120} defaultValue={c.pix_nome ?? ''} />
          <small>Para o cliente conferir antes de pagar.</small>
        </label>

        <h2 className="secao">Resumo do dia no seu WhatsApp</h2>
        <label className="marcar">
          <input type="checkbox" name="resumo_diario" defaultChecked={empresa?.resumo_diario !== false} /> Receber às 19h o que a
          Laura fez no dia e como está a agenda de amanhã
        </label>
        <label className="campo">
          <span>WhatsApp que recebe o resumo</span>
          <input name="resumo_telefone" inputMode="tel" maxLength={20} defaultValue={empresa?.resumo_telefone ?? ''} />
          <small>Com DDD. Se ficar vazio, vai para o telefone do dono cadastrado em Equipe. Precisa ser diferente do número da empresa.</small>
        </label>

        <button className="botao">Salvar configurações</button>
      </form>

      <section className="painel bloco-config">
        <h2 className="secao">WhatsApp da empresa</h2>
        {conta ? (
          <>
            <p>
              Número ligado (ID <span className="numero">{conta.phone_number_id}</span>).{' '}
              {conta.status === 'ativa' ? 'A Laura está respondendo.' : 'A Laura está pausada e não responde ninguém.'}
            </p>
            <form action={pausarWhatsapp}>
              <input type="hidden" name="acao" value={conta.status === 'ativa' ? 'pausar' : 'ativar'} />
              <button className="botao botao-claro">
                {conta.status === 'ativa' ? 'Pausar a Laura' : 'Voltar a responder'}
              </button>
            </form>
          </>
        ) : (
          <p className="apoio">Nenhum número ligado. A Laura ainda não responde no WhatsApp.</p>
        )}
        {conta && (
          <div className="modelos">
            <h3>Mensagens automáticas na Meta</h3>
            <p className="fraco">Lembretes, pesquisa e aviso de técnico a caminho só saem depois que a Meta aprova estes modelos.</p>
            {erroModelos ? (
              <p className="aviso aviso-erro">{erroModelos}</p>
            ) : (
              <ul>
                {(modelos ?? []).map((m) => (
                  <li key={m.nome}>
                    <span className="numero">{m.nome}</span>
                    <span className={`etiqueta ${m.status === 'APPROVED' ? '' : 'etiqueta-atencao'}`}>
                      {STATUS_MODELO[m.status] ?? m.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {(erroModelos || modelos?.some((m) => m.status === 'não cadastrado')) && (
              <form action={recadastrarModelos}>
                <button className="botao botao-claro">Cadastrar modelos na Meta</button>
              </form>
            )}
          </div>
        )}
        <details className="detalhe">
          <summary>{conta ? 'Trocar o número' : 'Ligar um número'}</summary>
          <form className="formulario" action={ligarWhatsapp}>
            <label className="campo">
              <span>ID do número de telefone</span>
              <input name="phone_number_id" inputMode="numeric" required defaultValue={conta?.phone_number_id ?? ''} />
            </label>
            <label className="campo">
              <span>ID da conta do WhatsApp Business</span>
              <input name="waba_id" inputMode="numeric" required defaultValue={conta?.waba_id ?? ''} />
            </label>
            <small className="fraco">Os dois aparecem no Meta for Developers, em WhatsApp → Configuração da API.</small>
            <button className="botao">Ligar este número</button>
          </form>
        </details>
      </section>
    </div>
  )
}

export const dynamic = 'force-dynamic'
