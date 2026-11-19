import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { lerConhecimento } from '@/lib/laura/conhecimento'
import { exigirMembro } from '@/lib/sessao'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ligarWhatsapp, pausarWhatsapp, salvarConfiguracoes } from './acoes'

export const metadata: Metadata = { title: 'Configurações' }

type Empresa = {
  valor_visita_centavos: number | null
  vagas_por_periodo: number
  link_avaliacao_google: string | null
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

  const [{ data: empresa }, { data: servicos }, { data: areas }, { data: conta }] = await Promise.all([
    sb
      .from('empresas')
      .select('valor_visita_centavos, vagas_por_periodo, link_avaliacao_google, conhecimento')
      .eq('id', membro.empresa_id)
      .single<Empresa>(),
    sb.from('servicos').select('nome').eq('empresa_id', membro.empresa_id).order('nome'),
    sb.from('areas_atendimento').select('bairro, cidade').eq('empresa_id', membro.empresa_id),
    supabaseAdmin()
      .from('whatsapp_contas')
      .select('phone_number_id, waba_id, status')
      .eq('empresa_id', membro.empresa_id)
      .maybeSingle<{ phone_number_id: string; waba_id: string; status: string }>(),
  ])

  const c = lerConhecimento(empresa?.conhecimento)
  const valor =
    empresa?.valor_visita_centavos != null ? (empresa.valor_visita_centavos / 100).toFixed(2).replace('.', ',') : ''

  return (
    <div className="estreito sem-topo largura-media">
      <h1>Configurações</h1>
      <p className="apoio">Tudo o que a Laura sabe sobre a sua empresa vem daqui. O que ficar vazio, ela não responde e passa para você.</p>

      {erro && (
        <p className="aviso aviso-erro" role="alert">
          {erro}
        </p>
      )}
      {salvo === '1' && <p className="aviso aviso-certo" role="status">Configurações salvas. A Laura já usa as informações novas.</p>}
      {salvo === 'whatsapp' && <p className="aviso aviso-certo" role="status">WhatsApp ligado. A Laura já responde nesse número.</p>}

      <form className="formulario" action={salvarConfiguracoes}>
        <h2 className="secao">Atendimento</h2>
        <div className="dupla">
          <label className="campo">
            <span>Valor da visita técnica (R$)</span>
            <input name="valor_visita" inputMode="decimal" defaultValue={valor} />
          </label>
          <label className="campo">
            <span>Visitas por período, por técnico</span>
            <input name="vagas" type="number" min={1} max={20} required defaultValue={empresa?.vagas_por_periodo ?? 3} />
          </label>
        </div>
        <label className="campo">
          <span>Formas de pagamento</span>
          <input name="pagamento" maxLength={1000} defaultValue={c.pagamento ?? ''} />
          <small>Por exemplo: Pix, dinheiro e cartão em até 3x.</small>
        </label>
        <label className="campo">
          <span>Garantia</span>
          <input name="garantia" maxLength={1000} defaultValue={c.garantia ?? ''} />
          <small>Por exemplo: 90 dias no serviço e na peça trocada.</small>
        </label>
        <label className="campo">
          <span>Horário de atendimento</span>
          <input name="horario" maxLength={300} defaultValue={c.horario ?? ''} />
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

        <h2 className="secao">Serviços e área</h2>
        <label className="campo">
          <span>Serviços e aparelhos, um por linha</span>
          <textarea name="servicos" rows={6} defaultValue={(servicos ?? []).map((s) => s.nome).join('\n')} />
          <small>Por exemplo: Conserto de geladeira, Instalação de ar-condicionado split.</small>
        </label>
        <label className="campo">
          <span>Bairros e cidades atendidos, um por linha</span>
          <textarea
            name="areas"
            rows={6}
            defaultValue={(areas ?? []).map((a) => (a.bairro ? `${a.bairro}, ${a.cidade}` : a.cidade)).join('\n')}
          />
          <small>Escreva "Bairro, Cidade" ou só a cidade, se atende a cidade toda.</small>
        </label>

        <h2 className="secao">Outras informações</h2>
        <label className="campo">
          <span>O que mais a Laura precisa saber</span>
          <textarea name="observacoes" rows={5} maxLength={2000} defaultValue={c.observacoes ?? ''} />
          <small>Regras da casa, por exemplo: a visita é descontada se o cliente aprovar o conserto.</small>
        </label>
        <label className="campo">
          <span>Link para avaliar a empresa no Google</span>
          <input name="link_google" type="url" maxLength={300} defaultValue={empresa?.link_avaliacao_google ?? ''} />
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
