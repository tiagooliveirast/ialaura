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

## Ainda não existe (ordem sugerida)
1. Login e criação de empresa (onboarding)
2. Painel de atendimentos por status
3. Worker da fila + IA com ferramentas
4. Site público por empresa com agendamento
5. App do técnico (PWA)
6. Lembretes e pesquisa de satisfação
7. Checkout e reconciliação Mercado Pago
8. Tela de TV com indicadores
9. Google Agenda (OAuth por empresa)
10. Ponte com a Helô e Painel do Dono
