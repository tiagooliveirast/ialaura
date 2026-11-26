-- Lembretes automáticos, pesquisa de satisfação e localização do técnico nos toques de status.
-- Rotina diária (10h do fuso da empresa) envia o que estiver vencido.

-- Telefone de quem vai a campo, para o lembrete de manutenção programada.
alter table laura.membros add column if not exists telefone text;

-- Localização gravada quando o técnico toca "Estou indo", "Cheguei", "Finalizei".
alter table laura.atendimento_eventos
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists precisao_m real;

-- Lembretes: um motivo por atendimento (evita duplicar quando a visita muda e volta).
alter table laura.lembretes add column if not exists enviado_em timestamptz;
create unique index if not exists lembretes_unico_pendente
  on laura.lembretes (atendimento_id, motivo, destinatario) where status = 'pendente';

-- 10h do dia D no fuso da empresa, em timestamptz.
create or replace function laura.dez_horas(p_dia date, p_fuso text)
returns timestamptz
language sql stable set search_path = '' as $$
  select (p_dia::timestamp + time '10:00') at time zone p_fuso
$$;

-- Toda vez que a visita é criada ou muda de dia/período/status, os lembretes são refeitos.
create or replace function laura.programar_lembretes()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_fuso text;
begin
  select e.fuso into v_fuso from laura.empresas e where e.id = new.empresa_id;

  if tg_op = 'UPDATE'
     and new.data = old.data and new.periodo = old.periodo and new.status = old.status then
    return new;
  end if;

  -- Cancela o que estava pendente para esta visita (exceto a pesquisa, que tem regra própria).
  update laura.lembretes l set status = 'cancelado'
   where l.atendimento_id = new.id and l.status = 'pendente' and l.motivo <> 'pesquisa';

  if new.status in ('agendado', 'confirmado') then
    -- Cliente: véspera da visita, 10h.
    if laura.dez_horas(new.data - 1, v_fuso) > now() then
      insert into laura.lembretes (empresa_id, atendimento_id, destinatario, motivo, enviar_em)
      values (new.empresa_id, new.id, 'cliente', 'vespera', laura.dez_horas(new.data - 1, v_fuso))
      on conflict do nothing;
    end if;
    -- Manutenção programada (visita a mais de 7 dias): avisa o técnico uma semana antes.
    if new.data > (now() at time zone v_fuso)::date + 7 then
      insert into laura.lembretes (empresa_id, atendimento_id, destinatario, motivo, enviar_em)
      values (new.empresa_id, new.id, 'tecnico', 'manutencao_programada', laura.dez_horas(new.data - 7, v_fuso))
      on conflict do nothing;
    end if;
  end if;

  -- Finalizou: cria a pesquisa e manda no dia seguinte, 10h.
  if new.status = 'finalizado' and (tg_op = 'INSERT' or old.status <> 'finalizado') then
    insert into laura.pesquisas (empresa_id, atendimento_id)
    values (new.empresa_id, new.id)
    on conflict (atendimento_id) do nothing;
    insert into laura.lembretes (empresa_id, atendimento_id, destinatario, motivo, enviar_em)
    values (new.empresa_id, new.id, 'cliente', 'pesquisa',
            laura.dez_horas((now() at time zone v_fuso)::date + 1, v_fuso))
    on conflict do nothing;
  end if;

  return new;
end $$;

create trigger atendimentos_lembretes after insert or update on laura.atendimentos
  for each row execute function laura.programar_lembretes();

-- Técnico informa o andamento, agora com a posição do celular (opcional).
-- Versão nova ao lado da antiga (sem DROP); o app sempre envia os 6 parâmetros, então chama esta.
-- A versão de 3 parâmetros perde a permissão de execução e fica sem uso.
create function laura.atualizar_status(
  p_atendimento uuid,
  p_status laura.status_atendimento,
  p_nota text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_precisao real default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_evento bigint;
begin
  if p_status not in ('a_caminho', 'atrasado', 'em_andamento', 'finalizado') then
    raise exception 'Esse status só pode ser alterado pelo escritório.';
  end if;

  update laura.atendimentos a
     set status = p_status
   where a.id = p_atendimento
     and a.status not in ('finalizado', 'cancelado')
     and exists (
       select 1 from laura.membros m
       where m.id = a.tecnico_id and m.user_id = (select auth.uid()) and m.ativo
     );

  if not found then
    raise exception 'Atendimento não encontrado, já encerrado ou de outro técnico.';
  end if;

  select max(e.id) into v_evento from laura.atendimento_eventos e where e.atendimento_id = p_atendimento;
  update laura.atendimento_eventos e
     set nota = coalesce(p_nota, e.nota),
         lat = case when p_lat between -90 and 90 then p_lat end,
         lng = case when p_lng between -180 and 180 then p_lng end,
         precisao_m = p_precisao
   where e.id = v_evento;
end $$;

-- Pesquisa respondida pelo cliente (link público com token). Só responde uma vez.
create or replace function laura.responder_pesquisa(
  p_token uuid, p_nps smallint, p_nota_tecnico smallint, p_respostas jsonb, p_comentario text
) returns table (link_google text)
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_empresa uuid;
begin
  if p_nps not between 0 and 10 or p_nota_tecnico not between 1 and 5 then
    raise exception 'Notas fora da escala.';
  end if;

  update laura.pesquisas p
     set nota_nps = p_nps, nota_tecnico = p_nota_tecnico, respostas = p_respostas,
         comentario = nullif(left(trim(p_comentario), 1000), ''), respondido_em = now(),
         link_google_enviado = (p_nps >= 9)
   where p.token = p_token and p.respondido_em is null
  returning p.id, p.empresa_id into v_id, v_empresa;

  if v_id is null then
    raise exception 'Pesquisa não encontrada ou já respondida.';
  end if;

  return query
    select case when p_nps >= 9 then e.link_avaliacao_google end
      from laura.empresas e where e.id = v_empresa;
end $$;

revoke execute on function laura.atualizar_status(uuid, laura.status_atendimento, text) from public, authenticated;
revoke execute on function laura.dez_horas(date, text) from public;
revoke execute on function laura.programar_lembretes() from public;
revoke execute on function laura.atualizar_status(uuid, laura.status_atendimento, text, double precision, double precision, real) from public;
revoke execute on function laura.responder_pesquisa(uuid, smallint, smallint, jsonb, text) from public;
grant execute on function laura.atualizar_status(uuid, laura.status_atendimento, text, double precision, double precision, real) to authenticated, service_role;
grant execute on function laura.responder_pesquisa(uuid, smallint, smallint, jsonb, text) to service_role;
grant execute on function laura.dez_horas(date, text) to service_role;
