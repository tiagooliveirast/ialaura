-- 0009: orçamento não fechado e recuperação pela Laura
-- Só acrescenta colunas e uma função nova. Nada é apagado.

alter table laura.atendimentos add column if not exists orcamento_centavos integer check (orcamento_centavos >= 0);
-- aprovado: fez o conserto | pensando: cliente vai pensar | recusado: não quis
-- recuperado: depois de não fechar, o cliente voltou e marcou o conserto
alter table laura.atendimentos add column if not exists orcamento_status text
  check (orcamento_status in ('aprovado', 'pensando', 'recusado', 'recuperado'));
alter table laura.atendimentos add column if not exists orcamento_motivo text check (char_length(orcamento_motivo) <= 300);
alter table laura.atendimentos add column if not exists recuperado_em timestamptz;

-- Quem fez a visita (ou o escritório) informa como ficou o orçamento.
-- Se o cliente não fechou, a Laura retoma a conversa em 3 dias, às 10h.
create function laura.registrar_orcamento(
  p_atendimento uuid,
  p_status text,
  p_valor_centavos integer default null,
  p_motivo text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_empresa uuid;
  v_fuso text;
begin
  if p_status not in ('aprovado', 'pensando', 'recusado') then
    raise exception 'Situação do orçamento inválida.';
  end if;
  if p_valor_centavos is not null and (p_valor_centavos < 0 or p_valor_centavos > 10000000) then
    raise exception 'Valor inválido.';
  end if;
  if p_status in ('pensando', 'recusado') and p_valor_centavos is null then
    raise exception 'Informe o valor do orçamento para a Laura poder retomar com o cliente.';
  end if;

  select a.empresa_id into v_empresa
    from laura.atendimentos a
   where a.id = p_atendimento
     and (
       laura.gere(a.empresa_id)
       or exists (select 1 from laura.membros m
                  where m.id = a.tecnico_id and m.user_id = (select auth.uid()) and m.ativo)
     );
  if v_empresa is null then
    raise exception 'Atendimento não encontrado ou de outro técnico.';
  end if;

  update laura.atendimentos a
     set orcamento_status = p_status,
         orcamento_centavos = p_valor_centavos,
         orcamento_motivo = nullif(left(trim(coalesce(p_motivo, '')), 300), ''),
         valor_centavos = case when p_status = 'aprovado' then coalesce(p_valor_centavos, a.valor_centavos) else a.valor_centavos end
   where a.id = p_atendimento;

  if p_status in ('pensando', 'recusado') then
    select e.fuso into v_fuso from laura.empresas e where e.id = v_empresa;
    insert into laura.lembretes (empresa_id, atendimento_id, destinatario, motivo, enviar_em)
    values (v_empresa, p_atendimento, 'cliente', 'retomar_orcamento',
            laura.dez_horas((now() at time zone v_fuso)::date + 3, v_fuso))
    on conflict do nothing;
  else
    update laura.lembretes l set status = 'cancelado'
     where l.atendimento_id = p_atendimento and l.motivo = 'retomar_orcamento' and l.status = 'pendente';
  end if;
end $$;

revoke execute on function laura.registrar_orcamento(uuid, text, integer, text) from public;
grant execute on function laura.registrar_orcamento(uuid, text, integer, text) to authenticated, service_role;

-- Foto de cada pessoa da equipe (vai para o cliente quando ele confirma a visita).
alter table laura.membros add column if not exists foto_url text check (char_length(foto_url) <= 500);

-- Pasta pública de fotos. Só o servidor (service role) envia; qualquer um com o link vê.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('laura-fotos', 'laura-fotos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
