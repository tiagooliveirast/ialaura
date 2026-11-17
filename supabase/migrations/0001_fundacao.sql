-- IA Laura — fundação do banco
-- Tudo vive no schema "laura": funciona tanto em projeto Supabase próprio
-- quanto dentro do projeto da Helô (login compartilhado via auth.users).
-- Regra: toda tabela tem empresa_id e RLS ligada. Sem exceção.

create schema if not exists laura;
grant usage on schema laura to authenticated, service_role;
-- anon não usa este schema: o site público sempre passa pelo servidor (service_role).

-- ───────────────────────── Tipos
create type laura.papel as enum ('dono', 'atendente', 'tecnico');
create type laura.periodo as enum ('manha', 'tarde');
create type laura.status_atendimento as enum (
  'agendado', 'confirmado', 'a_caminho', 'atrasado',
  'em_andamento', 'finalizado', 'cancelado', 'nao_compareceu'
);
create type laura.plano as enum ('solo', 'equipe');
create type laura.status_assinatura as enum ('pendente', 'ativa', 'inadimplente', 'cancelada');

-- ───────────────────────── Empresa e pessoas
create table laura.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  telefone text,
  cidade text,
  uf char(2),
  fuso text not null default 'America/Bahia',
  valor_visita_centavos integer check (valor_visita_centavos >= 0),
  vagas_por_periodo integer not null default 3 check (vagas_por_periodo between 1 and 20),
  link_avaliacao_google text,
  mostrar_valores_tv boolean not null default false,
  -- conhecimento que a IA usa: pagamento, garantia, aparelhos, tom de voz
  conhecimento jsonb not null default '{}',
  -- ligação com a conta da Helô, quando existir
  helo_ref text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table laura.membros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references laura.empresas on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  papel laura.papel not null,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (empresa_id, user_id)
);
create index on laura.membros (user_id);

-- Super admin da plataforma (Tiago). Só service_role escreve aqui.
create table laura.admins_plataforma (
  user_id uuid primary key references auth.users on delete cascade
);

create table laura.clientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references laura.empresas on delete cascade,
  nome text not null,
  telefone text not null,
  endereco text,
  bairro text,
  cidade text,
  observacoes text,
  criado_em timestamptz not null default now(),
  unique (empresa_id, telefone)
);

create table laura.servicos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references laura.empresas on delete cascade,
  nome text not null,
  aparelho text,
  ativo boolean not null default true
);

create table laura.areas_atendimento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references laura.empresas on delete cascade,
  cidade text not null,
  bairro text
);

-- ───────────────────────── Atendimentos
create table laura.atendimentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references laura.empresas on delete cascade,
  cliente_id uuid not null references laura.clientes on delete restrict,
  tecnico_id uuid references laura.membros on delete set null,
  servico_id uuid references laura.servicos on delete set null,
  data date not null,
  periodo laura.periodo not null,
  status laura.status_atendimento not null default 'agendado',
  descricao text,
  origem text not null default 'painel' check (origem in ('site', 'whatsapp', 'painel', 'helo')),
  valor_centavos integer check (valor_centavos >= 0),
  google_event_id text,
  helo_ref text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on laura.atendimentos (empresa_id, data, periodo);
create index on laura.atendimentos (tecnico_id, data);

-- Linha do tempo: cada mudança de status fica registrada
create table laura.atendimento_eventos (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references laura.empresas on delete cascade,
  atendimento_id uuid not null references laura.atendimentos on delete cascade,
  status laura.status_atendimento not null,
  autor_id uuid,
  nota text,
  criado_em timestamptz not null default now()
);
create index on laura.atendimento_eventos (atendimento_id);

-- ───────────────────────── WhatsApp e IA
create table laura.whatsapp_contas (
  empresa_id uuid primary key references laura.empresas on delete cascade,
  phone_number_id text not null unique,
  waba_id text not null,
  token_secret_id uuid,           -- id do segredo no Supabase Vault; o token nunca fica em texto aqui
  status text not null default 'pendente' check (status in ('pendente', 'ativa', 'suspensa')),
  criado_em timestamptz not null default now()
);

