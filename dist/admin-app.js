import { catalogStore } from "./catalog-store.js?v=20261010-admin-auth-fix";
import { currentAdminState, hasSupabaseConfig, sendAdminMagicLink, signOutAdmin, uploadCatalogImage } from "./supabase-client.js?v=20261010-admin-auth-fix";

const $ = (selector) => document.querySelector(selector);
const refs = {
  auth: $("#admin-auth"), workspace: $("#admin-workspace"), productForm: $("#product-form"), categoryForm: $("#category-form"), campaignForm: $("#campaign-form"),
  productList: $("#admin-product-list"), categoryList: $("#category-list"), campaignList: $("#campaign-list"), photoPreview: $("#photo-preview"), campaignPreview: $("#campaign-image-preview"),
  search: $("#catalog-search"), filter: $("#catalog-status-filter"), toast: $(".admin-toast"), categoryDeleteDialog: $("#category-delete-dialog"), categoryDeleteForm: $("#category-delete-form"), exportCsv: $("#export-catalog-csv"), exportJson: $("#export-catalog-json"),
};
const field = (name) => $("#" + name);
const state = { catalog: { categories: [], products: [] }, campaigns: [], photos: [], campaignImage: null, query: "", filter: "all", pendingCategoryDeleteId: "" };
let toastTimer;
const html = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
const money = (value) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const slug = (value) => String(value || "").trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const label = (status) => ({ draft: "Rascunho", published: "Publicado", archived: "Arquivado" })[status] || status;
const catFor = (id) => state.catalog.categories.find((category) => category.id === id);
const orderedCategories = () => [...state.catalog.categories].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "pt-BR"));
const inventoryState = (product) => {
  if (product.stock === null || product.stock === undefined) return { label: "Sob encomenda", tone: "made-to-order" };
  if (product.stock === 0) return { label: "Esgotado", tone: "sold-out" };
  if (product.stock <= 3) return { label: product.stock === 1 ? "Última unidade" : `${product.stock} unidades`, tone: "low" };
  return { label: `${product.stock} unidades`, tone: "available" };
};
const localDateTime = (value) => {
  if (!value || Number.isNaN(new Date(value).getTime())) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};
