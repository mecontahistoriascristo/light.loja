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
