-- Métricas do admin da plataforma e de prova social da Laura.
-- Só o servidor (service_role) chama; a página /admin confere se quem pediu é admin.
-- p_empresa nulo = plataforma inteira.

create or replace function laura.metricas(p_inicio timestamptz, p_empresa uuid default null)
returns jsonb
language sql stable security definer set search_path = '' as $$
with
at as (
  select a.*, e.fuso, e.valor_visita_centavos
    from laura.atendimentos a join laura.empresas e on e.id = a.empresa_id
   where a.criado_em >= p_inicio and (p_empresa is null or a.empresa_id = p_empresa)
),
pela_laura as (select * from at where origem = 'whatsapp'),
sem_humano as (
  select l.* from pela_laura l
   where not exists (
     select 1 from laura.conversas c join laura.mensagens m on m.conversa_id = c.id
      where c.empresa_id = l.empresa_id and c.cliente_id = l.cliente_id
        and m.autor = 'humano' and m.criado_em <= l.criado_em
   )
),
fora_horario as (
  select * from pela_laura
   where extract(hour from criado_em at time zone fuso) < 8
      or extract(hour from criado_em at time zone fuso) >= 18
      or extract(isodow from criado_em at time zone fuso) >= 6
),
retorno as (
  select * from pela_laura l
   where exists (select 1 from laura.atendimentos b where b.cliente_id = l.cliente_id and b.criado_em < l.criado_em)
),
conv as (
  select c.* from laura.conversas c
   where (p_empresa is null or c.empresa_id = p_empresa)
     and exists (select 1 from laura.mensagens m where m.conversa_id = c.id and m.criado_em >= p_inicio)
),
msgs as (
  select m.* from laura.mensagens m
   where m.criado_em >= p_inicio and (p_empresa is null or m.empresa_id = p_empresa)
),
resposta as (
  select extract(epoch from (r.criado_em - (
           select max(c.criado_em) from laura.mensagens c
            where c.conversa_id = r.conversa_id and c.autor = 'cliente' and c.criado_em <= r.criado_em
         ))) as segundos
    from msgs r where r.autor = 'ia'
),
encerrados as (
  select a.id, a.status,
         exists (select 1 from laura.lembretes l where l.atendimento_id = a.id and l.motivo = 'vespera' and l.status = 'enviado') as lembrado
    from at a where a.status in ('finalizado', 'nao_compareceu')
),
pesq as (
  select p.* from laura.pesquisas p
   where p.respondido_em >= p_inicio and (p_empresa is null or p.empresa_id = p_empresa)
),
custo as (
  select coalesce(sum(u.custo_micro_usd), 0) as micro from laura.uso_ia u
   where u.criado_em >= p_inicio and (p_empresa is null or u.empresa_id = p_empresa)
)
select jsonb_build_object(
  'visitas_total', (select count(*) from at),
  'visitas_laura', (select count(*) from pela_laura),
  'visitas_sem_humano', (select count(*) from sem_humano),
  'visitas_fora_horario', (select count(*) from fora_horario),
  'visitas_retorno', (select count(*) from retorno),
  'visitas_site', (select count(*) from at where origem = 'site'),
  'valor_visitas_laura_centavos', (select coalesce(sum(valor_visita_centavos), 0) from pela_laura),
  'valor_servicos_laura_centavos', (select coalesce(sum(valor_centavos), 0) from pela_laura where status = 'finalizado'),
  'conversas', (select count(*) from conv),
  'conversas_viraram_visita', (select count(*) from conv c where exists (
      select 1 from pela_laura l where l.empresa_id = c.empresa_id and l.cliente_id = c.cliente_id)),
  'conversas_com_humano', (select count(*) from conv c where c.estado = 'humano' or exists (
      select 1 from laura.mensagens m where m.conversa_id = c.id and m.autor = 'humano' and m.criado_em >= p_inicio)),
  'mensagens_cliente', (select count(*) from msgs where autor = 'cliente'),
  'mensagens_laura', (select count(*) from msgs where autor = 'ia'),
  'mensagens_laura_fora_horario', (select count(*) from msgs m join laura.empresas e on e.id = m.empresa_id
      where m.autor = 'ia' and (extract(hour from m.criado_em at time zone e.fuso) < 8
        or extract(hour from m.criado_em at time zone e.fuso) >= 18
        or extract(isodow from m.criado_em at time zone e.fuso) >= 6)),
  'resposta_mediana_s', (select percentile_cont(0.5) within group (order by segundos) from resposta where segundos >= 0),
  'lembretes_enviados', (select count(*) from laura.lembretes l where l.status = 'enviado' and l.enviado_em >= p_inicio
      and (p_empresa is null or l.empresa_id = p_empresa)),
  'lembretes_falhos', (select count(*) from laura.lembretes l where l.status = 'falhou' and (p_empresa is null or l.empresa_id = p_empresa)),
  'comparecimento_com_lembrete', (select round(100.0 * count(*) filter (where status = 'finalizado') / nullif(count(*), 0), 1) from encerrados where lembrado),
  'comparecimento_sem_lembrete', (select round(100.0 * count(*) filter (where status = 'finalizado') / nullif(count(*), 0), 1) from encerrados where not lembrado),
  'pesquisas_respondidas', (select count(*) from pesq),
  'nps', (select round(100.0 * (count(*) filter (where nota_nps >= 9) - count(*) filter (where nota_nps <= 6)) / nullif(count(*), 0))
      from pesq),
  'nota_tecnico_media', (select round(avg(nota_tecnico), 2) from pesq),
  'avaliacoes_google_enviadas', (select count(*) from pesq where link_google_enviado),
  'custo_ia_micro_usd', (select micro from custo),
  'fila_com_erro', (select count(*) from laura.webhook_eventos w where w.processado_em is null and w.erro is not null
      and (p_empresa is null or w.empresa_id = p_empresa))
)
$$;

