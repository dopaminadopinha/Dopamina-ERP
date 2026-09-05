import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { verifyMcpToken } from "@/lib/erp-api/mcp-auth";
import { commitPurchaseIntake, validatePurchaseIntake, type PurchaseIntakeBody } from "@/lib/erp-api/purchase-intake";
import { commitStockCommand, getStockContext, validateStockCommand, type ErpCommandContext, type StockBody } from "@/lib/erp-api/stock";
import { createAdminClient } from "@/lib/zig-api/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

const numericValue = z.union([z.number(), z.string()]);
const nullableNumericValue = z.union([z.number(), z.string(), z.null()]);

const supplierSchema = z.object({
  id: z.number().int().positive().optional().describe("ID do fornecedor já cadastrado"),
  name: z.string().optional().describe("Nome do fornecedor"),
  document: z.string().optional().describe("CPF ou CNPJ, quando disponível"),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  notes: z.string().optional(),
});

const purchaseSchema = z.object({
  date: z.string().optional().describe("Data da compra no formato AAAA-MM-DD"),
  invoiceNumber: z.string().optional(),
  paymentMethod: z.string().optional(),
  paymentStatus: z.enum(["pending", "paid"]).optional(),
  dueDate: z.string().nullable().optional().describe("Vencimento no formato AAAA-MM-DD"),
  received: z.boolean().optional().describe("Se os produtos já foram recebidos fisicamente"),
  receivedDate: z.string().optional().describe("Data do recebimento no formato AAAA-MM-DD"),
  declaredTotal: numericValue.optional(),
  notes: z.string().optional(),
});

const purchaseItemSchema = z.object({
  itemId: z.number().int().positive().optional(),
  name: z.string().optional(),
  sku: z.string().optional(),
  itemType: z.enum(["product", "ingredient", "consumable"]).optional(),
  category: z.string().optional(),
  sector: z.string().optional(),
  quantity: numericValue.optional().describe("Quantidade de embalagens ou unidades compradas"),
  unit: z.string().optional().describe("Unidade de compra: un, pacote, caixa, kg, L etc."),
  stockUnit: z.string().optional().describe("Unidade usada no controle do estoque"),
  unitsPerPackage: numericValue.optional().describe("Quantidade de unidades de estoque em cada unidade de compra"),
  unitCost: numericValue.optional().describe("Preço por unidade de compra"),
  lineTotal: numericValue.optional(),
});

const miscItemSchema = z.object({
  description: z.string().optional(),
  quantity: numericValue.optional(),
  unit: z.string().optional(),
  unitCost: numericValue.optional(),
  lineTotal: numericValue.optional(),
});

const purchaseIntakeSchema = z.object({
  supplier: supplierSchema.optional(),
  purchase: purchaseSchema.optional(),
  items: z.array(purchaseItemSchema).optional(),
  miscItems: z.array(miscItemSchema).optional(),
});

const movementSchema = z.object({
  operation: z.literal("movement"),
  date: z.string().optional().describe("Data da movimentação no formato AAAA-MM-DD"),
  itemId: z.number().int().positive().optional(),
  itemName: z.string().optional(),
  reason: z.enum(["other_in", "breakage", "waste", "expiration", "courtesy", "internal_consumption", "operational_error", "loss", "other_out"]).optional(),
  quantity: numericValue.optional(),
  unitCost: nullableNumericValue.optional(),
  notes: z.string().optional(),
});

const inventorySchema = z.object({
  operation: z.literal("inventory"),
  date: z.string().optional().describe("Data da contagem no formato AAAA-MM-DD"),
  notes: z.string().optional(),
  items: z.array(z.object({
    itemId: z.number().int().positive().optional(),
    itemName: z.string().optional(),
    countedQuantity: numericValue.optional(),
  })).optional(),
});

const stockOperationSchema = z.discriminatedUnion("operation", [movementSchema, inventorySchema]);

function toolResponse(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(error: unknown) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: error instanceof Error ? error.message : "Não foi possível concluir a operação." }],
  };
}

function commandContext(authInfo: { extra?: Record<string, unknown> } | undefined): ErpCommandContext {
  const businessId = Number(authInfo?.extra?.businessId);
  const actorId = typeof authInfo?.extra?.userId === "string" ? authInfo.extra.userId : null;
  if (!Number.isInteger(businessId) || businessId <= 0 || !actorId) throw new Error("A sessão não possui acesso ativo ao Dopamina ERP.");
  return { admin: createAdminClient(), businessId, actorId, source: "mcp" };
}