const campaignWindow = (campaign) => {
  if (!campaign.startsAt && !campaign.endsAt) return "Sem agendamento";
  const format = (value) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  if (campaign.startsAt && campaign.endsAt) return `${format(campaign.startsAt)} até ${format(campaign.endsAt)}`;
  return campaign.startsAt ? `A partir de ${format(campaign.startsAt)}` : `Até ${format(campaign.endsAt)}`;
};
function renderCampaignTargetOptions(value = field("campaign-target").value) {
  const type = field("campaign-target-type").value;
  const input = field("campaign-target");
  const options = field("campaign-target-options");
  const help = field("campaign-target-help");
  const preview = field("preview-campaign-target");
  input.type = "text";
  input.readOnly = false;
  options.innerHTML = "";
  input.removeAttribute("list");
  if (type === "catalog") {
    input.value = "#produtos";
    input.readOnly = true;
    help.textContent = "O botão levará o visitante para o catálogo completo.";
  } else if (type === "category") {
    const categories = orderedCategories().filter((category) => category.visible);
    options.innerHTML = categories.map((category) => `<option value="${html(category.id)}">${html(category.name)}</option>`).join("");
    input.setAttribute("list", "campaign-target-options");
    input.placeholder = "Escolha uma categoria visível";
    help.textContent = "Somente categorias visíveis podem ser destino de uma campanha publicada.";
    if (categories.some((category) => category.id === value)) input.value = value;
    else if (!value || value === "#produtos") input.value = categories[0]?.id || "";
  } else if (type === "product") {
    const products = state.catalog.products.filter((product) => product.status === "published" && catFor(product.categoryId)?.visible);
    options.innerHTML = products.map((product) => `<option value="${html(product.id)}">${html(product.title)}</option>`).join("");
    input.setAttribute("list", "campaign-target-options");
    input.placeholder = "Escolha um produto publicado";
    help.textContent = "Apenas produtos publicados em categorias visíveis podem ser destino de uma campanha publicada.";
    if (products.some((product) => product.id === value)) input.value = value;
    else if (!value || value === "#produtos") input.value = products[0]?.id || "";
  } else {
    input.type = "url";
    input.placeholder = "https://exemplo.com";
    help.textContent = "Use um link completo e seguro (https://). A campanha abrirá uma nova aba.";
    input.value = value === "#produtos" ? "" : value;
  }
  preview.disabled = !campaignPreviewUrl();
}
function campaignTargetError({ status, targetType, target }) {
  if (status !== "published") return "";
  if (targetType === "catalog") return "";
  if (targetType === "category" && catFor(target)?.visible) return "";
  if (targetType === "product") {
    const product = state.catalog.products.find((entry) => entry.id === target);
    if (product?.status === "published" && catFor(product.categoryId)?.visible) return "";
  }
  if (targetType === "url") {
    try { if (new URL(target).protocol === "https:") return ""; } catch { /* validated below */ }
  }
  return "Escolha um destino válido e publicado antes de publicar esta campanha.";
}
function campaignPreviewUrl() {
  const type = field("campaign-target-type").value;
  const target = field("campaign-target").value.trim();
  if (type === "url") {
    try { return new URL(target).protocol === "https:" ? target : ""; } catch { return ""; }
  }
  const url = new URL("./index.html", window.location.href);
  if (type === "product" && target) url.searchParams.set("produto", target);
  if (type === "category" && target) url.searchParams.set("categoria", target);
  if (type === "catalog") url.hash = "produtos";
  return url.toString();
}
function notify(message) { refs.toast.textContent = message; refs.toast.classList.add("is-visible"); clearTimeout(toastTimer); toastTimer = setTimeout(() => refs.toast.classList.remove("is-visible"), 3000); }
function errorText(error) { return /row-level security|permission denied|new row violates/i.test(error?.message || "") ? "Sua conta não tem permissão administrativa neste projeto." : error?.message || "Não foi possível concluir esta ação."; }
function productMedia(product) { return product.photos?.[0] ? `<img src="${html(product.photos[0])}" alt="" />` : `<div class="product-art ${html(product.art)}"><div class="object"></div></div>`; }
function downloadFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
const exportStamp = () => new Date().toISOString().slice(0, 10);
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
function exportCatalogCsv() {
  const columns = ["id", "titulo", "sku", "status", "categoria_id", "categoria", "preco", "preco_anterior", "selo", "material", "prazo_producao", "disponibilidade", "estoque", "ordem_vitrine", "peso_kg", "altura_cm", "largura_cm", "comprimento_cm", "fotos", "descricao", "seo_titulo", "seo_descricao", "atualizado_em"];
  const rows = [...state.catalog.products].sort((a, b) => a.title.localeCompare(b.title, "pt-BR")).map((product) => [product.id, product.title, product.sku, product.status, product.categoryId, catFor(product.categoryId)?.name || "", Number(product.price).toFixed(2), product.compareAtPrice ?? "", product.tag, product.material, product.productionTime, product.availability, product.stock ?? "", product.featuredRank, product.shipping.weight, product.shipping.height, product.shipping.width, product.shipping.length, product.photos.join(" | "), product.description, product.seoTitle, product.seoDescription, product.updatedAt]);
  downloadFile(`light-catalogo-${exportStamp()}.csv`, `\uFEFF${[columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}`, "text/csv;charset=utf-8");
  notify("CSV do catálogo baixado.");
}
function exportCatalogBackup() {
  const backup = { format: "light.catalog.backup/v1", exportedAt: new Date().toISOString(), categories: orderedCategories(), products: state.catalog.products, campaigns: state.campaigns };
  downloadFile(`light-backup-${exportStamp()}.json`, `${JSON.stringify(backup, null, 2)}\n`, "application/json");
  notify("Backup do catálogo baixado.");
}

