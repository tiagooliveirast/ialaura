-- 0011: retorno de manutenção, fotos da visita e números do técnico
-- Só cria objetos novos e acrescenta colunas. Nada é apagado.

-- De quantos em quantos meses o cliente deve repetir este serviço (ex.: limpeza de ar-condicionado = 6).
alter table laura.servicos add column if not exists retorno_meses smallint check (retorno_meses between 1 and 36);
-- Última vez que a Laura chamou o cliente para a manutenção de retorno (não repete antes do próximo ciclo).
alter table laura.clientes add column if not exists retorno_avisado_em timestamptz;

-- Fotos de antes e depois tiradas pelo técnico na visita.
create table laura.atendimento_fotos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references laura.empresas on delete cascade,
  atendimento_id uuid not null references laura.atendimentos on delete cascade,
  url text not null check (char_length(url) <= 500),
  momento text not null check (momento in ('antes', 'depois')),
  criado_por uuid,
  criado_em timestamptz not null default now()
);
create index on laura.atendimento_fotos (atendimento_id);
alter table laura.atendimento_fotos enable row level security;
create policy gestao_ver on laura.atendimento_fotos for select to authenticated using (laura.gere(empresa_id));
grant select on laura.atendimento_fotos to authenticated;
grant all on laura.atendimento_fotos to service_role;

-- Confere se quem chamou pode mexer nesta visita (técnico dela ou gestão). Devolve a empresa.
create function laura.pode_mexer_visita(p_atendimento uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select a.empresa_id from laura.atendimentos a
   where a.id = p_atendimento
     and (laura.gere(a.empresa_id)
          or exists (select 1 from laura.membros m
                     where m.id = a.tecnico_id and m.user_id = (select auth.uid()) and m.ativo))
$$;
revoke execute on function laura.pode_mexer_visita(uuid) from public;
grant execute on function laura.pode_mexer_visita(uuid) to authenticated, service_role;

-- O mês de quem vai a campo: visitas finalizadas e valor dos serviços feitos.
create function laura.meu_mes()
returns table (finalizadas bigint, valor_centavos bigint, consertos bigint)
language sql stable security definer set search_path = '' as $$
  select count(*) filter (where a.status = 'finalizado'),
         coalesce(sum(a.valor_centavos) filter (where a.status = 'finalizado'), 0)::bigint,
         count(*) filter (where a.orcamento_status = 'aprovado')
    from laura.atendimentos a
    join laura.membros m on m.id = a.tecnico_id and m.user_id = (select auth.uid()) and m.ativo
    join laura.empresas e on e.id = a.empresa_id
   where a.data >= date_trunc('month', (now() at time zone e.fuso))::date
$$;
revoke execute on function laura.meu_mes() from public;
grant execute on function laura.meu_mes() to authenticated;
