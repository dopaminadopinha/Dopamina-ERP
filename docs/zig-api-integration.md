# Integração da API Zig

## Diagnóstico anterior à implementação

O levantamento foi feito antes de qualquer alteração. O ERP possuía dados reais de planilha em Vendas, CMV, Despesas e Importações. Estoque, Planejamento, Cadastros e Configurações eram estruturas visuais ainda sem operação. A tabela `sales` representa um fechamento inteiro e `sale_items` contém linhas agregadas do relatório; elas foram preservadas como histórico e contingência porque não modelam transações individuais.

| Tela | Indicador | Fonte anterior | Dado necessário | Endpoint Zig | Campo Zig | Destino Supabase | Regra/status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Visão geral | Receita | Fechamento XLSX | recebimentos do período | `/erp/faturamento` | `value` | `zig_payment_totals.value_cents` | somar centavos; API disponível |
| Visão geral | Receita x despesas | XLSX + despesas manuais | receita e despesas | `/erp/faturamento` | `value` | pagamentos + `expenses` | despesas continuam manuais |
| Visão geral | Resultado conhecido | XLSX + CMV | receita − despesas − custo conhecido | faturamento + planilha CMV | `value` | pagamentos + despesas + CMV | cálculo parcial enquanto houver custos ausentes |
| Visão geral | Composição | Fechamento XLSX | bruto, descontos, recebimentos e transações | saída + faturamento | `unitValue`, `count`, `discountValue`, `value` | tabelas Zig | serviço/contas abertas ainda dependem do XLSX |
| Visão geral | Saúde dos dados | percentual fixo | estado real das fontes | ambos | resposta válida | `zig_sync_state` | calculado; não é mais simulado |
| Vendas | Bruto | Produtos XLSX | preço × quantidade | `/erp/saida-produtos` | `unitValue`, `count` | `zig_transaction_items.gross_amount_cents` | centavos; excluir estornos |
| Vendas | Descontos | Produtos XLSX | desconto por item | `/erp/saida-produtos` | `discountValue` | `discount_amount_cents` | líquido = bruto − desconto |
| Vendas | Itens vendidos | Produtos XLSX | quantidade/fração | `/erp/saida-produtos` | `count`, `fractionalAmount`, `fractionUnit` | quantidade + campos fracionários | API disponível; validação real pendente |
| Vendas | Ranking/tabela | Produtos XLSX | produto, categoria, setor, totais | `/erp/saida-produtos` | produto + `barName` | `items`, categorias, áreas e itens Zig | calculado por líquido |
| Vendas | Formas de pagamento | Fechamento XLSX | total por meio | `/erp/faturamento` | `paymentId`, `paymentName`, `value` | `zig_payment_totals` | API disponível |
| Vendas | Dia operacional | indisponível | evento e data/hora civil | `/erp/saida-produtos` | `transactionDate`, `eventDate`, `eventId` | `zig_sales_transactions` | ambos preservados; filtro usa dia operacional |
| Vendas | Funcionário/origem | indisponível | atribuição da venda | `/erp/saida-produtos` | `employeeName`, `source` | `zig_sales_transactions` | disponível para evolução futura; documentos pessoais não são salvos |
| Vendas | Estornos | não explícito | situação do item/transação | `/erp/saida-produtos` | `isRefunded` | transações e itens Zig | excluídos de KPIs e ranking |
| CMV | custo e margem | cadastro central + CMV XLSX | vendas e custo médio/último custo | `/erp/saida-produtos` + cadastro | quantidade e valor líquido | itens Zig + `items` | cálculo automático com cobertura explícita; XLSX permanece como complemento |
| CMV | Curva ABC de vendas | ABC XLSX incompleto | participação acumulada de vendas | `/erp/saida-produtos` | valores derivados | itens Zig | pode ser calculada; ABC de estoque continua no XLSX |
| Despesas | lançamentos | manual | contas e pagamentos | não confirmado | — | `expenses` | não disponível na API atual |
| Estoque | saldo/movimentos | sem dados | estoque, perdas, entradas | não confirmado | — | estrutura existente | fonte ainda não disponível pela API atual |
| Planejamento | metas | sem dados | previsões e realizado | faturamento para realizado | `value` | `forecasts` + pagamentos | API parcialmente disponível |
| Cadastros | produtos | planilhas | identificador central | `/erp/saida-produtos` | `productId`, SKU, nome, categoria | `items.zig_product_id` | cadastro único reutilizado |
| Importações | histórico | `sales_imports` | tentativas e progresso | ambos | HTTP/linhas | `zig_sync_runs`, `zig_sync_state` | incremental, por endpoint e dia |

## Arquitetura

```text
Zig API
  → cliente server-only (timeout, retry e backoff)
  → rota Next.js autenticada / Vercel Cron
  → normalização UTF-8 e valores em centavos
  → funções atômicas de ingestão no Supabase
  → tabelas transacionais + tabela central de itens
  → RPC agregadora protegida por RLS
  → dashboard
```

## Arquivos e responsabilidades

- `lib/zig-api/client.ts`: autenticação server-only e chamadas diárias controladas.
- `lib/zig-api/normalize.ts`: valida datas, centavos, estornos, descontos e chaves idempotentes.
- `lib/zig-api/sync.ts`: registra tentativas, continua após falha isolada e executa ingestões atômicas.
- `app/api/zig/sync/route.ts`: sincronização manual autenticada e execução pelo Cron.
- `supabase/migrations/*_zig_api_sales_sync.sql`: produtos externos, transações, itens, pagamentos, estado, RLS e RPCs.
- `components/dashboard-shell.tsx`: filtros reais, sincronização, CMV automático, custos centralizados e planilha como contingência.

## Segurança e operação

- `ZIG_API_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET` nunca usam prefixo `NEXT_PUBLIC_`.
- O navegador envia apenas o JWT do usuário do ERP ao backend; nunca recebe o token Zig.
- CPF, documento, telefone e e-mail de compradores/funcionários não são persistidos.
- A sincronização é diária, sequencial e limitada a 31 dias por execução.
- Reexecuções substituem atomicamente o mesmo dia operacional, sem duplicação.
- O Cron diário consulta ontem e hoje, cobrindo vendas que atravessam a madrugada.

## Validação real pendente

O cenário de 12/08/2026 deve produzir aproximadamente R$ 6.551,79 no faturamento e conter produtos conhecidos como ANTARCTICA BOA LITRÃO, CONTRA FILÉ, FRANGO BACON e CORAÇÃO. O CMV automático usa custo médio e, na ausência dele, o último custo; produtos sem custo permanecem fora do CMV conhecido e aparecem na cobertura pendente.