function renderAuth(view) {
  refs.workspace.hidden = !view.isAdmin;
  if (!view.configured) { refs.auth.innerHTML = `<div class="admin-auth-card"><p class="eyebrow"><span></span> Configuração necessária</p><h2>Conecte o Supabase para abrir o painel.</h2><p>O painel precisa da URL e da chave publicável do projeto.</p></div>`; return; }
  if (!view.session) { refs.auth.innerHTML = `<div class="admin-auth-card"><p class="eyebrow"><span></span> Área restrita</p><h2>Entre para administrar a Light.</h2><p>Enviaremos um link seguro para seu e-mail. Somente contas autorizadas podem publicar alterações.</p><form id="admin-login-form" class="admin-login"><label for="admin-email">E-mail administrativo</label><div><input id="admin-email" name="email" type="email" autocomplete="email" required placeholder="voce@exemplo.com" /><button class="button button-primary" type="submit">Enviar link <span>→</span></button></div><p class="form-message" aria-live="polite"></p></form></div>`; return; }
  if (view.error) { refs.auth.innerHTML = `<div class="admin-auth-card admin-auth-card--denied"><p class="eyebrow"><span></span> Ativação pendente</p><h2>O banco do admin ainda não foi ativado.</h2><p>A migração de catálogo precisa ser executada no Supabase antes do primeiro acesso. Nenhuma alteração local será perdida.</p></div>`; return; }
  refs.auth.innerHTML = `<div class="admin-auth-card admin-auth-card--denied"><p class="eyebrow"><span></span> Acesso restrito</p><h2>Esta conta não é administradora.</h2><p>${html(view.session.user.email || "")}: peça para adicionar este e-mail aos administradores do projeto.</p><button type="button" class="quiet-button" data-admin-signout>Sair desta conta</button></div>`;
}

