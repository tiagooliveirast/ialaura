-- 0007: lições da Laura (aperfeiçoamento contínuo)
-- Cada lição é "nesta situação, responda assim". Vêm de três lugares:
--   correcao  → o dono corrigiu uma resposta real da Laura em Conversas
--   simulador → o dono corrigiu uma resposta no simulador
--   manual    → o dono escreveu direto em Treinar a Laura
--   sugestao  → a rotina diária leu conversas que a equipe assumiu e sugeriu;
--               nasce desligada (ativa = false) e só vale depois que o dono aprova.
-- Só cria objetos novos. Nada é apagado ou alterado.

create table laura.licoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references laura.empresas on delete cascade,
  situacao text not null check (char_length(situacao) between 3 and 600),
  resposta_ideal text not null check (char_length(resposta_ideal) between 2 and 2000),
  resposta_laura text check (char_length(resposta_laura) <= 2000),
  conversa_id uuid references laura.conversas on delete set null,
  origem text not null default 'manual' check (origem in ('correcao', 'simulador', 'manual', 'sugestao')),
  ativa boolean not null default true,
  usos integer not null default 0,
  criado_por uuid,
  criado_em timestamptz not null default now()
);
create index on laura.licoes (empresa_id, ativa, criado_em desc);

alter table laura.licoes enable row level security;
create policy gestao_tudo on laura.licoes for all to authenticated
  using (laura.gere(empresa_id)) with check (laura.gere(empresa_id));
grant select, insert, update, delete on laura.licoes to authenticated;
grant all on laura.licoes to service_role;

-- Marca até onde a rotina de sugestões já leu cada conversa, para não sugerir duas vezes.
alter table laura.conversas add column if not exists licoes_lidas_ate timestamptz;
