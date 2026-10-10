import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

const files = {
  storefront: new URL("dist/index.html", root),
  storefrontApp: new URL("dist/app.js", root),
  admin: new URL("dist/admin.html", root),
  runtime: new URL("dist/runtime-config.js", root),
  store: new URL("dist/catalog-store.js", root),
  client: new URL("dist/supabase-client.js", root),
  adminApp: new URL("dist/admin-app.js", root),
  migration: new URL("supabase/migrations/20261010193000_catalog_admin_foundation.sql", root),
  orderMigration: new URL("supabase/migrations/20261010220000_light_orders.sql", root),
  createOrder: new URL("supabase/functions/create-order/index.ts", root),
  shippingQuote: new URL("supabase/functions/shipping-quote/index.ts", root),
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([name, file]) => [name, await readFile(file, "utf8")]))
);

const checks = [
  ["A vitrine carrega a configuração pública", source.storefront.includes("runtime-config.js")],
  ["O admin usa o novo módulo autenticado", source.admin.includes("admin-app.js")],
  ["A chave do navegador é publicável", source.runtime.includes("supabasePublishableKey") && !source.runtime.includes("service_role")],
  ["O token da SuperFrete não aparece no frontend", !/SUPERFRETE_TOKEN|Bearer\s+[A-Za-z0-9._-]{20,}/.test(`${source.storefront}\n${source.runtime}\n${source.adminApp}`)],
  ["O cliente exige autorização administrativa", source.client.includes("is_light_admin")],
  ["Fotos seguras do Storage permanecem disponíveis na vitrine", source.adminApp.includes("uploadCatalogImage") && source.migration.includes("catalog-media") && source.store.includes("isSupportedPhoto")],
  ["Preço promocional percorre admin, catálogo e vitrine", source.admin.includes("product-compare-at") && source.store.includes("compare_at_price_cents") && source.storefrontApp.includes("hasDiscount")],
  ["Campanhas podem ser agendadas", source.admin.includes("campaign-starts-at") && source.store.includes("starts_at") && source.migration.includes("ends_at" )],
  ["Campanhas publicadas validam destino antes de chegar à vitrine", source.admin.includes("campaign-target-options") && source.adminApp.includes("campaignTargetError") && source.storefrontApp.includes("categoryIdFromUrl")],
  ["Remoção de categoria preserva produtos em uma operação atômica", source.admin.includes("category-delete-dialog") && source.store.includes("delete_catalog_category") && source.migration.includes("create or replace function public.delete_catalog_category")],
  ["Catálogo possui exportação operacional e backup", source.admin.includes("export-catalog-csv") && source.adminApp.includes("exportCatalogCsv") && source.adminApp.includes("light.catalog.backup/v1")],
  ["Produtos e campanhas podem ser duplicados sem publicação acidental", source.adminApp.includes("duplicateProduct") && source.adminApp.includes("duplicateCampaign") && source.adminApp.includes('status: "draft"')],
  ["Estoque baixo e esgotado recebem tratamento operacional", source.admin.includes('value="low-stock"') && source.adminApp.includes("inventoryState") && source.storefrontApp.includes("stock-note--low")],
  ["O banco protege produtos publicados por categoria visível", source.migration.includes("category.visible = true")],
  ["O bucket de imagens exige conta administrativa para escrita", source.migration.includes("Admins upload catalog media") && source.migration.includes("public.is_light_admin()")],
  ["Pedidos são gravados somente por função segura e lidos por admins", source.orderMigration.includes("Admins can view Light orders") && source.orderMigration.includes("revoke all on public.light_orders from anon, authenticated") && source.createOrder.includes("SUPABASE_SERVICE_ROLE_KEY")],
  ["Cotações públicas enviam a chave publicável e aceitam seu preflight CORS", source.storefrontApp.includes("shippingFunctionHeaders()") && source.storefrontApp.includes("apikey: publishableKey") && source.shippingQuote.includes("access-control-allow-headers\": \"apikey")],
  ["Pedidos pendentes expiram e têm dados pessoais removidos automaticamente", source.orderMigration.includes("expires_at timestamptz not null default (now() + interval '7 days')") && source.orderMigration.includes("interval '30 days'") && source.orderMigration.includes("cron.schedule('light-orders-retention'") && source.orderMigration.includes("personal_data_deleted_at")],
  ["Criação de pedidos tem limite por IP com identificador protegido e temporário", source.orderMigration.includes("extensions.hmac") && source.orderMigration.includes("consume_light_order_rate_limit") && source.orderMigration.includes("interval '24 hours'") && source.createOrder.includes('request.headers.get("x-real-ip")') && source.createOrder.includes('"retry-after": "3600"')],
  ["Pedido valida preço, estoque e frete no servidor", source.createOrder.includes("catalog_products") && source.createOrder.includes("selectedQuote") && source.createOrder.includes("SUPERFRETE_TOKEN")],
  ["Checkout cria somente pedidos pendentes, sem pagamento ou cartão", source.storefrontApp.includes("createPendingOrder") && source.storefrontApp.includes("pending_payment") === false && source.storefront.includes("aguardando pagamento") && !source.storefront.includes("type=\"credit-card\"")],
  ["Admin lista e cancela apenas pedidos aguardando pagamento", source.admin.includes("admin-orders") && source.adminApp.includes("light_orders") && source.adminApp.includes("cancel_pending_light_order")],
  ["Admin trata pedidos expirados e dados pessoais removidos", source.admin.includes('value="expired"') && source.adminApp.includes('status === "expired"') && source.adminApp.includes("personal_data_deleted_at")],
];

const failures = checks.filter(([, passed]) => !passed).map(([label]) => label);

for (const [label, passed] of checks) {
  console.log(`${passed ? "✓" : "✗"} ${label}`);
}

if (failures.length) {
  console.error(`\nFalharam ${failures.length} verificações de release.`);
  process.exitCode = 1;
} else {
  console.log("\nVerificações de release concluídas.");
}