const mcpHandler = createMcpHandler((server) => {
  server.registerTool(
    "consultar_estoque",
    {
      title: "Consultar estoque do Dopamina",
      description: "Consulta itens, saldos e movimentações reais do estoque. Use antes de escolher um item ou responder perguntas sobre estoque.",
      inputSchema: z.object({
        start: z.string().optional().describe("Início no formato AAAA-MM-DD; padrão: 30 dias atrás"),
        end: z.string().optional().describe("Fim no formato AAAA-MM-DD; padrão: hoje"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ start, end }, ctx) => {
      try {
        const context = commandContext(ctx.http?.authInfo);
        const today = new Date().toISOString().slice(0, 10);
        const defaultStart = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
        return toolResponse(await getStockContext(context, start || defaultStart, end || today));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "validar_compra",
    {
      title: "Validar compra ou nota",
      description: "Valida os dados extraídos de uma nota sem gravar nada. Deve ser chamada antes de registrar_compra. Se houver questions, pergunte todas ao usuário e valide novamente. Nunca invente campos.",
      inputSchema: purchaseIntakeSchema,
      annotations: { readOnlyHint: true },
    },
    async (input, ctx) => {
      try {
        const context = commandContext(ctx.http?.authInfo);
        const result = await validatePurchaseIntake(context.admin, context.businessId, input as PurchaseIntakeBody);
        return toolResponse({ ...result, businessId: context.businessId });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "registrar_compra",
    {
      title: "Registrar compra confirmada",
      description: "Registra fornecedor, novos itens, compra, despesa, recebimento, custos e estoque em uma única transação. Use somente após validar_compra retornar readyToCommit=true e o usuário confirmar explicitamente.",
      inputSchema: purchaseIntakeSchema.extend({
        confirmed: z.literal(true).describe("Deve ser true somente após confirmação explícita do usuário"),
        idempotencyKey: z.string().min(8).max(160).describe("Identificador único e estável da nota para impedir duplicidade"),
      }),
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    async ({ confirmed: _confirmed, idempotencyKey, ...input }, ctx) => {
      try {
        void _confirmed;
        const context = commandContext(ctx.http?.authInfo);
        return toolResponse(await commitPurchaseIntake(context, { ...(input as PurchaseIntakeBody), mode: "commit", idempotencyKey }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "validar_operacao_estoque",
    {
      title: "Validar movimentação ou inventário",
      description: "Valida uma entrada/saída manual ou contagem física sem alterar o estoque. Compras de fornecedor devem usar validar_compra, nunca uma entrada manual.",
      inputSchema: stockOperationSchema,
      annotations: { readOnlyHint: true },
    },
    async (input, ctx) => {
      try {
        const context = commandContext(ctx.http?.authInfo);
        return toolResponse(await validateStockCommand(context, input as StockBody));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "registrar_operacao_estoque",
    {
      title: "Registrar movimentação ou inventário confirmado",
      description: "Executa uma movimentação manual ou inventário de forma atômica e auditável. Use somente depois da validação e da confirmação explícita do usuário.",
      inputSchema: z.object({
        data: stockOperationSchema,
        confirmed: z.literal(true).describe("Deve ser true somente após confirmação explícita do usuário"),
        idempotencyKey: z.string().min(8).max(160).describe("Identificador único e estável para impedir duplicidade"),
      }),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ data, confirmed: _confirmed, idempotencyKey }, ctx) => {
      try {
        void _confirmed;
        const context = commandContext(ctx.http?.authInfo);
        return toolResponse(await commitStockCommand(context, { ...(data as StockBody), mode: "commit", idempotencyKey }));
      } catch (error) {
        return toolError(error);
      }
    },
  );
}, {
  serverInfo: { name: "dopamina-erp", version: "1.0.0" },
  instructions: "Ferramentas oficiais do Dopamina ERP. Sempre valide primeiro, pergunte todos os dados pendentes e só execute gravações após confirmação explícita do usuário. Nunca escreva diretamente no Supabase.",
  maxSubscriptions: 0,
});

const handler = withMcpAuth(mcpHandler, verifyMcpToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { handler as GET, handler as POST };
