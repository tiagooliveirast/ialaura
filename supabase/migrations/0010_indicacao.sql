-- 0010: indique e ganhe
-- Só acrescenta colunas. Nada é apagado.
-- Quem indicou esta empresa (link /i/<slug> de outra empresa).
alter table laura.empresas add column if not exists indicado_por uuid references laura.empresas on delete set null;
-- O admin marca quando já deu o mês grátis a quem indicou.
alter table laura.empresas add column if not exists indicacao_recompensada_em timestamptz;
create index if not exists empresas_indicado_por on laura.empresas (indicado_por) where indicado_por is not null;
