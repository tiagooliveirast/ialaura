-- IA Laura: fila de processamento, quem vai a campo e regras de vagas.

-- Quem vai a campo (técnico, ou dono que também atende). Conta nas vagas e pode receber atendimento.
alter table laura.membros add column if not exists atende boolean not null default false;
update laura.membros set atende = true where papel = 'tecnico' and not atende;

-- Vagas = vagas por período × pessoas que vão a campo − visitas já marcadas.
-- Empresa sem ninguém marcado como "atende" conta como 1 (o dono solo).
create or replace function laura.vagas_livres(p_empresa uuid, p_data date, p_periodo laura.periodo)
returns integer
language sql stable security definer set search_path = '' as $$
  select greatest(0,
    (select e.vagas_por_periodo from laura.empresas e where e.id = p_empresa)
    * greatest(1, (select count(*)::int from laura.membros m
                   where m.empresa_id = p_empresa and m.atende and m.ativo))
    - (select count(*)::int from laura.atendimentos a
       where a.empresa_id = p_empresa and a.data = p_data and a.periodo = p_periodo
         and a.status not in ('cancelado', 'nao_compareceu'))
  )
$$;

-- Fila: cada evento é reservado por 2 minutos para um processador só.
alter table laura.webhook_eventos add column if not exists bloqueado_ate timestamptz;

create or replace function laura.reivindicar_eventos(p_limite integer default 10)
returns setof laura.webhook_eventos
language sql security definer set search_path = '' as $$
  update laura.webhook_eventos w
     set tentativas = w.tentativas + 1,
         bloqueado_ate = now() + interval '2 minutes'
   where w.id in (
     select e.id from laura.webhook_eventos e
      where e.processado_em is null
        and e.tentativas < 5
        and (e.bloqueado_ate is null or e.bloqueado_ate < now())
      order by e.id
      limit p_limite
      for update skip locked
   )
  returning w.*
$$;

create index if not exists conversas_recentes on laura.conversas (empresa_id, ultima_msg_em desc);

revoke execute on function laura.vagas_livres(uuid, date, laura.periodo) from public;
revoke execute on function laura.reivindicar_eventos(integer) from public;
grant execute on function laura.vagas_livres(uuid, date, laura.periodo) to service_role;
grant execute on function laura.reivindicar_eventos(integer) to service_role;
