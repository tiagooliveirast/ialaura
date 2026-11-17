# IA Laura

Site institucional, agendamento online e IA de atendimento no WhatsApp para assistências técnicas.

- Arquitetura: [docs/ARQUITETURA.md](docs/ARQUITETURA.md)
- Design: [docs/DESIGN.md](docs/DESIGN.md)
- Regras de código: [AGENTS.md](AGENTS.md)

## Rodar

```bash
pnpm install
cp .env.example apps/web/.env.local   # preencher
pnpm dev
```

## Banco

Aplicar `supabase/migrations` em ordem (Supabase CLI: `supabase db push`). Depois, em
Settings → API → Exposed schemas, adicionar `laura`.

## Deploy na Vercel

Importar o repositório com **Root Directory = `apps/web`** e cadastrar as variáveis do `.env.example`.
