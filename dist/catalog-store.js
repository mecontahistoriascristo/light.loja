import { getSupabaseClient, hasSupabaseConfig } from "./supabase-client.js?v=20261010-admin-auth-fix";

const STORAGE_KEY = "light-loja-catalog-v1";
let memoryCatalog = "";
let cachedCatalog = null;
let cachedCampaigns = [];

// Until each product has its measured package, use one conservative small-box profile.
// Each catalogue item below can override it with its own estimated package.
const DEFAULT_SHIPPING = Object.freeze({ weight: 0.3, height: 13, width: 10, length: 15 });

const defaultCatalog = {
  categories: [
    { id: "decoracao", name: "Decoração", icon: "⌂", order: 1, showOnNav: true, visible: true },
    { id: "presentes", name: "Presentes", icon: "⌑", order: 2, showOnNav: true, visible: true },
  ],
  products: [
    { id: "presepio-sagrada-familia", title: "Presépio Sagrada Família", categoryId: "presentes", price: 79.9, art: "art-arch", tag: "Coleção de Natal", description: "Uma leitura minimalista da Sagrada Família, impressa camada por camada para acompanhar os seus rituais de dezembro.", material: "PLA impresso em 3D", productionTime: "Produção em 3 a 5 dias úteis", availability: "Sob encomenda", visible: true, featuredRank: 2, isHero: true, photos: ["./assets/presepio-sagrada-familia.webp"], shipping: { weight: 0.35, height: 14, width: 14, length: 18 }, updatedAt: "2026-10-09T23:45:00.000Z" },
    { id: "presepio-arco-da-estrela", title: "Presépio Arco da Estrela", categoryId: "decoracao", price: 94.9, art: "art-arch", tag: "Novo", description: "Um arco escultural com estrela-guia para iluminar a cena mais especial da estação.", material: "PLA impresso em 3D", productionTime: "Produção em 3 a 5 dias úteis", availability: "Sob encomenda", visible: true, featuredRank: 1, isHero: false, photos: ["./assets/presepio-arco-da-estrela.webp"], shipping: { weight: 0.45, height: 22, width: 12, length: 20 }, updatedAt: "2026-10-09T23:45:00.000Z" },
    { id: "presepio-completo", title: "Presépio Completo", categoryId: "presentes", price: 129.9, art: "art-house", tag: "Edição especial", description: "Conjunto completo de figuras para montar uma cena afetiva, cheia de pequenos detalhes.", material: "PLA impresso em 3D", productionTime: "Produção em 4 a 7 dias úteis", availability: "Sob encomenda", visible: true, featuredRank: 3, isHero: false, photos: ["./assets/presepio-completo.webp"], shipping: { weight: 0.7, height: 14, width: 22, length: 28 }, updatedAt: "2026-10-09T23:45:00.000Z" },
    { id: "organizador-vila-de-natal", title: "Organizador Vila de Natal", categoryId: "decoracao", price: 54.9, art: "art-house", tag: "Para presentear", description: "Bandeja organizadora com vila iluminada para guardar chaves, bilhetes e pequenos objetos.", material: "PLA impresso em 3D", productionTime: "Produção em 3 a 5 dias úteis", availability: "Sob encomenda", visible: true, featuredRank: 4, isHero: false, photos: ["./assets/organizador-vila-natal.webp"], shipping: { weight: 0.55, height: 10, width: 22, length: 25 }, updatedAt: "2026-10-09T23:45:00.000Z" },
  ],
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const slug = (value) => String(value || "").trim().toLocaleLowerCase("pt-BR")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function storage() {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return {
    getItem: () => memoryCatalog || null,
    setItem: (_key, value) => { memoryCatalog = value; },
    removeItem: () => { memoryCatalog = ""; },
  };
}

function shippingNumber(value, fallback, maximum) {
  const numeric = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(numeric) && numeric > 0 && numeric <= maximum ? numeric : fallback;
}

function normaliseShipping(value = {}) {
  return {
    weight: shippingNumber(value.weight, DEFAULT_SHIPPING.weight, 30),
    height: shippingNumber(value.height, DEFAULT_SHIPPING.height, 100),
    width: shippingNumber(value.width, DEFAULT_SHIPPING.width, 100),
    length: shippingNumber(value.length, DEFAULT_SHIPPING.length, 100),
  };
}

function normaliseStock(value) {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : null;
}

function isSupportedPhoto(value) {
  if (typeof value !== "string" || !value) return false;
  if (value.startsWith("data:image/") || value.startsWith("./assets/")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function normaliseCatalog(value) {
  if (!value || !Array.isArray(value.categories) || !Array.isArray(value.products)) return clone(defaultCatalog);
  const categories = value.categories.map((category, index) => ({
    id: slug(category.id || category.name) || `categoria-${index + 1}`,
    name: String(category.name || "Sem nome").trim(),
    icon: String(category.icon || "✦").slice(0, 3),
    order: Number(category.order) || index + 1,
    showOnNav: category.showOnNav !== false,
    visible: category.visible !== false,
  })).filter((category) => category.name);
  const categoryIds = new Set(categories.map((category) => category.id));
  const products = value.products.map((product, index) => ({
    id: slug(product.id || product.title) || `produto-${index + 1}`,
    title: String(product.title || "Sem nome").trim(),
    categoryId: categoryIds.has(product.categoryId) ? product.categoryId : categories[0]?.id || "",
    price: Number(product.price) >= 0 ? Number(product.price) : 0,
    compareAtPrice: Number(product.compareAtPrice) > 0 ? Number(product.compareAtPrice) : null,
    sku: String(product.sku || "").trim().slice(0, 80),
    art: ["art-lamp", "art-arch", "art-house", "art-orbit"].includes(product.art) ? product.art : "art-lamp",
    tag: String(product.tag || "Peça especial").slice(0, 40),
    description: String(product.description || "").slice(0, 420),
    material: String(product.material || "PLA impresso em 3D").slice(0, 80),
    productionTime: String(product.productionTime || "Produção em 3 a 5 dias úteis").slice(0, 80),
    availability: String(product.availability || "Sob encomenda").slice(0, 40),
    stock: normaliseStock(product.stock),
    status: ["draft", "published", "archived"].includes(product.status) ? product.status : (product.visible === false ? "draft" : "published"),
    visible: product.status ? product.status === "published" : product.visible !== false,
    featuredRank: Math.max(0, Math.floor(Number(product.featuredRank) || 0)),
    isHero: Boolean(product.isHero),
    photos: Array.isArray(product.photos) ? product.photos.filter(isSupportedPhoto).slice(0, 4) : [],
    shipping: normaliseShipping(product.shipping),
    seoTitle: String(product.seoTitle || "").trim().slice(0, 70),
    seoDescription: String(product.seoDescription || "").trim().slice(0, 160),
    updatedAt: product.updatedAt || new Date().toISOString(),
  })).filter((product) => product.title);
  return { categories, products };
}

function isLegacyDemoCatalog(catalog) {
  const legacyIds = new Set(["lume", "arco", "casinha", "orbita"]);
  return catalog.products.length === legacyIds.size && catalog.products.every((product) => legacyIds.has(product.id));
}

function load() {
  try {
    if (cachedCatalog) return clone(cachedCatalog);
    const raw = storage().getItem(STORAGE_KEY);
    const catalog = normaliseCatalog(raw ? JSON.parse(raw) : defaultCatalog);
    return isLegacyDemoCatalog(catalog) ? clone(defaultCatalog) : catalog;
  } catch {
    return clone(defaultCatalog);
  }
}

function persist(catalog) {
  const normalised = normaliseCatalog(catalog);
  cachedCatalog = normalised;
  storage().setItem(STORAGE_KEY, JSON.stringify(normalised));
  return normalised;
}

function productInput(input, existing = {}) {
  const title = String(input.title || "").trim();
  if (!title) throw new Error("Dê um nome ao produto antes de salvar.");
  const price = Number(String(input.price).replace(",", "."));
  if (!Number.isFinite(price) || price < 0) throw new Error("Informe um preço válido.");
  const compareValue = String(input.compareAtPrice ?? "").trim().replace(",", ".");
  const compareAtPrice = compareValue ? Number(compareValue) : null;
  if (compareAtPrice !== null && (!Number.isFinite(compareAtPrice) || compareAtPrice < price)) throw new Error("O preço anterior deve ser maior ou igual ao preço atual.");
  return {
    ...existing,
    id: existing.id || slug(title) || `produto-${Date.now()}`,
    title,
    categoryId: input.categoryId,
    price,
    compareAtPrice,
    sku: String(input.sku || "").trim().slice(0, 80),
    art: input.art || existing.art || "art-lamp",
    tag: String(input.tag || "Peça especial").trim().slice(0, 40),
    description: String(input.description || "").trim().slice(0, 420),
    material: String(input.material || existing.material || "PLA impresso em 3D").trim().slice(0, 80),
    productionTime: String(input.productionTime || existing.productionTime || "Produção em 3 a 5 dias úteis").trim().slice(0, 80),
    availability: String(input.availability || existing.availability || "Sob encomenda").trim().slice(0, 40),
    stock: normaliseStock(input.stock),
    status: ["draft", "published", "archived"].includes(input.status) ? input.status : (input.visible === false ? "draft" : "published"),
    visible: input.visible !== false,
    featuredRank: Math.max(0, Math.floor(Number(input.featuredRank) || 0)),
    isHero: Boolean(input.isHero),
    photos: Array.isArray(input.photos) ? input.photos.slice(0, 4) : (existing.photos || []),
    shipping: normaliseShipping(input.shipping || existing.shipping),
    seoTitle: String(input.seoTitle || "").trim().slice(0, 70),
    seoDescription: String(input.seoDescription || "").trim().slice(0, 160),
    updatedAt: new Date().toISOString(),
  };
}

function categoryFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    order: row.sort_order,
    showOnNav: row.show_on_nav,
    visible: row.visible,
  };
}

function productFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    categoryId: row.category_id,
    price: Number(row.price_cents || 0) / 100,
    compareAtPrice: row.compare_at_price_cents === null ? null : Number(row.compare_at_price_cents) / 100,
    sku: row.sku || "",
    art: row.art,
    tag: row.tag,
    description: row.description,
    material: row.material,
    productionTime: row.production_time,
    availability: row.availability,
    stock: row.stock,
    status: row.status,
    visible: row.status === "published",
    featuredRank: row.featured_rank,
    isHero: false,
    photos: Array.isArray(row.photos) ? row.photos : [],
    shipping: normaliseShipping(row.shipping),
    seoTitle: row.seo_title || "",
    seoDescription: row.seo_description || "",
    updatedAt: row.updated_at,
  };
}

function campaignFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    eyebrow: row.eyebrow,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    ctaLabel: row.cta_label,
    ctaTargetType: row.cta_target_type,
    ctaTarget: row.cta_target,
    order: row.sort_order,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    updatedAt: row.updated_at,
  };
}

async function remoteCatalog(includeUnpublished = false) {
  const supabase = await getSupabaseClient();
  if (!supabase) return null;
  const [categoriesResult, productsResult] = await Promise.all([
    supabase.from("catalog_categories").select("*").order("sort_order"),
    supabase.from("catalog_products").select("*").order("featured_rank").order("updated_at", { ascending: false }),
  ]);
  if (categoriesResult.error || productsResult.error) throw categoriesResult.error || productsResult.error;
  const catalog = normaliseCatalog({
    categories: (categoriesResult.data || []).map(categoryFromRow),
    products: (productsResult.data || []).map(productFromRow),
  });
  if (!includeUnpublished) {
    catalog.products = catalog.products.filter((product) => product.status === "published");
  }
  return catalog;
}

async function remoteCampaigns(includeUnpublished = false) {
  const supabase = await getSupabaseClient();
  if (!supabase) return [];
  let query = supabase.from("catalog_campaigns").select("*").order("sort_order").order("updated_at", { ascending: false });
  if (!includeUnpublished) query = query.eq("status", "published");
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(campaignFromRow);
}

