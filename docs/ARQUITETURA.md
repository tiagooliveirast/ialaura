# Arquitetura

## Princípio
A regra de negócio mora no servidor (Postgres + API). Web, app do técnico, tela de TV e
Painel do Dono são clientes finos sobre o mesmo banco. Nenhuma tela decide permissão.

## Repositório
```
apps/web        Next.js — site de vendas, sites das empresas, painel, admin, TV, API e webhooks
apps/tecnico    (a criar) React + Vite, PWA; depois Capacitor para Android e iOS
packages/shared Tipos e validações Zod usados por todos os apps
supabase/       Migrações versionadas
docs/           Este documento, design e roteiro
```

## Banco
- Schema `laura`. Para a API do Supabase enxergar: Settings → API → Exposed schemas → adicionar `laura`.
- Pode viver no mesmo projeto Supabase da Helô (mesmo login, lembretes de PMOC lendo direto) ou em projeto próprio. A migração serve aos dois casos.
- Papéis: `dono`, `atendente`, `tecnico`, e admin da plataforma em `admins_plataforma`.
- Dono e atendente acessam as tabelas da própria empresa por RLS.
- Técnico não lê tabela nenhuma: usa `meus_atendimentos()` (7 dias, sem telefone) e `atualizar_status()`.
- `whatsapp_contas` e `webhook_eventos` só o servidor acessa.

## Fluxo do WhatsApp
1. Meta chama `POST /api/webhooks/whatsapp`.
2. A rota confere a assinatura `X-Hub-Signature-256`, grava cada mensagem em `webhook_eventos` e responde 200.
3. Um worker (cron) pega eventos pendentes, acha a empresa pelo `phone_number_id`, monta o contexto e chama o modelo com ferramentas.
4. A resposta sai pela Cloud API com o token da empresa (guardado no Vault) e o custo vai para `uso_ia`.
5. Se a conversa estiver em `humano`, a IA fica calada.

## Agendamento
- Capacidade: `vagas_livres(empresa, data, periodo)`.
- Site público e IA criam atendimento pelo servidor (service_role), nunca direto do navegador.
- Mudança de status gera linha em `atendimento_eventos` por gatilho.

## Cobrança
- Mercado Pago (assinatura). Webhook entra na mesma fila `webhook_eventos`.
- Reconciliação diária consulta o status real e grava `conferido_em`. O webhook nunca é a única fonte.
- `tecnicos_cobrados` só diminui um ciclo depois da remoção do técnico.

## Ambientes
- `main` → produção na Vercel. PR → preview. Um projeto Supabase de staging separado do de produção.
- Segredos só nas variáveis da Vercel. Ver `.env.example`.

## Já existe
- Login e cadastro de empresa (`/entrar`, `/comecar`)
- Painel de atendimentos por status (`/painel`)
- Página pública de agendamento por empresa (`/a/[slug]`), com vagas conferidas no servidor
- Agenda do técnico (`/tecnico`), ainda dentro do app web

- Configurações da empresa (`/painel/configuracoes`): o que a Laura sabe, dias de atendimento, número do WhatsApp
- Equipe (`/painel/equipe`): acesso de técnico/atendente com senha provisória, quem vai a campo
- Laura no WhatsApp: webhook grava na fila e processa logo depois (`after`); `/api/cron/processar` reprocessa falhas
- Conversas (`/painel/conversas`): assumir, devolver para a Laura, responder pelo WhatsApp da empresa

- Lembretes: véspera (cliente, 10h), manutenção programada (técnico, 7 dias antes) e pesquisa (dia seguinte à finalização), criados por gatilho no banco e enviados pela rotina diária `/api/cron/diario` (vercel.json, 13h UTC) com modelos de mensagem aprovados (`lib/laura/modelos.ts`)
- Pesquisa de satisfação pública (`/p/[token]`): NPS, nota do técnico, pontualidade, problema resolvido; nota 9 ou 10 recebe o link do Google
- Localização do técnico gravada em `atendimento_eventos` quando ele toca os botões de status; "Estou indo" avisa o cliente
- Site da empresa (`/a/[slug]`): serviços, área, condições, WhatsApp e agendamento
- Assinatura Mercado Pago (`/painel/assinatura`, webhook, reconciliação diária); bloqueio só com `COBRANCA_ATIVA=1`
- Admin da plataforma (`/admin`): empresas, assinatura, custo de IA, liberar sem cobrança

- Treinar a Laura (`/painel/laura`) com entrevista de 9 perguntas (`/painel/laura/comecar`), simulador e lições (`laura.licoes`: correção, simulador, manual e sugestões diárias aprovadas pelo dono)
- Situações humanas (luto, doença, irritação, risco) e ferramentas confirmar/remarcar/desmarcar visita
- Confirmação na véspera com botões, cobrança às 17h (`/api/cron/tarde`), resumo do dia às 19h (`/api/cron/noite`)
- Áudio transcrito e foto descrita (`lib/laura/audio.ts`)
- Orçamento: técnico informa ao finalizar (`laura.registrar_orcamento`), Laura retoma em 3 dias, orçamento por escrito com botão de aprovar, recuperados no painel e no admin
- Manutenção de retorno por serviço (`servicos.retorno_meses`) e avisos a partir das manutenções da Helô (`PONTE_HELO_AVISOS=1`)
- App do técnico: previsão de chegada, rota do dia, Maps/Waze, fotos antes/depois, meu mês (valor só se o dono liberar), Pix ao finalizar
- Painel do Dono (`/dono`, modo TV): Laura + Helô, só para quem tem as duas
- Admin: saúde dos clientes, indicações, card para Instagram (`/admin/card`)
- Privacidade (`/privacidade`) e Termos (`/termos`)

## Ponte com a Helô
Regra: cada sistema grava só nas próprias tabelas e lê o outro por funções seguras.
- A Laura lê da Helô (service role, só leitura): `user_subscriptions`, `financial_transactions`, `quotes`, `work_orders`, `customers`, `scheduled_maintenance`, `planos_manutencao`, `pricing_profile`, `configuracao_financeira`, `os_avaliacoes`, `agenda_compromissos` (`lib/dono.ts`).
- A Helô lê da Laura com a sessão do usuário: `laura.tem_laura()` e `laura.visitas_para_helo(inicio, fim)` (migração 0013).
- A ligação entre as duas é o usuário (mesmo e-mail / mesmo `auth.users.id`).

## Banco compartilhado com a Helô
O schema `laura` vive no projeto Supabase da Helô (refriclube). Cadastro pela Laura leva `produto: 'laura'` nos metadados e os gatilhos da Helô não criam usuário nem teste para essa pessoa (migração 0003). O app lê `LAURA_SUPABASE_*` com prioridade sobre as variáveis do banco de teste.

## Ainda não existe (ordem sugerida)
1. Token de WhatsApp por empresa no Vault (hoje um token só, `WHATSAPP_ACCESS_TOKEN`)
2. Cadastro do número pela própria empresa (Embedded Signup da Meta)
3. App do técnico separado (PWA em apps/tecnico)
4. Google Agenda (OAuth por empresa)
