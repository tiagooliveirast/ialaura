-- 0012: o dono decide se o técnico vê quanto faturou no mês
-- Só acrescenta uma coluna e troca o corpo de laura.meu_mes (mesma assinatura). Nada é apagado.
alter table laura.empresas add column if not exists tecnico_ve_valores boolean not null default false;

-- A regra fica no banco: se o dono não liberou, o valor nem sai do servidor para o técnico.
-- O dono sempre vê o próprio valor.
create or replace function laura.meu_mes()
returns table (finalizadas bigint, valor_centavos bigint, consertos bigint)
language sql stable security definer set search_path = '' as $$
  select count(*) filter (where a.status = 'finalizado'),
         case when bool_or(e.tecnico_ve_valores or m.papel = 'dono')
              then coalesce(sum(a.valor_centavos) filter (where a.status = 'finalizado'), 0)::bigint
         end,
         count(*) filter (where a.orcamento_status = 'aprovado')
    from laura.atendimentos a
    join laura.membros m on m.id = a.tecnico_id and m.user_id = (select auth.uid()) and m.ativo
    join laura.empresas e on e.id = a.empresa_id
   where a.data >= date_trunc('month', (now() at time zone e.fuso))::date
$$;