-- Uma linha por empresa, para a tabela do admin.
create or replace function laura.metricas_por_empresa(p_inicio timestamptz)
returns table (
  empresa_id uuid, conversas bigint, mensagens_laura bigint, visitas_laura bigint,
  visitas_fora_horario bigint, visitas_site bigint, pessoas bigint, ultima_atividade timestamptz,
  custo_micro_usd bigint, nps numeric
)
language sql stable security definer set search_path = '' as $$
  select e.id,
    (select count(distinct m.conversa_id) from laura.mensagens m where m.empresa_id = e.id and m.criado_em >= p_inicio),
    (select count(*) from laura.mensagens m where m.empresa_id = e.id and m.autor = 'ia' and m.criado_em >= p_inicio),
    (select count(*) from laura.atendimentos a where a.empresa_id = e.id and a.origem = 'whatsapp' and a.criado_em >= p_inicio),
    (select count(*) from laura.atendimentos a where a.empresa_id = e.id and a.origem = 'whatsapp' and a.criado_em >= p_inicio
       and (extract(hour from a.criado_em at time zone e.fuso) < 8 or extract(hour from a.criado_em at time zone e.fuso) >= 18
            or extract(isodow from a.criado_em at time zone e.fuso) >= 6)),
    (select count(*) from laura.atendimentos a where a.empresa_id = e.id and a.origem = 'site' and a.criado_em >= p_inicio),
    (select count(*) from laura.membros mb where mb.empresa_id = e.id and mb.ativo),
    greatest(
      (select max(m.criado_em) from laura.mensagens m where m.empresa_id = e.id),
      (select max(a.atualizado_em) from laura.atendimentos a where a.empresa_id = e.id)
    ),
    (select coalesce(sum(u.custo_micro_usd), 0)::bigint from laura.uso_ia u where u.empresa_id = e.id and u.criado_em >= p_inicio),
    (select round(100.0 * (count(*) filter (where p.nota_nps >= 9) - count(*) filter (where p.nota_nps <= 6)) / nullif(count(*), 0))
       from laura.pesquisas p where p.empresa_id = e.id and p.respondido_em >= p_inicio)
  from laura.empresas e
$$;

revoke execute on function laura.metricas(timestamptz, uuid) from public;
revoke execute on function laura.metricas_por_empresa(timestamptz) from public;
grant execute on function laura.metricas(timestamptz, uuid) to service_role;
grant execute on function laura.metricas_por_empresa(timestamptz) to service_role;