function renderMetrics() {
  $("#total-products").textContent = state.catalog.products.length;
  $("#visible-products").textContent = state.catalog.products.filter((product) => product.status === "published").length;
  $("#total-categories").textContent = state.catalog.categories.filter((category) => category.visible).length;
  $("#campaign-count").textContent = state.campaigns.filter((campaign) => campaign.status === "published").length;
}
function renderCategorySelect(selected = field("product-category").value) {
  field("product-category").innerHTML = orderedCategories().map((category) => `<option value="${html(category.id)}">${html(category.name)}${category.visible ? "" : " (oculta)"}</option>`).join("");
  if (state.catalog.categories.some((category) => category.id === selected)) field("product-category").value = selected;
}
function renderPhotos() {
  refs.photoPreview.innerHTML = state.photos.map((entry, index) => `<div class="photo-thumb"><img src="${html(entry.url)}" alt="Foto ${index + 1}" /><span class="photo-thumb__cover">${index === 0 ? "Capa" : `Foto ${index + 1}`}</span><div class="photo-thumb__actions"><button type="button" data-photo-move="${index}" data-direction="-1" ${index === 0 ? "disabled" : ""}>←</button><button type="button" data-photo-move="${index}" data-direction="1" ${index === state.photos.length - 1 ? "disabled" : ""}>→</button><button type="button" data-remove-photo="${index}">×</button></div></div>`).join("");
}
function renderCategories() {
  refs.categoryList.innerHTML = orderedCategories().map((category) => {
    const count = state.catalog.products.filter((product) => product.categoryId === category.id).length;
    return `<article class="category-row"><span class="category-symbol">${html(category.icon)}</span><div><strong>${html(category.name)}</strong><small>${count} peça${count === 1 ? "" : "s"} · ${category.showOnNav ? "No menu" : "Fora do menu"} · posição ${category.order}${category.visible ? "" : " · oculta"}</small></div><div class="category-row-actions"><button class="icon-action" type="button" data-edit-category="${html(category.id)}" aria-label="Editar">✎</button><button class="icon-action" type="button" data-toggle-category="${html(category.id)}" aria-label="${category.visible ? "Ocultar" : "Exibir"}">${category.visible ? "◉" : "○"}</button><button class="icon-action" type="button" data-delete-category="${html(category.id)}" aria-label="Remover">×</button></div></article>`;
  }).join("");
}
function renderProducts() {
  const query = state.query.trim().toLocaleLowerCase("pt-BR");
  const matchesFilter = (product) => state.filter === "all" || product.status === state.filter || (state.filter === "low-stock" && product.stock > 0 && product.stock <= 3) || (state.filter === "sold-out" && product.stock === 0);
  const list = [...state.catalog.products].filter(matchesFilter).filter((product) => !query || [product.title, product.sku, product.tag].join(" ").toLocaleLowerCase("pt-BR").includes(query)).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  refs.productList.innerHTML = list.length ? list.map((product) => { const inventory = inventoryState(product); return `<article class="admin-product-row"><div class="admin-product-image">${productMedia(product)}</div><div class="admin-product-info"><h3>${html(product.title)}</h3><p>${html(catFor(product.categoryId)?.name || "Sem categoria")} · ${product.photos.length} foto${product.photos.length === 1 ? "" : "s"}${product.sku ? ` · SKU ${html(product.sku)}` : ""} · <span class="inventory-state inventory-state--${inventory.tone}">${html(inventory.label)}</span></p></div><div class="admin-product-meta"><strong>${money(product.price)}${product.compareAtPrice ? `<small> de ${money(product.compareAtPrice)}</small>` : ""}</strong><span class="status-badge status-badge--${html(product.status)}">${label(product.status)}</span></div><div class="admin-product-actions"><button type="button" data-edit-product="${html(product.id)}">Editar</button><button type="button" data-duplicate-product="${html(product.id)}">Duplicar</button><button type="button" data-status-product="${html(product.id)}" data-next-status="${product.status === "published" ? "draft" : "published"}">${product.status === "published" ? "Despublicar" : "Publicar"}</button><button class="delete-product" type="button" data-delete-product="${html(product.id)}" aria-label="Excluir">×</button></div></article>`; }).join("") : `<p class="form-message">Nenhum produto corresponde a este filtro.</p>`;
}
function renderCampaignPreview() {
  const preview = typeof state.campaignImage === "string" ? state.campaignImage : state.campaignImage?.preview;
  refs.campaignPreview.innerHTML = preview ? `<div class="campaign-image-preview"><img src="${html(preview)}" alt="Prévia" /><button type="button" data-remove-campaign-image>Remover imagem</button></div>` : "";
}
function renderCampaigns() {
  const list = [...state.campaigns].sort((a, b) => a.order - b.order || new Date(b.updatedAt) - new Date(a.updatedAt));
  refs.campaignList.innerHTML = list.length ? list.map((campaign) => `<article class="campaign-row"><img src="${html(campaign.imageUrl)}" alt="" /><div><span class="status-badge status-badge--${html(campaign.status)}">${label(campaign.status)}</span><h3>${html(campaign.name)}</h3><p>${html(campaign.title)} · posição ${campaign.order}<br />${html(campaignWindow(campaign))}</p></div><div class="campaign-row__actions"><button type="button" data-edit-campaign="${html(campaign.id)}">Editar</button><button type="button" data-duplicate-campaign="${html(campaign.id)}">Duplicar</button><button class="delete-product" type="button" data-delete-campaign="${html(campaign.id)}" aria-label="Excluir">×</button></div></article>`).join("") : `<p class="form-message">Ainda não existe uma campanha.</p>`;
}
function render() { renderMetrics(); renderCategorySelect(); renderCategories(); renderProducts(); renderCampaigns(); renderCampaignTargetOptions(); }
async function refresh() { state.catalog = await catalogStore.hydrate({ includeUnpublished: true }); state.campaigns = await catalogStore.loadCampaigns({ includeUnpublished: true }); render(); }

