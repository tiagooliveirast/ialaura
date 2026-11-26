-- 0008: resumo diário no WhatsApp do dono
-- Só acrescenta colunas. Nada é apagado.
alter table laura.empresas add column if not exists resumo_diario boolean not null default true;
-- WhatsApp que recebe o resumo; vazio = telefone do dono cadastrado em Equipe.
alter table laura.empresas add column if not exists resumo_telefone text;
-- Data (no fuso da empresa) do último resumo enviado. Evita mandar duas vezes no mesmo dia.
alter table laura.empresas add column if not exists resumo_enviado_em date;
