-- Cria empresa + dono + assinatura numa transação só.
-- Roda como o usuário logado (auth.uid()); não precisa de service_role.
create function laura.criar_empresa(
  p_nome text, p_slug text, p_telefone text, p_cidade text, p_uf text, p_meu_nome text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Entre na sua conta para cadastrar a empresa.';
  end if;

  if exists (select 1 from laura.membros m where m.user_id = v_user and m.papel = 'dono') then
    raise exception 'Sua conta já tem uma empresa cadastrada.';
  end if;

  if exists (select 1 from laura.empresas e where e.slug = p_slug) then
    raise exception 'Já existe uma empresa com esse nome no sistema. Acrescente a cidade ao nome.';
  end if;

  insert into laura.empresas (nome, slug, telefone, cidade, uf)
  values (p_nome, p_slug, p_telefone, p_cidade, upper(p_uf))
  returning id into v_id;

  insert into laura.membros (empresa_id, user_id, papel, nome)
  values (v_id, v_user, 'dono', p_meu_nome);

  insert into laura.assinaturas (empresa_id) values (v_id);

  return v_id;
end $$;

revoke execute on function laura.criar_empresa(text, text, text, text, text, text) from public;
grant execute on function laura.criar_empresa(text, text, text, text, text, text) to authenticated, service_role;