function copiedLabel(value, maximum) { return `${String(value || "").slice(0, Math.max(0, maximum - 8)).trim()} cópia`.trim(); }
function nextProductCopyId(product) {
  const base = slug(`${product.id}-copia`) || `produto-${Date.now()}`;
  const ids = new Set(state.catalog.products.map((entry) => entry.id));
  let next = base;
  let suffix = 2;
  while (ids.has(next)) { next = `${base}-${suffix}`; suffix += 1; }
  return next;
}
async function duplicateProduct(id) {
  const product = state.catalog.products.find((entry) => entry.id === id);
  if (!product) return;
  const nextId = nextProductCopyId(product);
  await catalogStore.saveProduct({ ...product, id: nextId, title: copiedLabel(product.title, 90), sku: "", status: "draft", featuredRank: 0, shipping: product.shipping, photos: product.photos });
  await refresh();
  state.filter = "draft";
  refs.filter.value = "draft";
  renderProducts();
  editProduct(nextId);
  notify("Cópia criada como rascunho.");
}
async function duplicateCampaign(id) {
  const campaign = state.campaigns.find((entry) => entry.id === id);
  if (!campaign) return;
  await catalogStore.saveCampaign({ ...campaign, id: "", name: copiedLabel(campaign.name, 60), title: copiedLabel(campaign.title, 120), status: "draft", order: Math.max(0, ...state.campaigns.map((entry) => entry.order || 0)) + 1, startsAt: "", endsAt: "", imageUrl: campaign.imageUrl });
  await refresh();
  notify("Cópia da campanha criada como rascunho.");
}

