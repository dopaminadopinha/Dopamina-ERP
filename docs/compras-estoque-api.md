# API de Compras e Estoque

## Objetivo

A API permite que um assistente leia uma nota ou comprovante, confira os dados com o usuário e execute o mesmo fluxo operacional do ERP. Nenhuma informação é gravada durante a validação. A confirmação usa uma transação no PostgreSQL: fornecedor, produtos, compra, despesa, recebimento, custos e estoque são gravados juntos ou todos são desfeitos.

## Fluxo mapeado

1. `suppliers`: localizar o fornecedor por ID/nome ou criar um cadastro novo.
2. `items` e `categories`: localizar cada item; itens novos exigem tipo, unidade e categoria. Produtos vendidos também exigem setor.
3. `supplier_items`: manter o vínculo entre fornecedor e item.
4. `purchases` e `purchase_items`: criar o pedido e suas linhas.
5. `purchase_misc_items`: guardar frete ou gastos da nota que não movimentam estoque.
6. `expenses`: criar a obrigação financeira vinculada à compra.
7. `purchase_receipts` e `purchase_receipt_items`: registrar o recebimento quando os produtos já chegaram.
8. `stock_movements`: adicionar as entradas somente após recebimento confirmado.
9. `item_cost_history` e `items`: atualizar o custo comprovado dos itens recebidos.
10. `audit_logs` e `erp_command_requests`: registrar autoria, origem e chave antirrepetição.

As dashboards consultam essas fontes oficiais. A API nunca altera cards, totais calculados ou saldos visuais diretamente.

## Autenticação

Use `Authorization: Bearer <ERP_API_SECRET>`. A variável deve existir apenas na Vercel e na configuração privada do assistente. Ela nunca pode ser colocada em código, prompt público ou navegador.

O segredo fica limitado ao negócio configurado por `ERP_API_BUSINESS_SLUG` (padrão: `dopamina`). Uma sessão normal do Supabase também é aceita e continua limitada pela associação ativa do usuário ao negócio.

## Entrada de uma nota

Endpoint: `POST /api/erp/purchases/intake`.

Primeiro envie `mode: "validate"`. A resposta será `ready` ou `needs_information`. Quando houver pendências, o assistente deve fazer ao usuário exatamente as perguntas retornadas em `questions`. Essa chamada não grava nada.

Somente depois de todos os dados estarem completos e o usuário confirmar, envie novamente o mesmo documento com `mode: "commit"` e uma `idempotencyKey` estável. Repetir a mesma chave devolve o resultado anterior sem duplicar a compra.

Campos essenciais:

- fornecedor;
- data da compra;
- forma e situação do pagamento;
- vencimento, quando pendente;
- confirmação e data do recebimento;
- total declarado da nota;
- nome, quantidade comprada, unidade de compra, unidade de estoque, conversão da embalagem e preço de cada item;
- tipo, categoria e setor para produtos novos, conforme aplicável.

Exemplo de validação:

```json
{
  "mode": "validate",
  "supplier": { "name": "Mercado Exemplo" },
  "purchase": {
    "date": "2026-09-05",
    "paymentMethod": "PIX",
    "paymentStatus": "paid",
    "received": true,
    "receivedDate": "2026-09-05",
    "declaredTotal": 45
  },
  "items": [
    {
      "name": "Papel higiênico",
      "itemType": "consumable",
      "category": "Limpeza",
      "quantity": 3,
      "unit": "pacote",
      "stockUnit": "rolo",
      "unitsPerPackage": 10,
      "unitCost": 15
    }
  ]
}
```

## Operações de estoque

Endpoint: `POST /api/erp/stock`.

Aceita `operation: "movement"` para entradas avulsas e saídas manuais e `operation: "inventory"` para contagens físicas. O mesmo ciclo `validate` → confirmação do usuário → `commit` é obrigatório.

Entradas originadas de compra não são aceitas nesse endpoint. Elas devem passar pela API de compras para preservar fornecedor, despesa, recebimento e custo.

`GET /api/erp/stock?start=AAAA-MM-DD&end=AAAA-MM-DD` retorna o catálogo, saldo teórico e movimentações manuais do período para consulta do assistente.

## Segurança e consistência

- gravação atômica no banco;
- nenhuma gravação quando faltam informações;
- validação novamente no servidor e no PostgreSQL;
- chave idempotente obrigatória;
- busca de cadastros existentes antes de criar novos;
- compras não podem ser lançadas como simples entrada manual;
- histórico de auditoria para cada comando confirmado;
- chave administrativa do Supabase permanece somente no servidor.