function productToRow(product, existing = {}) {
  return {
    id: product.id,
    title: product.title,
    category_id: product.categoryId,
    price_cents: Math.round(Number(product.price) * 100),
    compare_at_price_cents: product.compareAtPrice ? Math.round(Number(product.compareAtPrice) * 100) : null,
    sku: product.sku || null,
    tag: product.tag,
    description: product.description,
    material: product.material,
    production_time: product.productionTime,
    availability: product.availability,
    stock: product.stock,
    status: product.status,
    featured_rank: product.featuredRank,
    art: product.art,
    photos: product.photos,
    shipping: product.shipping,
    seo_title: product.seoTitle || null,
    seo_description: product.seoDescription || null,
    published_at: product.status === "published" ? (existing.publishedAt || new Date().toISOString()) : null,
  };
}

export const catalogStore = {
  load,
  async hydrate({ includeUnpublished = false } = {}) {
    if (!hasSupabaseConfig()) return load();
    try {
      const catalog = await remoteCatalog(includeUnpublished);
      if (catalog) {
        cachedCatalog = catalog;
        return load();
      }
    } catch (error) {
      console.warn("Não foi possível carregar o catálogo remoto.", error);
    }
    return load();
  },
  async loadCampaigns({ includeUnpublished = false } = {}) {
    try {
      cachedCampaigns = await remoteCampaigns(includeUnpublished);
    } catch (error) {
      console.warn("Não foi possível carregar as campanhas remotas.", error);
    }
    return clone(cachedCampaigns);
  },
  reset() { cachedCatalog = clone(defaultCatalog); storage().removeItem?.(STORAGE_KEY); return persist(clone(defaultCatalog)); },
  async saveProduct(input) {
    const catalog = load();
    if (!catalog.categories.some((category) => category.id === input.categoryId)) throw new Error("Escolha uma categoria existente.");
    const position = catalog.products.findIndex((product) => product.id === input.id);
    const nextProduct = productInput(input, position >= 0 ? catalog.products[position] : {});
    const supabase = await getSupabaseClient();
    if (supabase) {
      const existing = position >= 0 ? catalog.products[position] : {};
      const { error } = await supabase.from("catalog_products").upsert(productToRow(nextProduct, existing));
      if (error) throw error;
      return this.hydrate({ includeUnpublished: true });
    }
    if (position >= 0) catalog.products[position] = nextProduct;
    else catalog.products.unshift(nextProduct);
    return persist(catalog);
  },
  async deleteProduct(id) {
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { error } = await supabase.from("catalog_products").delete().eq("id", id);
      if (error) throw error;
      return this.hydrate({ includeUnpublished: true });
    }
    const catalog = load();
    const removed = catalog.products.find((product) => product.id === id);
    catalog.products = catalog.products.filter((product) => product.id !== id);
    if (removed?.isHero && catalog.products[0]) catalog.products[0].isHero = true;
    return persist(catalog);
  },
  async saveCategory(input) {
    const catalog = load();
    const name = String(input.name || "").trim();
    if (!name) throw new Error("Dê um nome à categoria antes de salvar.");
    const id = input.id || slug(name) || `categoria-${Date.now()}`;
    const duplicate = catalog.categories.find((category) => category.id === id && category.id !== input.previousId);
    if (duplicate) throw new Error("Já existe uma categoria com esse nome.");
    const next = { id, name, icon: String(input.icon || "✦").slice(0, 3), order: Math.max(1, Number(input.order) || catalog.categories.length + 1), showOnNav: input.showOnNav !== false, visible: input.visible !== false };
    const position = catalog.categories.findIndex((category) => category.id === input.previousId || category.id === input.id);
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { error } = await supabase.from("catalog_categories").upsert({ id: next.id, name: next.name, icon: next.icon, sort_order: next.order, show_on_nav: next.showOnNav, visible: next.visible });
      if (error) throw error;
      if (input.previousId && input.previousId !== next.id) {
        const { error: updateError } = await supabase.from("catalog_products").update({ category_id: next.id }).eq("category_id", input.previousId);
        if (updateError) throw updateError;
        const { error: deleteError } = await supabase.from("catalog_categories").delete().eq("id", input.previousId);
        if (deleteError) throw deleteError;
      }
      return this.hydrate({ includeUnpublished: true });
    }
    if (position >= 0) {
      const previous = catalog.categories[position];
      catalog.categories[position] = next;
      if (previous.id !== next.id) catalog.products.forEach((product) => { if (product.categoryId === previous.id) product.categoryId = next.id; });
    } else catalog.categories.push(next);
    return persist(catalog);
  },
  async deleteCategory(id, replacementCategoryId = "") {
    const catalog = load();
    const productsToMove = catalog.products.filter((product) => product.categoryId === id);
    if (catalog.categories.length <= 1) throw new Error("Mantenha pelo menos uma categoria.");
    if (productsToMove.length && (!replacementCategoryId || replacementCategoryId === id || !catalog.categories.some((category) => category.id === replacementCategoryId))) {
      throw new Error("Escolha uma categoria de destino para as peças antes de remover.");
    }
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { error } = await supabase.rpc("delete_catalog_category", {
        target_id: id,
        replacement_category_id: productsToMove.length ? replacementCategoryId : null,
      });
      if (error) throw error;
      return this.hydrate({ includeUnpublished: true });
    }
    if (productsToMove.length) productsToMove.forEach((product) => { product.categoryId = replacementCategoryId; });
    catalog.categories = catalog.categories.filter((category) => category.id !== id);
    return persist(catalog);
  },
  async saveCampaign(input) {
    const supabase = await getSupabaseClient();
    if (!supabase) throw new Error("Campanhas precisam do Supabase configurado.");
    const startsAt = input.startsAt ? new Date(input.startsAt) : null;
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if ((startsAt && Number.isNaN(startsAt.getTime())) || (endsAt && Number.isNaN(endsAt.getTime()))) throw new Error("Informe uma data de agendamento válida.");
    if (startsAt && endsAt && endsAt <= startsAt) throw new Error("O fim da campanha precisa ser posterior ao início.");
    const payload = {
      ...(input.id ? { id: input.id } : {}),
      name: String(input.name || "").trim(),
      eyebrow: String(input.eyebrow || "").trim(),
      title: String(input.title || "").trim(),
      description: String(input.description || "").trim(),
      image_url: String(input.imageUrl || "").trim(),
      cta_label: String(input.ctaLabel || "Conhecer a coleção").trim(),
      cta_target_type: input.ctaTargetType || "catalog",
      cta_target: String(input.ctaTarget || "#produtos").trim(),
      sort_order: Math.max(0, Number(input.order) || 0),
      status: input.status || "draft",
      starts_at: startsAt?.toISOString() || null,
      ends_at: endsAt?.toISOString() || null,
      published_at: input.status === "published" ? (input.publishedAt || new Date().toISOString()) : null,
    };
    if (!payload.name || !payload.title || !payload.image_url) throw new Error("Nome, título e imagem são obrigatórios para uma campanha.");
    const { error } = await supabase.from("catalog_campaigns").upsert(payload);
    if (error) throw error;
    return this.loadCampaigns({ includeUnpublished: true });
  },
  async deleteCampaign(id) {
    const supabase = await getSupabaseClient();
    if (!supabase) throw new Error("Campanhas precisam do Supabase configurado.");
    const { error } = await supabase.from("catalog_campaigns").delete().eq("id", id);
    if (error) throw error;
    return this.loadCampaigns({ includeUnpublished: true });
  },
};