function clearProduct() {
  refs.productForm.reset(); field("product-id").value = ""; field("product-form-title").textContent = "Adicionar peça"; field("product-status").value = "draft"; field("product-featured").value = "0"; field("product-compare-at").value = ""; field("product-sku").value = ""; field("product-seo-title").value = ""; field("product-seo-description").value = ""; field("product-material").value = "PLA impresso em 3D"; field("product-production-time").value = "Produção em 3 a 5 dias úteis"; field("product-availability").value = "Sob encomenda"; field("product-weight").value = "0.3"; field("product-height").value = "13"; field("product-width").value = "10"; field("product-length").value = "15"; field("product-art").value = "art-lamp"; field("product-message").textContent = ""; state.photos = []; renderCategorySelect(orderedCategories()[0]?.id); renderPhotos();
}
function editProduct(id) {
  const product = state.catalog.products.find((entry) => entry.id === id); if (!product) return;
  field("product-id").value = product.id; field("product-title").value = product.title; renderCategorySelect(product.categoryId); field("product-price").value = product.price; field("product-compare-at").value = product.compareAtPrice ?? ""; field("product-sku").value = product.sku || ""; field("product-tag").value = product.tag; field("product-material").value = product.material; field("product-production-time").value = product.productionTime; field("product-availability").value = product.availability; field("product-status").value = product.status; field("product-stock").value = product.stock ?? ""; field("product-featured").value = product.featuredRank; field("product-weight").value = product.shipping.weight; field("product-height").value = product.shipping.height; field("product-width").value = product.shipping.width; field("product-length").value = product.shipping.length; field("product-description").value = product.description; field("product-seo-title").value = product.seoTitle || ""; field("product-seo-description").value = product.seoDescription || ""; field("product-art").value = product.art; field("product-form-title").textContent = `Editar ${product.title}`; state.photos = product.photos.map((url) => ({ url, file: null })); renderPhotos(); refs.productForm.closest(".admin-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}
function clearCategory() { refs.categoryForm.reset(); field("category-previous-id").value = ""; field("category-icon").value = "✦"; field("category-order").value = state.catalog.categories.length + 1; field("category-nav").checked = true; }
function editCategory(id) { const category = catFor(id); if (!category) return; field("category-previous-id").value = category.id; field("category-name").value = category.name; field("category-icon").value = category.icon; field("category-order").value = category.order; field("category-nav").checked = category.showOnNav; field("category-name").focus(); }
function openCategoryDelete(id) {
  const category = catFor(id);
  if (!category) return;
  if (state.catalog.categories.length <= 1) return notify("Mantenha pelo menos uma categoria no catálogo.");
  const products = state.catalog.products.filter((product) => product.categoryId === id);
  const replacement = field("category-reassign-to");
  replacement.innerHTML = orderedCategories().filter((entry) => entry.id !== id).map((entry) => `<option value="${html(entry.id)}">${html(entry.name)}</option>`).join("");
  field("category-delete-title").textContent = `Remover ${category.name}`;
  field("category-delete-description").textContent = products.length ? `${products.length} peça${products.length === 1 ? "" : "s"} será${products.length === 1 ? "" : "ão"} movida${products.length === 1 ? "" : "s"} antes da categoria ser removida.` : "Esta categoria não possui peças e pode ser removida agora.";
  field("category-reassign-field").hidden = products.length === 0;
  field("category-delete-form").querySelector(".danger-confirm").textContent = products.length ? "Mover e remover" : "Remover categoria";
  field("category-delete-message").textContent = "";
  state.pendingCategoryDeleteId = id;
  refs.categoryDeleteDialog.showModal();
}
function closeCategoryDelete() { if (refs.categoryDeleteDialog.open) refs.categoryDeleteDialog.close(); state.pendingCategoryDeleteId = ""; }
refs.categoryDeleteDialog.addEventListener("close", () => { state.pendingCategoryDeleteId = ""; });
function clearCampaign() { refs.campaignForm.reset(); field("campaign-id").value = ""; field("campaign-status").value = "draft"; field("campaign-order").value = (Math.max(0, ...state.campaigns.map((campaign) => campaign.order || 0)) + 1); field("campaign-starts-at").value = ""; field("campaign-ends-at").value = ""; field("campaign-cta-label").value = "Conhecer a coleção"; field("campaign-target-type").value = "catalog"; field("campaign-target").value = "#produtos"; field("campaign-message").textContent = ""; state.campaignImage = null; renderCampaignPreview(); renderCampaignTargetOptions("#produtos"); }
function editCampaign(id) { const campaign = state.campaigns.find((entry) => entry.id === id); if (!campaign) return; field("campaign-id").value = campaign.id; field("campaign-name").value = campaign.name; field("campaign-status").value = campaign.status; field("campaign-eyebrow").value = campaign.eyebrow; field("campaign-order").value = campaign.order; field("campaign-starts-at").value = localDateTime(campaign.startsAt); field("campaign-ends-at").value = localDateTime(campaign.endsAt); field("campaign-title-input").value = campaign.title; field("campaign-description").value = campaign.description; field("campaign-cta-label").value = campaign.ctaLabel; field("campaign-target-type").value = campaign.ctaTargetType; field("campaign-target").value = campaign.ctaTarget; renderCampaignTargetOptions(campaign.ctaTarget); state.campaignImage = campaign.imageUrl; renderCampaignPreview(); refs.campaignForm.closest(".admin-panel").scrollIntoView({ behavior: "smooth", block: "start" }); }

field("product-photos").addEventListener("change", (event) => { const files = [...event.target.files].slice(0, Math.max(0, 4 - state.photos.length)); files.forEach((file) => state.photos.push({ file, url: URL.createObjectURL(file) })); event.target.value = ""; renderPhotos(); });
field("campaign-image").addEventListener("change", (event) => { const file = event.target.files?.[0]; if (file) { state.campaignImage = { file, preview: URL.createObjectURL(file) }; renderCampaignPreview(); } event.target.value = ""; });
field("campaign-target-type").addEventListener("change", () => renderCampaignTargetOptions(""));
field("campaign-target").addEventListener("input", () => { field("preview-campaign-target").disabled = !campaignPreviewUrl(); });
field("preview-campaign-target").addEventListener("click", () => { const url = campaignPreviewUrl(); if (url) window.open(url, "_blank", "noopener"); });
refs.search.addEventListener("input", (event) => { state.query = event.target.value; renderProducts(); });
refs.filter.addEventListener("change", (event) => { state.filter = event.target.value; renderProducts(); });
refs.exportCsv.addEventListener("click", exportCatalogCsv);
refs.exportJson.addEventListener("click", exportCatalogBackup);

refs.productForm.addEventListener("submit", async (event) => {
  event.preventDefault(); const submit = refs.productForm.querySelector('button[type="submit"]'); submit.disabled = true; field("product-message").textContent = "Salvando…";
  try { const photos = await Promise.all(state.photos.map((entry) => entry.file ? uploadCatalogImage(entry.file, "products") : entry.url)); await catalogStore.saveProduct({ id: field("product-id").value || slug(field("product-title").value), title: field("product-title").value, categoryId: field("product-category").value, price: field("product-price").value, compareAtPrice: field("product-compare-at").value, sku: field("product-sku").value, tag: field("product-tag").value, material: field("product-material").value, productionTime: field("product-production-time").value, availability: field("product-availability").value, status: field("product-status").value, stock: field("product-stock").value, featuredRank: field("product-featured").value, shipping: { weight: field("product-weight").value, height: field("product-height").value, width: field("product-width").value, length: field("product-length").value }, description: field("product-description").value, seoTitle: field("product-seo-title").value, seoDescription: field("product-seo-description").value, art: field("product-art").value, photos }); await refresh(); clearProduct(); notify("Produto salvo."); }
  catch (error) { field("product-message").textContent = errorText(error); } finally { submit.disabled = false; }
});
refs.categoryForm.addEventListener("submit", async (event) => { event.preventDefault(); try { await catalogStore.saveCategory({ previousId: field("category-previous-id").value, name: field("category-name").value, icon: field("category-icon").value, order: field("category-order").value, showOnNav: field("category-nav").checked, visible: true }); await refresh(); clearCategory(); notify("Categoria salva."); } catch (error) { notify(errorText(error)); } });
refs.categoryDeleteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = state.pendingCategoryDeleteId;
  const submit = refs.categoryDeleteForm.querySelector('button[type="submit"]');
  if (!id) return;
  submit.disabled = true;
  field("category-delete-message").textContent = "Movendo peças e removendo categoria…";
  try {
    const hasProducts = state.catalog.products.some((product) => product.categoryId === id);
    await catalogStore.deleteCategory(id, hasProducts ? field("category-reassign-to").value : "");
    await refresh();
    clearCategory();
    closeCategoryDelete();
    notify("Categoria removida.");
  } catch (error) {
    field("category-delete-message").textContent = errorText(error);
  } finally {
    submit.disabled = false;
  }
});
refs.campaignForm.addEventListener("submit", async (event) => { event.preventDefault(); const submit = refs.campaignForm.querySelector('button[type="submit"]'); submit.disabled = true; field("campaign-message").textContent = "Salvando…"; try { const targetType = field("campaign-target-type").value; const target = field("campaign-target").value.trim(); const targetError = campaignTargetError({ status: field("campaign-status").value, targetType, target }); if (targetError) throw new Error(targetError); const imageUrl = state.campaignImage?.file ? await uploadCatalogImage(state.campaignImage.file, "campaigns") : state.campaignImage; await catalogStore.saveCampaign({ id: field("campaign-id").value, name: field("campaign-name").value, status: field("campaign-status").value, eyebrow: field("campaign-eyebrow").value, order: field("campaign-order").value, startsAt: field("campaign-starts-at").value, endsAt: field("campaign-ends-at").value, title: field("campaign-title-input").value, description: field("campaign-description").value, ctaLabel: field("campaign-cta-label").value, ctaTargetType: targetType, ctaTarget: target, imageUrl }); await refresh(); clearCampaign(); notify("Campanha salva. O carrossel será atualizado na loja."); } catch (error) { field("campaign-message").textContent = errorText(error); } finally { submit.disabled = false; } });

