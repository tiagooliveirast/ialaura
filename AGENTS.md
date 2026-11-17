# Regras para quem programa neste repositório (humano ou IA)

IA Laura: site institucional + agendamento online + IA de atendimento no WhatsApp
para assistências técnicas. Multiempresa. Leia `docs/ARQUITETURA.md` e `docs/DESIGN.md`
antes de escrever código.

## Banco
- Toda mudança de banco é uma migração nova em `supabase/migrations`, numerada em sequência. Nunca editar migração já aplicada.
- Nunca rodar DROP, DELETE sem WHERE, TRUNCATE ou ALTER destrutivo sem aprovação explícita do Tiago.
- Toda tabela nova: `empresa_id`, RLS ligada, policy e grant explícitos. Tabela sem policy = só o servidor acessa. Única exceção: `laura.webhook_eventos` — a coluna chega nula e o worker preenche ao identificar a empresa.
- Regra de privacidade é do banco, não da tela. O técnico não vê telefone de cliente: ele só lê por `laura.meus_atendimentos()`.
- Dinheiro em centavos (integer). Nunca float.

## Servidor
- `SUPABASE_SERVICE_ROLE_KEY`, tokens da Meta, OpenAI e Mercado Pago só em código de servidor. Nunca em variável `NEXT_PUBLIC_` ou `VITE_`.
- Webhook valida assinatura, grava em `laura.webhook_eventos` e responde 200. Processamento pesado nunca roda dentro do webhook.
- Todo processamento de evento é idempotente: rodar duas vezes dá o mesmo resultado.
- A IA só age por ferramentas definidas (consultar vagas, criar agendamento, passar para humano). Ela não responde dúvida técnica de conserto e não escreve SQL.
- Toda chamada de modelo grava uma linha em `laura.uso_ia`.
- Entrada externa sempre validada com os esquemas de `packages/shared`.

## Produto
- Parte dos usuários tem dificuldade com tecnologia: o fluxo mais curto vence.
- Erro sempre diz o motivo e o que fazer. Nada de "Algo deu errado".
- Campo vazio fica vazio. Não usar placeholder cinza que pareça preenchido; puxar do cadastro quando existir.
- Nomes de domínio em português (empresa, atendimento, técnico), igual ao banco.
- Valores em reais na tela de TV só se `mostrar_valores_tv` estiver ligado.

## Git
- Trabalho em branch, PR para `main`. `main` é produção.
- Um PR resolve uma coisa. Rodar `pnpm typecheck` antes de abrir.