create table laura.conversas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references laura.empresas on delete cascade,
  cliente_id uuid references laura.clientes on delete set null,
  wa_telefone text not null,
  -- 'ia' responde sozinha; 'humano' = alguém da empresa assumiu
  estado text not null default 'ia' check (estado in ('ia', 'humano', 'encerrada')),
  ultima_msg_em timestamptz not null default now(),
  unique (empresa_id, wa_telefone)
);

create table laura.mensagens (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references laura.empresas on delete cascade,
  conversa_id uuid not null references laura.conversas on delete cascade,
  direcao text not null check (direcao in ('entrada', 'saida')),
  autor text not null check (autor in ('cliente', 'ia', 'humano', 'sistema')),
  wa_message_id text unique,
  tipo text not null default 'texto',
  conteudo text,
  payload jsonb,
  criado_em timestamptz not null default now()
);
create index on laura.mensagens (conversa_id, criado_em);

-- Fila de entrada: o webhook só grava aqui e responde 200. Um worker processa depois.
-- unique (provedor, evento_id) garante que evento repetido não é processado duas vezes.
create table laura.webhook_eventos (
  id bigint generated always as identity primary key,
  provedor text not null check (provedor in ('whatsapp', 'mercadopago')),
  evento_id text not null,
  payload jsonb not null,
  -- exceção à regra do empresa_id: fica nulo na chegada e o worker preenche ao identificar a empresa
  empresa_id uuid null references laura.empresas on delete set null,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  tentativas integer not null default 0,
  erro text,
  unique (provedor, evento_id)
);
create index on laura.webhook_eventos (recebido_em) where processado_em is null;
create index on laura.webhook_eventos (empresa_id);

create table laura.uso_ia (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references laura.empresas on delete cascade,
  conversa_id uuid references laura.conversas on delete set null,
  modelo text not null,
  tokens_entrada integer not null default 0,
  tokens_saida integer not null default 0,
  custo_micro_usd bigint not null default 0,   -- milionésimos de dólar, sem ponto flutuante
  criado_em timestamptz not null default now()
);
create index on laura.uso_ia (empresa_id, criado_em);

-- ───────────────────────── Lembretes e satisfação
create table laura.lembretes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references laura.empresas on delete cascade,
  atendimento_id uuid references laura.atendimentos on delete cascade,
  destinatario text not null check (destinatario in ('cliente', 'tecnico')),
  motivo text not null,            -- ex.: 'manutencao_programada', 'vespera', 'pesquisa'
  enviar_em timestamptz not null,
  status text not null default 'pendente' check (status in ('pendente', 'enviado', 'falhou', 'cancelado')),
  tentativas integer not null default 0,
  erro text
);
create index on laura.lembretes (enviar_em) where status = 'pendente';

create table laura.pesquisas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references laura.empresas on delete cascade,
  atendimento_id uuid not null unique references laura.atendimentos on delete cascade,
  token uuid not null unique default gen_random_uuid(),  -- vai no link público da pesquisa
  nota_nps smallint check (nota_nps between 0 and 10),
  nota_tecnico smallint check (nota_tecnico between 1 and 5),
  respostas jsonb,
  comentario text,
  link_google_enviado boolean not null default false,
  respondido_em timestamptz
);

-- ───────────────────────── Assinatura e auditoria
create table laura.assinaturas (
  empresa_id uuid primary key references laura.empresas on delete cascade,
  plano laura.plano not null default 'solo',
  status laura.status_assinatura not null default 'pendente',
  tecnicos_adicionais integer not null default 0 check (tecnicos_adicionais >= 0),
  -- quantos técnicos a próxima fatura cobra; só baixa um ciclo depois da remoção
  tecnicos_cobrados integer not null default 0 check (tecnicos_cobrados >= 0),
  isenta boolean not null default false,       -- conta liberada sem cobrança
  mp_preapproval_id text unique,
  proxima_cobranca date,
  conferido_em timestamptz                     -- última reconciliação com o Mercado Pago
);