document.addEventListener("submit", async (event) => { if (event.target.id !== "admin-login-form") return; event.preventDefault(); const form = event.target; const message = form.querySelector(".form-message"); const button = form.querySelector("button"); button.disabled = true; message.textContent = "Enviando link seguro…"; try { await sendAdminMagicLink(form.elements.email.value); message.textContent = "Link enviado. Abra seu e-mail neste dispositivo para entrar."; } catch (error) { message.textContent = errorText(error); } finally { button.disabled = false; } });
document.addEventListener("click", async (event) => {
  const move = event.target.closest("[data-photo-move]"); const remove = event.target.closest("[data-remove-photo]"); const metric = event.target.closest("[data-admin-filter]");
  if (move) { const from = Number(move.dataset.photoMove); const to = from + Number(move.dataset.direction); if (state.photos[to]) [state.photos[from], state.photos[to]] = [state.photos[to], state.photos[from]]; renderPhotos(); return; }
  if (remove) { state.photos.splice(Number(remove.dataset.removePhoto), 1); renderPhotos(); return; }
  if (event.target.closest("[data-close-category-delete]")) { closeCategoryDelete(); return; }
  if (event.target.closest("[data-remove-campaign-image]")) { state.campaignImage = null; renderCampaignPreview(); return; }
  if (event.target.closest("#clear-product")) { clearProduct(); return; } if (event.target.closest("#clear-campaign")) { clearCampaign(); return; }
  if (metric) { const target = metric.dataset.adminFilter; if (target === "categories") return $("#category-title").scrollIntoView({ behavior: "smooth", block: "start" }); if (target === "campaigns") return $("#campaign-panel").scrollIntoView({ behavior: "smooth", block: "start" }); state.filter = target; refs.filter.value = target; $("#catalog-panel").scrollIntoView({ behavior: "smooth", block: "start" }); renderProducts(); return; }
  if (event.target.closest("[data-admin-signout]")) { await signOutAdmin(); await boot(); return; }
  const editProductButton = event.target.closest("[data-edit-product]"); if (editProductButton) return editProduct(editProductButton.dataset.editProduct);
  const editCategoryButton = event.target.closest("[data-edit-category]"); if (editCategoryButton) return editCategory(editCategoryButton.dataset.editCategory);
  const editCampaignButton = event.target.closest("[data-edit-campaign]"); if (editCampaignButton) return editCampaign(editCampaignButton.dataset.editCampaign);
  try {
    const duplicateProductButton = event.target.closest("[data-duplicate-product]"); if (duplicateProductButton) { await duplicateProduct(duplicateProductButton.dataset.duplicateProduct); return; }
    const duplicateCampaignButton = event.target.closest("[data-duplicate-campaign]"); if (duplicateCampaignButton) { await duplicateCampaign(duplicateCampaignButton.dataset.duplicateCampaign); return; }
    const status = event.target.closest("[data-status-product]"); if (status) { const product = state.catalog.products.find((entry) => entry.id === status.dataset.statusProduct); if (product) { await catalogStore.saveProduct({ ...product, status: status.dataset.nextStatus, shipping: product.shipping }); await refresh(); notify(status.dataset.nextStatus === "published" ? "Produto publicado." : "Produto virou rascunho."); } return; }
    const deleteProduct = event.target.closest("[data-delete-product]"); if (deleteProduct) { const product = state.catalog.products.find((entry) => entry.id === deleteProduct.dataset.deleteProduct); if (product && window.confirm(`Excluir “${product.title}”?`)) { await catalogStore.deleteProduct(product.id); await refresh(); clearProduct(); notify("Produto removido."); } return; }
    const toggleCategory = event.target.closest("[data-toggle-category]"); if (toggleCategory) { const category = catFor(toggleCategory.dataset.toggleCategory); if (category) { await catalogStore.saveCategory({ ...category, visible: !category.visible }); await refresh(); notify(category.visible ? "Categoria ocultada." : "Categoria exibida."); } return; }
    const deleteCategory = event.target.closest("[data-delete-category]"); if (deleteCategory) { openCategoryDelete(deleteCategory.dataset.deleteCategory); return; }
    const deleteCampaign = event.target.closest("[data-delete-campaign]"); if (deleteCampaign) { const campaign = state.campaigns.find((entry) => entry.id === deleteCampaign.dataset.deleteCampaign); if (campaign && window.confirm(`Excluir “${campaign.name}”?`)) { await catalogStore.deleteCampaign(campaign.id); await refresh(); clearCampaign(); notify("Campanha removida."); } }
  } catch (error) { notify(errorText(error)); }
});

async function boot() { if (!hasSupabaseConfig()) return renderAuth({ configured: false, session: null, isAdmin: false }); const admin = await currentAdminState(); renderAuth(admin); if (!admin.isAdmin) return; await refresh(); clearProduct(); clearCategory(); clearCampaign(); }
boot();
