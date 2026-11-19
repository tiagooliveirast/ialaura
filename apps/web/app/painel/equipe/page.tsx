import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { PRECOS, reais } from '@ialaura/shared'
import { exigirMembro } from '@/lib/sessao'
import { COOKIE_ACESSO } from '@/lib/equipe'
import { adicionarPessoa, alterarPessoa } from './acoes'

export const metadata: Metadata = { title: 'Equipe' }
export const dynamic = 'force-dynamic'

type Pessoa = { id: string; nome: string; papel: 'dono' | 'atendente' | 'tecnico'; atende: boolean; ativo: boolean }

const PAPEL = { dono: 'Dono', atendente: 'Atendente', tecnico: 'Técnico' } as const

export default async function Equipe({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  const { sb, membro } = await exigirMembro()
  if (membro.papel !== 'dono') redirect('/painel')

  const { data } = await sb
    .from('membros')
    .select('id, nome, papel, atende, ativo')
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pessoas.map((p) => (
              <tr key={p.id} className={p.ativo ? undefined : 'inativo'}>
                <td>
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
        Clique em "Sim" ou "Não" para mudar quem vai a campo. Se você também faz visitas, marque "Sim" na sua linha.
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
