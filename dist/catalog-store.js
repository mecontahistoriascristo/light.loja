const STORAGE_KEY = "light-loja-catalog-v1";
let memoryCatalog = "";

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
    art: ["art-lamp", "art-arch", "art-house", "art-orbit"].includes(product.art) ? product.art : "art-lamp",
    tag: String(product.tag || "Peça especial").slice(0, 40),
    description: String(product.description || "").slice(0, 420),
    material: String(product.material || "PLA impresso em 3D").slice(0, 80),
    productionTime: String(product.productionTime || "Produção em 3 a 5 dias úteis").slice(0, 80),
    availability: String(product.availability || "Sob encomenda").slice(0, 40),
    stock: normaliseStock(product.stock),
    visible: product.visible !== false,
    featuredRank: Math.max(0, Math.floor(Number(product.featuredRank) || 0)),
    isHero: Boolean(product.isHero),
    photos: Array.isArray(product.photos) ? product.photos.filter((photo) => typeof photo === "string" && (photo.startsWith("data:image/") || photo.startsWith("./assets/"))).slice(0, 4) : [],
    shipping: normaliseShipping(product.shipping),
    updatedAt: product.updatedAt || new Date().toISOString(),
  })).filter((product) => product.title);
  if (!products.some((product) => product.isHero) && products[0]) products[0].isHero = true;
  if (products.filter((product) => product.isHero).length > 1) {
    let heroFound = false;
    products.forEach((product) => { product.isHero = product.isHero && !heroFound; heroFound ||= product.isHero; });
  }
  return { categories, products };
}

function isLegacyDemoCatalog(catalog) {
  const legacyIds = new Set(["lume", "arco", "casinha", "orbita"]);
  return catalog.products.length === legacyIds.size && catalog.products.every((product) => legacyIds.has(product.id));
}

function load() {
  try {
    const raw = storage().getItem(STORAGE_KEY);
    const catalog = normaliseCatalog(raw ? JSON.parse(raw) : defaultCatalog);
    return isLegacyDemoCatalog(catalog) ? clone(defaultCatalog) : catalog;
  } catch {
    return clone(defaultCatalog);
  }
}

function persist(catalog) {
  const normalised = normaliseCatalog(catalog);
  storage().setItem(STORAGE_KEY, JSON.stringify(normalised));
  return normalised;
}

function productInput(input, existing = {}) {
  const title = String(input.title || "").trim();
  if (!title) throw new Error("Dê um nome ao produto antes de salvar.");
  const price = Number(String(input.price).replace(",", "."));
  if (!Number.isFinite(price) || price < 0) throw new Error("Informe um preço válido.");
  return {
    ...existing,
    id: existing.id || slug(title) || `produto-${Date.now()}`,
    title,
    categoryId: input.categoryId,
    price,
    art: input.art || existing.art || "art-lamp",
    tag: String(input.tag || "Peça especial").trim().slice(0, 40),
    description: String(input.description || "").trim().slice(0, 420),
    material: String(input.material || existing.material || "PLA impresso em 3D").trim().slice(0, 80),
    productionTime: String(input.productionTime || existing.productionTime || "Produção em 3 a 5 dias úteis").trim().slice(0, 80),
    availability: String(input.availability || existing.availability || "Sob encomenda").trim().slice(0, 40),
    stock: normaliseStock(input.stock),
    visible: input.visible !== false,
    featuredRank: Math.max(0, Math.floor(Number(input.featuredRank) || 0)),
    isHero: Boolean(input.isHero),
    photos: Array.isArray(input.photos) ? input.photos.slice(0, 4) : (existing.photos || []),
    shipping: normaliseShipping(input.shipping || existing.shipping),
    updatedAt: new Date().toISOString(),
  };
}

export const catalogStore = {
  load,
  reset() { storage().removeItem?.(STORAGE_KEY); return persist(clone(defaultCatalog)); },
  saveProduct(input) {
    const catalog = load();
    if (!catalog.categories.some((category) => category.id === input.categoryId)) throw new Error("Escolha uma categoria existente.");
    const position = catalog.products.findIndex((product) => product.id === input.id);
    const nextProduct = productInput(input, position >= 0 ? catalog.products[position] : {});
    if (nextProduct.isHero) catalog.products.forEach((product) => { product.isHero = false; });
    if (position >= 0) catalog.products[position] = nextProduct;
    else catalog.products.unshift(nextProduct);
    return persist(catalog);
  },
  deleteProduct(id) {
    const catalog = load();
    const removed = catalog.products.find((product) => product.id === id);
    catalog.products = catalog.products.filter((product) => product.id !== id);
    if (removed?.isHero && catalog.products[0]) catalog.products[0].isHero = true;
    return persist(catalog);
  },
  saveCategory(input) {
    const catalog = load();
    const name = String(input.name || "").trim();
    if (!name) throw new Error("Dê um nome à categoria antes de salvar.");
    const id = input.id || slug(name) || `categoria-${Date.now()}`;
    const duplicate = catalog.categories.find((category) => category.id === id && category.id !== input.previousId);
    if (duplicate) throw new Error("Já existe uma categoria com esse nome.");
    const next = { id, name, icon: String(input.icon || "✦").slice(0, 3), order: Math.max(1, Number(input.order) || catalog.categories.length + 1), showOnNav: input.showOnNav !== false, visible: input.visible !== false };
    const position = catalog.categories.findIndex((category) => category.id === input.previousId || category.id === input.id);
    if (position >= 0) {
      const previous = catalog.categories[position];
      catalog.categories[position] = next;
      if (previous.id !== next.id) catalog.products.forEach((product) => { if (product.categoryId === previous.id) product.categoryId = next.id; });
    } else catalog.categories.push(next);
    return persist(catalog);
  },
  deleteCategory(id) {
    const catalog = load();
    if (catalog.categories.length <= 1) throw new Error("Mantenha pelo menos uma categoria.");
    if (catalog.products.some((product) => product.categoryId === id)) throw new Error("Mova ou edite os produtos desta categoria antes de removê-la.");
    catalog.categories = catalog.categories.filter((category) => category.id !== id);
    return persist(catalog);
  },
};
