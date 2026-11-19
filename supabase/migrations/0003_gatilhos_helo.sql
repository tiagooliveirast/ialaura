-- Só para o banco compartilhado com a Helô (projeto hyxxkkpirdeijfjvfrpk).
-- Quem se cadastra pela IA Laura entra com raw_user_meta_data.produto = 'laura'.
-- Essas pessoas NÃO viram usuário nem ganham teste da Helô.
-- Quando alguém da Laura assinar a Helô, a ativação cria as linhas da Helô na hora.
--
-- Versões anteriores (para voltar, se precisar), lidas do banco em 19/11/2026:
--   handle_new_user: INSERT INTO public.users (id, full_name, email, role, whatsapp) VALUES (NEW.id,
--     COALESCE(meta.full_name, meta.name, 'Usuário'), COALESCE(NEW.email, meta.email, 'sem-email@refriclube.com'),
--     'TECH', meta.whatsapp) ON CONFLICT (id) DO UPDATE SET full_name, email, whatsapp = COALESCE(novo, atual)
--   handle_new_subscription: INSERT INTO public.user_subscriptions (user_id, email, access_status, access_source,
--     trial_start, trial_end, trial_used) VALUES (NEW.id, NEW.email, 'trialing', 'trial', NOW(), NOW() + 7 days, true)
--     ON CONFLICT (user_id) DO NOTHING

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(new.raw_user_meta_data->>'produto', '') = 'laura' then
    return new;
  end if;

  insert into public.users (id, full_name, email, role, whatsapp)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Usuário'),
    coalesce(new.email, new.raw_user_meta_data->>'email', 'sem-email@refriclube.com'),
    'TECH'::public.user_role,
    new.raw_user_meta_data->>'whatsapp'
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    whatsapp = coalesce(excluded.whatsapp, public.users.whatsapp);
  return new;
end;
$function$;

create or replace function public.handle_new_subscription()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions', 'pg_temp'
as $function$
begin
  if coalesce(new.raw_user_meta_data->>'produto', '') = 'laura' then
    return new;
  end if;

  insert into public.user_subscriptions (user_id, email, access_status, access_source, trial_start, trial_end, trial_used)
  values (new.id, new.email, 'trialing', 'trial', now(), now() + interval '7 days', true)
  on conflict (user_id) do nothing;
  return new;
end;
$function$;
