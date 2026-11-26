import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { PRECOS, reais } from '@ialaura/shared'
import { exigirMembro } from '@/lib/sessao'
import { COOKIE_ACESSO } from '@/lib/equipe'
import { adicionarPessoa, alterarPessoa, atualizarPerfil } from './acoes'

export const metadata: Metadata = { title: 'Equipe' }
export const dynamic = 'force-dynamic'

type Pessoa = {
  id: string
  nome: string
  papel: 'dono' | 'atendente' | 'tecnico'
  atende: boolean
  ativo: boolean
  telefone: string | null
  foto_url: string | null
}

const PAPEL = { dono: 'Dono', atendente: 'Atendente', tecnico: 'Técnico' } as const

export default async function Equipe({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  const { sb, membro } = await exigirMembro()
  if (membro.papel !== 'dono') redirect('/painel')

  const { data } = await sb
    .from('membros')
    .select('id, nome, papel, atende, ativo, telefone, foto_url')
    .eq('empresa_id', membro.empresa_id)
    .order('criado_em')
  const pessoas = (data ?? []) as Pessoa[]

  let novo: { nome: string; email: string; senha: string | null } | null = null
  try {
    const bruto = (await cookies()).get(COOKIE_ACESSO)?.value
    if (bruto) novo = JSON.parse(bruto)
  } catch {
    novo = null
  }

  const emCampo = pessoas.filter((p) => p.ativo && p.atende).length

  return (
    <div className="estreito sem-topo largura-media">
      <h1>Equipe</h1>
      <p className="apoio">
        <span className="numero">{emCampo}</span> {emCampo === 1 ? 'pessoa vai' : 'pessoas vão'} a campo. As vagas da agenda
        se multiplicam por esse número.
      </p>

      {erro && (
        <p className="aviso aviso-erro" role="alert">
          {erro}
        </p>
      )}
      {novo && (
        <div className="aviso aviso-certo" role="status">
          <p>
            <strong>{novo.nome}</strong> já pode entrar em <span className="numero">ialaura.vercel.app/entrar</span> com o
            e-mail <span className="numero">{novo.email}</span>
            {novo.senha ? (
              <>
                {' '}
                e a senha <strong className="numero">{novo.senha}</strong>. Mande para ela agora: esta senha não aparece de novo.
              </>
            ) : (
              <> e a senha que já usa (essa pessoa já tinha conta, por exemplo na Helô).</>
            )}
          </p>
        </div>
      )}

      <div className="painel rolagem" style={{ marginTop: 20 }}>
        <table className="tabela">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Função</th>
              <th>Vai a campo</th>
              <th>Foto e WhatsApp</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pessoas.map((p) => (
              <tr key={p.id} className={p.ativo ? undefined : 'inativo'}>
                <td className="pessoa-nome">
                  {p.foto_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.foto_url} alt="" className="avatar" width={36} height={36} />
                  ) : (
                    <span className="avatar avatar-vazio" aria-hidden="true">
                      {p.nome.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  {p.nome}
                  {p.id === membro.id && <span className="fraco"> (você)</span>}
                  {!p.ativo && <span className="fraco"> · desativado</span>}
                </td>
                <td>{PAPEL[p.papel]}</td>
                <td>
                  <form action={alterarPessoa}>
                    <input type="hidden" name="id" value={p.id} />
                    <button name="acao" value={p.atende ? 'nao_atende' : 'atende'} className="link-botao">
                      {p.atende ? 'Sim' : 'Não'}
                    </button>
                  </form>
                </td>
                <td>
                  <details className="perfil-editar">
                    <summary className="link-botao">
                      {p.foto_url ? 'Trocar foto' : 'Pôr foto'}
                      {p.telefone ? '' : ' e WhatsApp'}
                    </summary>
                    <form action={atualizarPerfil} className="formulario">
                      <input type="hidden" name="id" value={p.id} />
                      <label className="campo">
                        <span>Foto (rosto, de frente, de uniforme se tiver)</span>
                        <input type="file" name="foto" accept="image/jpeg,image/png,image/webp" />
                      </label>
                      <label className="campo">
                        <span>WhatsApp</span>
                        <input name="telefone" type="tel" inputMode="tel" defaultValue={p.telefone ?? ''} />
                      </label>
                      <button className="botao">Salvar</button>
                    </form>
                  </details>
                </td>
                <td>
                  {p.id !== membro.id && (
                    <form action={alterarPessoa}>
                      <input type="hidden" name="id" value={p.id} />
                      <button name="acao" value={p.ativo ? 'desativar' : 'reativar'} className="link-botao">
                        {p.ativo ? 'Desativar' : 'Reativar'}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fraco" style={{ marginTop: 8 }}>
        Clique em "Sim" ou "Não" para mudar quem vai a campo. Se você também faz visitas, marque "Sim" na sua linha. A foto de
        quem vai a campo é enviada ao cliente quando ele confirma a visita: ver o rosto de quem vai entrar em casa passa confiança.
      </p>

      <h2 className="secao">Adicionar pessoa</h2>
      <form className="formulario" action={adicionarPessoa}>
        <label className="campo">
          <span>Nome</span>
          <input name="nome" required maxLength={80} autoComplete="off" />
        </label>
        <label className="campo">
          <span>E-mail</span>
          <input name="email" type="email" required autoComplete="off" />
        </label>
        <label className="campo">
          <span>WhatsApp, com DDD</span>
          <input name="telefone" type="tel" inputMode="tel" autoComplete="off" />
          <small>Usado para avisar o técnico das manutenções programadas.</small>
        </label>
        <label className="campo">
          <span>Função</span>
          <select name="papel" defaultValue="tecnico">
            <option value="tecnico">Técnico: vê só a agenda dele, sem telefone do cliente</option>
            <option value="atendente">Atendente: cuida de agenda e conversas</option>
          </select>
        </label>
        <p className="fraco">
          Cada técnico a mais custa <span className="numero">{reais(PRECOS.tecnicoAdicional)}</span> por mês.
        </p>
        <button className="botao">Criar acesso</button>
      </form>
    </div>
  )
}