create table laura.auditoria (
  id bigint generated always as identity primary key,
  empresa_id uuid references laura.empresas on delete cascade,
  autor_id uuid,
  acao text not null,
  alvo text,
  dados jsonb,
  criado_em timestamptz not null default now()
);

-- ───────────────────────── Funções de permissão
-- security definer + search_path vazio: não dá para sequestrar via schema do usuário.
create function laura.eh_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from laura.admins_plataforma a where a.user_id = (select auth.uid()))
$$;

create function laura.papel_em(emp uuid) returns laura.papel
language sql stable security definer set search_path = '' as $$
  select m.papel from laura.membros m
  where m.empresa_id = emp and m.user_id = (select auth.uid()) and m.ativo
  limit 1
$$;

-- dono ou atendente da empresa (ou admin da plataforma)
create function laura.gere(emp uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(laura.papel_em(emp) in ('dono', 'atendente'), false) or laura.eh_admin()
$$;

create function laura.eh_dono(emp uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(laura.papel_em(emp) = 'dono', false) or laura.eh_admin()
$$;

-- ───────────────────────── RLS
alter table laura.empresas enable row level security;
alter table laura.membros enable row level security;
alter table laura.admins_plataforma enable row level security;
alter table laura.atendimentos enable row level security;
alter table laura.atendimento_eventos enable row level security;
alter table laura.whatsapp_contas enable row level security;
alter table laura.webhook_eventos enable row level security;
alter table laura.uso_ia enable row level security;
alter table laura.assinaturas enable row level security;
alter table laura.auditoria enable row level security;

-- Tabelas operacionais: dono e atendente fazem tudo dentro da própria empresa.
-- Técnico NÃO lê nenhuma delas direto: usa as funções mais abaixo.
do $$
declare t text;
begin
  foreach t in array array[
    'clientes', 'servicos', 'areas_atendimento',
    'conversas', 'mensagens', 'lembretes', 'pesquisas'
  ] loop
    execute format('alter table laura.%I enable row level security', t);
    execute format(
      'create policy gestao_tudo on laura.%I for all to authenticated
         using (laura.gere(empresa_id)) with check (laura.gere(empresa_id))', t);
    execute format('grant select, insert, update, delete on laura.%I to authenticated', t);
  end loop;
end $$;

-- atendimentos: não se apaga, se cancela. authenticated não tem DELETE nem policy de DELETE.
grant select, insert, update on laura.atendimentos to authenticated;
create policy atendimento_ver on laura.atendimentos for select to authenticated
  using (laura.gere(empresa_id));
create policy atendimento_criar on laura.atendimentos for insert to authenticated
  with check (laura.gere(empresa_id));
create policy atendimento_editar on laura.atendimentos for update to authenticated
  using (laura.gere(empresa_id)) with check (laura.gere(empresa_id));

-- atendimento_eventos: trilha de status, só leitura para authenticated.
-- Nem insert: quem escreve é o gatilho e a função laura.atualizar_status(), ambas security definer.
grant select on laura.atendimento_eventos to authenticated;
create policy atendimento_eventos_ver on laura.atendimento_eventos for select to authenticated
  using (laura.gere(empresa_id));

grant select, update on laura.empresas to authenticated;
create policy empresa_ver on laura.empresas for select to authenticated
  using (laura.papel_em(id) is not null or laura.eh_admin());
create policy empresa_editar on laura.empresas for update to authenticated
  using (laura.eh_dono(id)) with check (laura.eh_dono(id));

grant select, insert, update, delete on laura.membros to authenticated;
create policy membro_ver on laura.membros for select to authenticated
  using (user_id = (select auth.uid()) or laura.gere(empresa_id));
create policy membro_gerir on laura.membros for all to authenticated
  using (laura.eh_dono(empresa_id)) with check (laura.eh_dono(empresa_id));

-- Só leitura para o dono; quem escreve é o servidor (service_role).
grant select on laura.assinaturas, laura.uso_ia, laura.auditoria to authenticated;
create policy assinatura_ver on laura.assinaturas for select to authenticated using (laura.eh_dono(empresa_id));
create policy uso_ver on laura.uso_ia for select to authenticated using (laura.eh_dono(empresa_id));
create policy auditoria_ver on laura.auditoria for select to authenticated using (laura.eh_dono(empresa_id));

-- whatsapp_contas, webhook_eventos e admins_plataforma: sem policy e sem grant.
-- Só o servidor enxerga.
grant all on all tables in schema laura to service_role;
grant usage, select on all sequences in schema laura to service_role;
alter default privileges in schema laura grant all on tables to service_role;
alter default privileges in schema laura grant usage, select on sequences to service_role;

-- ───────────────────────── Acesso do técnico
-- Agenda dos próximos 7 dias, com nome e endereço do cliente e SEM telefone.
create function laura.meus_atendimentos()
returns table (
  id uuid, data date, periodo laura.periodo, status laura.status_atendimento,
  descricao text, cliente_nome text, endereco text, bairro text, cidade text, servico text
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.data, a.periodo, a.status, a.descricao,
         c.nome, c.endereco, c.bairro, c.cidade, s.nome
  from laura.atendimentos a
  join laura.membros m on m.id = a.tecnico_id and m.user_id = (select auth.uid()) and m.ativo
  join laura.clientes c on c.id = a.cliente_id
  left join laura.servicos s on s.id = a.servico_id
  where a.data between current_date and current_date + 7
    and a.status <> 'cancelado'
  order by a.data, a.periodo
$$;

-- Técnico informa o andamento: indo, atraso, iniciou, finalizou.
create function laura.atualizar_status(p_atendimento uuid, p_status laura.status_atendimento, p_nota text default null)
returns void
language plpgsql security definer set search_path = '' as $$
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

  if p_nota is not null then
    update laura.atendimento_eventos e set nota = p_nota
     where e.id = (select max(id) from laura.atendimento_eventos where atendimento_id = p_atendimento);
  end if;
end $$;

-- Vagas livres = vagas por período × técnicos ativos − atendimentos já marcados.
-- Só o servidor chama: aceita qualquer empresa_id, não é para o navegador.
create function laura.vagas_livres(p_empresa uuid, p_data date, p_periodo laura.periodo)
returns integer
language sql stable security definer set search_path = '' as $$
  select greatest(0,
    (select e.vagas_por_periodo from laura.empresas e where e.id = p_empresa)
    * greatest(1, (select count(*)::int from laura.membros m
                   where m.empresa_id = p_empresa and m.papel = 'tecnico' and m.ativo))
    - (select count(*)::int from laura.atendimentos a
       where a.empresa_id = p_empresa and a.data = p_data and a.periodo = p_periodo
         and a.status not in ('cancelado', 'nao_compareceu'))
  )
$$;

-- ───────────────────────── Gatilhos
create function laura.tocar_atualizado_em() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

create trigger empresas_atualizado before update on laura.empresas
  for each row execute function laura.tocar_atualizado_em();
create trigger atendimentos_atualizado before update on laura.atendimentos
  for each row execute function laura.tocar_atualizado_em();

create function laura.registrar_evento() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into laura.atendimento_eventos (empresa_id, atendimento_id, status, autor_id)
    values (new.empresa_id, new.id, new.status, (select auth.uid()));
  end if;
  return new;
end $$;

create trigger atendimentos_evento after insert or update on laura.atendimentos
  for each row execute function laura.registrar_evento();

-- ───────────────────────── EXECUTE das funções
-- Por último, depois de todas as funções e gatilhos criados.
revoke execute on all functions in schema laura from public;
grant execute on function laura.eh_admin(), laura.papel_em(uuid), laura.gere(uuid), laura.eh_dono(uuid),
  laura.meus_atendimentos(), laura.atualizar_status(uuid, laura.status_atendimento, text)
  to authenticated;
grant execute on all functions in schema laura to service_role;
