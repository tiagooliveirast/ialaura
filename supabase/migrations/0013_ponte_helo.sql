-- 0013: ponte Laura <-> Helô
-- Regra da ponte: cada sistema grava só nas próprias tabelas e lê o outro por funções seguras.
-- Aqui ficam as funções que a Helô chama (com a sessão do usuário logado) para ler a Laura,
-- e o controle dos avisos que a Laura manda a partir das manutenções programadas na Helô.
-- Só cria objetos novos. Nada é apagado.

-- A Helô pergunta: este usuário tem a Laura? Qual empresa? A assinatura está ativa?
create function laura.tem_laura() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object(
              'tem', true,
              'empresa_id', e.id,
              'empresa_nome', e.nome,
              'slug', e.slug,
              'papel', m.papel,
              'ativa', coalesce(s.isenta, false) or coalesce(s.status = 'ativa', false),
              'whatsapp_ligado', exists (select 1 from laura.whatsapp_contas w where w.empresa_id = e.id and w.status = 'ativa'))
       from laura.membros m
       join laura.empresas e on e.id = m.empresa_id
       left join laura.assinaturas s on s.empresa_id = e.id
      where m.user_id = (select auth.uid()) and m.ativo
      order by (m.papel = 'dono') desc
      limit 1),
    jsonb_build_object('tem', false))
$$;
revoke execute on function laura.tem_laura() from public;
grant execute on function laura.tem_laura() to authenticated, service_role;

-- Visitas da Laura para a agenda da Helô (só dono e atendente; técnico usa o app dele).
create function laura.visitas_para_helo(p_inicio date, p_fim date)
returns table (
  id uuid, data date, periodo text, status text, origem text,
  cliente_nome text, cliente_telefone text, endereco text, bairro text, cidade text,
  descricao text, servico text, tecnico_nome text,
  valor_centavos integer, orcamento_status text, orcamento_centavos integer,
  criado_em timestamptz, atualizado_em timestamptz
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.data, a.periodo::text, a.status::text, a.origem::text,
         c.nome, c.telefone, c.endereco, c.bairro, c.cidade,
         a.descricao, sv.nome, t.nome,
         a.valor_centavos, a.orcamento_status, a.orcamento_centavos,
         a.criado_em, a.atualizado_em
    from laura.atendimentos a
    join laura.clientes c on c.id = a.cliente_id
    left join laura.servicos sv on sv.id = a.servico_id
    left join laura.membros t on t.id = a.tecnico_id
   where laura.gere(a.empresa_id)
     and a.data between p_inicio and least(p_fim, p_inicio + 92)
   order by a.data, a.periodo
$$;
revoke execute on function laura.visitas_para_helo(date, date) from public;
grant execute on function laura.visitas_para_helo(date, date) to authenticated, service_role;

-- Avisos que a Laura já mandou a partir de manutenções programadas na Helô (não repete).
create table laura.helo_avisos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references laura.empresas on delete cascade,
  helo_manutencao_id uuid not null,
  proxima_data date not null,
  enviado_em timestamptz not null default now(),
  unique (helo_manutencao_id, proxima_data)
);
alter table laura.helo_avisos enable row level security;
create policy gestao_ver on laura.helo_avisos for select to authenticated using (laura.gere(empresa_id));
grant select on laura.helo_avisos to authenticated;
grant all on laura.helo_avisos to service_role;
