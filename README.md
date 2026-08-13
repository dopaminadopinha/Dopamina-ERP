# Dopamina ERP

Painel administrativo privado do Bar Dopamina. A aplicação centraliza autenticação, vendas, CMV, despesas, compras, estoque, planejamento, cadastros e importações em uma única base Supabase.

## Stack

- Next.js 16 + React 19 + TypeScript
- Supabase Auth + Postgres + Row Level Security
- Vercel para hospedagem de produção
- GitHub para versionamento

## Rodando localmente

1. Use Node.js 22 ou superior.
2. Copie `.env.example` para `.env.local` e preencha as duas variáveis públicas.
3. Execute `npm install`.
4. Execute `npm run dev`.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

## Publicação

O repositório é a fonte oficial do projeto. A Vercel deve estar conectada à
branch `main` e receber as duas variáveis públicas acima nos ambientes de
produção, preview e desenvolvimento. Cada atualização da `main` gera uma nova
publicação automática.

## Estrutura funcional

- `/`: login, cadastro e recuperação de senha.
- `/auth/redefinir`: definição de uma nova senha após o link do Supabase.
- `/dashboard`: área protegida para proprietário e gerência aprovados.
- `supabase/migrations`: esquema central, índices, RLS e fluxo de aprovação.

Todo cadastro novo entra como `manager` com status `pending`. O primeiro proprietário deve ser promovido manualmente no Supabase; depois, o próprio fluxo administrativo poderá aprovar a gerência.

## Base de dados central

| Domínio | Fonte única |
| --- | --- |
| Pessoas e acesso | `profiles` + `business_members` |
| Negócio e áreas | `businesses` + `areas` |
| Produtos, insumos e consumo | `items` + `recipes` + `recipe_items` |
| Fornecedores e compras | `suppliers` + `purchases` + `purchase_items` |
| Vendas e importações | `sales_imports` + `sales` + `sale_items` |
| Estoque | `stock_movements` + `inventory_counts` |
| Despesas e planejamento | `expenses` + `forecasts` |
| Rastreabilidade | `audit_logs` |

As telas não criam cópias paralelas desses dados. Por exemplo, CMV, estoque e compras compartilham os mesmos itens e custos.

## Segurança

- RLS está habilitado em todas as tabelas operacionais.
- Usuários autenticados só enxergam dados do negócio quando a associação está ativa.
- Novos cadastros não recebem acesso automaticamente.
- Chaves administrativas do Supabase nunca devem ser expostas no navegador.

## Verificação

```bash
npm run lint
npm run build
```
