import { catalogStore } from "./catalog-store.js?v=20261010-admin-foundation";

const state = { cart: [], favorites: new Set(), query: "", categoryId: "", showNew: false, favoritesMode: false };
const CART_STORAGE_KEY = "light-loja-cart-v1";
const FAVORITES_STORAGE_KEY = "light-loja-favorites-v1";
const grid = document.querySelector("#product-grid");
const searchInput = document.querySelector("#site-search");
const feedback = document.querySelector(".search-feedback");
const resetFilter = document.querySelector(".reset-filter");
const toast = document.querySelector(".toast");
const campaignCarousel = document.querySelector("#campaign-carousel");
const campaignTrack = document.querySelector("#campaign-track");
let campaignSlides = [...document.querySelectorAll("[data-campaign-slide]")];
let campaignDots = [...document.querySelectorAll("[data-carousel-index]")];
const campaignProgress = document.querySelector("#carousel-progress");
const campaignStatus = document.querySelector("#campaign-status");
const campaignPreviousImage = document.querySelector("#carousel-previous-image");
const campaignNextImage = document.querySelector("#carousel-next-image");
const campaignPreviousTitle = document.querySelector("#carousel-previous-title");
const campaignNextTitle = document.querySelector("#carousel-next-title");
const campaignCount = document.querySelector("#carousel-count");
let campaignNames = ["Sagrada Família", "Arco da Estrela", "Presépio Completo", "Vila de Natal"];
const shippingStep = document.querySelector(".shipping-step");
const checkoutStep = document.querySelector(".checkout-step");
const shippingForm = document.querySelector("#shipping-quote-form");
const checkoutForm = document.querySelector("#checkout-form");
const shippingPostalCode = document.querySelector("#shipping-postal-code");
const shippingMessage = document.querySelector(".shipping-message");
const checkoutMessage = document.querySelector(".checkout-message");
const shippingOptions = document.querySelector(".shipping-options");
const shippingSummary = document.querySelector(".shipping-summary");
const shippingEndpoint = typeof window.LIGHT_CONFIG?.shippingQuoteEndpoint === "string" ? window.LIGHT_CONFIG.shippingQuoteEndpoint.trim() : "";
const shippingState = { quotes: [], selectedId: "" };
const productShippingState = new Map();
const productDialog = document.querySelector("#product-dialog");
const productDialogContent = document.querySelector("#product-dialog-content");
const productDetailState = { id: "", photoIndex: 0 };
let toastTimer;
let activeCampaignIndex = 0;
let campaignAutoplayTimer;
let campaignPointerStart;

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
const formatPrice = (value) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hasDiscount = (product) => Number(product?.compareAtPrice) > Number(product?.price);
const productPrice = (product, className = "product-price") => `<span class="${className}">${hasDiscount(product) ? `<s>${formatPrice(product.compareAtPrice)}</s>` : ""}<strong>${formatPrice(product.price)}</strong></span>`;
const sortedCategories = (catalog) => [...catalog.categories].filter((category) => category.visible).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "pt-BR"));
const categoryFor = (catalog, id) => catalog.categories.find((category) => category.id === id);
const stockLimit = (product) => Number.isInteger(product?.stock) ? product.stock : null;
const isSoldOut = (product) => stockLimit(product) === 0;
const availabilityLabel = (product) => isSoldOut(product) ? "Esgotado" : product.availability;
const stockNotice = (product) => {
  const stock = stockLimit(product);
  if (stock === null) return "";
  if (stock === 0) return "<span class=\"stock-note stock-note--sold-out\">Indisponível no momento</span>";
  if (stock <= 3) return `<span class="stock-note stock-note--low">${stock === 1 ? "Última unidade pronta" : `Últimas ${stock} unidades prontas`}</span>`;
  return `<span class="stock-note">${stock === 1 ? "1 unidade pronta" : `${stock} unidades prontas`}</span>`;
};

function cartSubtotal() {
  return state.cart.reduce((total, item) => total + item.price * item.quantity, 0);
}

function selectedShipping() {
  return shippingState.quotes.find((quote) => quote.id === shippingState.selectedId);
}

function persistCart() {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.cart.map((item) => ({ id: item.id, quantity: item.quantity }))));
  } catch { /* The cart remains usable if browser storage is unavailable. */ }
}

function persistFavorites() {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...state.favorites]));
  } catch { /* Favorites remain usable if browser storage is unavailable. */ }
}

function restoreFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || "[]");
    const visibleIds = new Set(catalogStore.load().products.filter((product) => product.visible).map((product) => product.id));
    state.favorites = new Set(Array.isArray(saved) ? saved.filter((id) => typeof id === "string" && visibleIds.has(id)) : []);
  } catch { state.favorites = new Set(); }
}

function restoreCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
    if (!Array.isArray(saved)) return;
    const products = catalogStore.load().products.filter((product) => product.visible);
    state.cart = saved.flatMap((line) => {
      const product = products.find((item) => item.id === line?.id);
      const quantity = Number(line?.quantity);
      const stock = stockLimit(product);
      const maximum = stock === null ? 99 : stock;
      return product && Number.isInteger(quantity) && quantity > 0 && maximum > 0 ? [{ ...product, quantity: Math.min(quantity, maximum) }] : [];
    });
  } catch { state.cart = []; }
}

function syncCartWithCatalog() {
  const products = catalogStore.load().products.filter((product) => product.visible);
  state.cart = state.cart.flatMap((line) => {
    const product = products.find((item) => item.id === line.id);
    const stock = stockLimit(product);
    if (!product || stock === 0) return [];
    const maximum = stock === null ? 99 : stock;
    return [{ ...product, quantity: Math.min(line.quantity, maximum) }];
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function productMedia(product) {
  if (product.photos?.[0]) return `<img class="product-uploaded-image" src="${escapeHtml(product.photos[0])}" alt="Foto de ${escapeHtml(product.title)}" />`;
  return `<div class="product-art ${escapeHtml(product.art)}"><div class="object"></div></div>`;
}

function productCard(product, catalog) {
  const isFavorite = state.favorites.has(product.id);
  const category = categoryFor(catalog, product.categoryId);
  const productShipping = productShippingState.get(product.id);
  const soldOut = isSoldOut(product);
  return `
    <article class="product-card">
      <div class="product-media">
        <button class="product-media-open" type="button" data-view-product="${escapeHtml(product.id)}" aria-label="Ver detalhes de ${escapeHtml(product.title)}">
          ${productMedia(product)}
        </button>
        <span class="product-tag">${escapeHtml(soldOut ? "Esgotado" : product.tag || "Peça especial")}</span>
        <button class="favorite-toggle ${isFavorite ? "is-favorite" : ""}" type="button" data-favorite="${escapeHtml(product.id)}" aria-label="${isFavorite ? "Remover dos" : "Adicionar aos"} favoritos: ${escapeHtml(product.title)}" aria-pressed="${isFavorite}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.9a5.4 5.4 0 0 0-7.6 0L12 6.1l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.5a5.4 5.4 0 0 0 0-7.6Z"></path></svg>
        </button>
      </div>
      <div class="product-info">
        <p class="product-category">${escapeHtml(category?.name || "Coleção Light")}</p>
        <h3 class="product-title"><button type="button" data-view-product="${escapeHtml(product.id)}">${escapeHtml(product.title)}</button></h3>
        <div class="product-bottom">${productPrice(product)}<button class="add-button" type="button" ${soldOut ? "disabled" : `data-add="${escapeHtml(product.id)}"`} aria-label="${soldOut ? `${escapeHtml(product.title)} indisponível` : `Adicionar ${escapeHtml(product.title)} ao carrinho`}" title="${soldOut ? "Indisponível" : "Adicionar ao carrinho"}">${soldOut ? "—" : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 4.5h2l1.7 10.1a2 2 0 0 0 1.9-1.5L20.4 8H7"/><circle cx="9.5" cy="20" r="1"/><circle cx="17" cy="20" r="1"/></svg>`}</button></div>
        <p class="product-production-time">${escapeHtml(product.productionTime)}</p>
        ${stockNotice(product)}
        <button class="product-shipping-toggle" type="button" data-toggle-product-shipping="${escapeHtml(product.id)}" aria-expanded="${Boolean(productShipping?.open)}">Calcular frete</button>
        ${productShipping?.open ? productShippingPanel(product, productShipping) : ""}
      </div>
    </article>`;
}

function productShippingPanel(product, quoteState, variant = "card") {
  const quoteMarkup = quoteState.quotes?.length ? quoteState.quotes.map((quote) => `
    <li><strong>${escapeHtml(quote.carrier)} · ${escapeHtml(quote.service)}</strong><span>${formatDeliveryDays(quote.deliveryDays)} · <b>${formatPrice(quote.priceCents / 100)}</b></span></li>`).join("") : "";
  return `<form class="product-shipping-form product-shipping-form--${variant}" data-product-shipping-form="${escapeHtml(product.id)}">
    <label for="${variant}-shipping-${escapeHtml(product.id)}">CEP de entrega</label>
    <div><input id="${variant}-shipping-${escapeHtml(product.id)}" name="postalCode" inputmode="numeric" autocomplete="postal-code" pattern="[0-9]{5}-?[0-9]{3}" maxlength="9" placeholder="00000-000" value="${escapeHtml(quoteState.postalCode || "")}" required /><button type="submit" ${quoteState.loading ? "disabled" : ""}>${quoteState.loading ? "Calculando…" : "Calcular"}</button></div>
    <p class="product-shipping-message" aria-live="polite">${escapeHtml(quoteState.message || "")}</p>
    ${quoteMarkup ? `<ul class="product-shipping-options">${quoteMarkup}</ul>` : ""}
  </form>`;
}

function productDetailImage(product, photo) {
  return photo ? `<img src="${escapeHtml(photo)}" alt="Foto de ${escapeHtml(product.title)}" />` : productMedia(product);
}

function renderProductDialog() {
  const product = catalogStore.load().products.find((item) => item.id === productDetailState.id && item.visible);
  if (!product) {
    if (productDialog.open) productDialog.close();
    return;
  }
  const photos = product.photos?.length ? product.photos : [""];
  productDetailState.photoIndex = Math.min(productDetailState.photoIndex, photos.length - 1);
  const activePhoto = photos[productDetailState.photoIndex];
  const category = categoryFor(catalogStore.load(), product.categoryId);
  const quoteState = productShippingEntry(product.id);
  const soldOut = isSoldOut(product);
  const thumbnails = photos.map((photo, index) => `<button class="product-dialog__thumbnail ${index === productDetailState.photoIndex ? "is-active" : ""}" type="button" data-detail-photo="${index}" aria-label="Ver foto ${index + 1} de ${escapeHtml(product.title)}" aria-pressed="${index === productDetailState.photoIndex}">${productDetailImage(product, photo)}</button>`).join("");
  productDialogContent.innerHTML = `
    <div class="product-detail">
      <div class="product-detail__gallery">
        <div class="product-detail__image">${productDetailImage(product, activePhoto)}</div>
        <div class="product-dialog__thumbnails" aria-label="Fotos do produto">${thumbnails}</div>
      </div>
      <div class="product-detail__info">
        <p class="eyebrow"><span></span> ${escapeHtml(category?.name || "Coleção Light")}</p>
        <span class="product-detail__tag">${escapeHtml(product.tag || "Peça especial")}</span>
        <h2 id="product-dialog-title">${escapeHtml(product.title)}</h2>
        <p class="product-detail__description">${escapeHtml(product.description)}</p>
        <dl class="product-detail__facts">
          <div><dt>Material</dt><dd>${escapeHtml(product.material)}</dd></div>
          <div><dt>Disponibilidade</dt><dd>${escapeHtml(availabilityLabel(product))}</dd></div>
          <div><dt>Prazo</dt><dd>${escapeHtml(product.productionTime)}</dd></div>
        </dl>
        <div class="product-detail__purchase">${productPrice(product, "product-detail__price")}${soldOut ? `<button class="button button-primary" type="button" disabled>Indisponível</button><span class="stock-note stock-note--sold-out">Esta peça não está disponível para compra agora.</span>` : `<button class="button button-primary" type="button" data-detail-buy-now="${escapeHtml(product.id)}">Comprar agora <span>→</span></button><button class="product-detail__add" type="button" data-detail-add="${escapeHtml(product.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 4.5h2l1.7 10.1a2 2 0 0 0 2 1.7h7.7a2 2 0 0 0 1.9-1.5L20.4 8H7"/><circle cx="9.5" cy="20" r="1"/><circle cx="17" cy="20" r="1"/></svg>Adicionar ao carrinho</button>`}<button class="product-detail__share" type="button" data-share-product="${escapeHtml(product.id)}">↗ Compartilhar</button></div>
        <div class="product-detail__shipping"><p>Calcule a entrega para a sua região.</p>${productShippingPanel(product, quoteState, "detail")}</div>
      </div>
    </div>`;
}

function productUrl(id = "") {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("produto", id);
  else url.searchParams.delete("produto");
  return url.toString();
}

function productIdFromUrl() {
  return new URL(window.location.href).searchParams.get("produto") || "";
}
function categoryIdFromUrl() {
  return new URL(window.location.href).searchParams.get("categoria") || "";
}

function openProductDialog(id, { updateUrl = true } = {}) {
  const product = catalogStore.load().products.find((item) => item.id === id && item.visible);
  if (!product) return;
  productDetailState.id = id;
  productDetailState.photoIndex = 0;
  renderProductDialog();
  if (!productDialog.open) productDialog.showModal();
  if (updateUrl && productIdFromUrl() !== id) history.pushState({ productId: id }, "", productUrl(id));
}

function closeProductDialog({ updateUrl = true } = {}) {
  if (productDialog.open) productDialog.close();
  productDetailState.id = "";
  if (updateUrl && productIdFromUrl()) history.pushState({}, "", productUrl());
}

async function shareProduct(id) {
  const product = catalogStore.load().products.find((item) => item.id === id && item.visible);
  if (!product) return;
  const url = productUrl(product.id);
  const shareData = { title: `${product.title} · Light.loja`, text: `Olha esta peça da Light.loja: ${product.title}.`, url };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      showToast("Link do produto copiado.");
      return;
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
  }
  showToast("Não foi possível abrir o compartilhamento neste navegador.");
}

function filteredProducts(catalog) {
  const term = state.query.trim().toLocaleLowerCase("pt-BR");
  return catalog.products.filter((product) => {
    if (!product.visible) return false;
    if (state.categoryId && product.categoryId !== state.categoryId) return false;
    if (state.showNew && product.tag.toLocaleLowerCase("pt-BR") !== "novidade") return false;
    if (state.favoritesMode && !state.favorites.has(product.id)) return false;
    const category = categoryFor(catalog, product.categoryId)?.name || "";
    const haystack = [product.title, category, product.tag, product.description].join(" ").toLocaleLowerCase("pt-BR");
    return !term || haystack.includes(term);
  }).sort((first, second) => {
    const firstRank = first.featuredRank || 9999;
    const secondRank = second.featuredRank || 9999;
    if (firstRank !== secondRank) return firstRank - secondRank;
    return new Date(second.updatedAt) - new Date(first.updatedAt);
  });
}

function renderNavigation(catalog) {
  const nav = document.querySelector("#category-nav");
  const categories = sortedCategories(catalog).filter((category) => category.showOnNav);
  nav.innerHTML = `<a href="#produtos" data-category="new">Novidades</a>${categories.map((category) => `<a href="#produtos" data-category="${escapeHtml(category.id)}">${escapeHtml(category.name)}</a>`).join("")}`;
}

function renderCategories(catalog) {
  const categories = sortedCategories(catalog);
  const all = [{ id: "new", name: "Novidades", icon: "☼" }, ...categories];
  document.querySelector("#category-grid").innerHTML = all.map((category) => `<button class="category-card ${(state.showNew && category.id === "new") || state.categoryId === category.id ? "is-active" : ""}" type="button" data-category="${escapeHtml(category.id)}" role="listitem"><span class="category-icon">${escapeHtml(category.icon)}</span><span>${escapeHtml(category.name)}</span></button>`).join("");
}

function renderCampaign(index, announce = false) {
  if (!campaignTrack || !campaignSlides.length) return;
  activeCampaignIndex = (index + campaignSlides.length) % campaignSlides.length;
  const firstSlide = campaignSlides[0];
  const offset = firstSlide.getBoundingClientRect().width * activeCampaignIndex;
  campaignTrack.style.transform = `translate3d(${-offset}px, 0, 0)`;

  campaignSlides.forEach((slide, slideIndex) => {
    const isActive = slideIndex === activeCampaignIndex;
    slide.classList.toggle("is-active", isActive);
    slide.setAttribute("aria-hidden", String(!isActive));
    slide.inert = !isActive;
  });
  campaignDots.forEach((dot, dotIndex) => {
    const isActive = dotIndex === activeCampaignIndex;
    dot.classList.toggle("is-active", isActive);
    dot.toggleAttribute("aria-current", isActive);
  });
  if (campaignProgress) campaignProgress.style.transform = `translateX(${activeCampaignIndex * 100}%)`;
  if (campaignCount) campaignCount.innerHTML = `${String(activeCampaignIndex + 1).padStart(2, "0")} <small>/ ${String(campaignSlides.length).padStart(2, "0")}</small>`;

  const previousIndex = (activeCampaignIndex - 1 + campaignSlides.length) % campaignSlides.length;
  const nextIndex = (activeCampaignIndex + 1) % campaignSlides.length;
  const previousImage = campaignSlides[previousIndex].querySelector(".hero-visual img");
  const nextImage = campaignSlides[nextIndex].querySelector(".hero-visual img");
  if (campaignPreviousImage && previousImage) campaignPreviousImage.src = previousImage.currentSrc || previousImage.src;
  if (campaignNextImage && nextImage) campaignNextImage.src = nextImage.currentSrc || nextImage.src;
  if (campaignPreviousTitle) campaignPreviousTitle.textContent = campaignNames[previousIndex];
  if (campaignNextTitle) campaignNextTitle.textContent = campaignNames[nextIndex];
  document.querySelector("[data-carousel-previous]")?.setAttribute("aria-label", `Ver campanha anterior: ${campaignNames[previousIndex]}`);
  document.querySelector("[data-carousel-next]")?.setAttribute("aria-label", `Ver próxima campanha: ${campaignNames[nextIndex]}`);
  if (announce && campaignStatus) campaignStatus.textContent = `Campanha ${activeCampaignIndex + 1} de ${campaignSlides.length}: ${campaignNames[activeCampaignIndex]}.`;
}

function stopCampaignAutoplay() {
  clearInterval(campaignAutoplayTimer);
}

function startCampaignAutoplay() {
  if (!campaignCarousel || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  stopCampaignAutoplay();
  campaignAutoplayTimer = window.setInterval(() => renderCampaign(activeCampaignIndex + 1), 6200);
}

function moveCampaign(direction) {
  renderCampaign(activeCampaignIndex + direction, true);
  startCampaignAutoplay();
}

function selectCampaign(index) {
  renderCampaign(index, true);
  startCampaignAutoplay();
}

function campaignAction(campaign) {
  const label = escapeHtml(campaign.ctaLabel || "Conhecer a coleção");
  if (campaign.ctaTargetType === "category") return `<a class="button button-primary" href="?categoria=${encodeURIComponent(campaign.ctaTarget)}#produtos" data-campaign-category="${escapeHtml(campaign.ctaTarget)}">${label} <span>→</span></a>`;
  if (campaign.ctaTargetType === "product") return `<button class="button button-primary" type="button" data-view-product="${escapeHtml(campaign.ctaTarget)}">${label} <span>→</span></button>`;
  if (campaign.ctaTargetType === "url") return `<a class="button button-primary" href="${escapeHtml(campaign.ctaTarget)}" target="_blank" rel="noreferrer">${label} <span>↗</span></a>`;
  return `<a class="button button-primary" href="#produtos">${label} <span>→</span></a>`;
}

function renderRemoteCampaigns(campaigns) {
  if (!campaigns.length || !campaignTrack) return;
  stopCampaignAutoplay();
  campaignTrack.innerHTML = campaigns.map((campaign, index) => `<article class="campaign-slide ${index === 0 ? "is-active" : ""}" data-campaign-slide aria-hidden="${index === 0 ? "false" : "true"}" ${index === 0 ? "" : "inert"}><div class="hero-copy"><p class="eyebrow"><span></span> ${escapeHtml(campaign.eyebrow)}</p>${index === 0 ? `<h1>${escapeHtml(campaign.title)}</h1>` : `<h2 class="campaign-title">${escapeHtml(campaign.title)}</h2>`}<p class="hero-text">${escapeHtml(campaign.description)}</p><div class="hero-actions">${campaignAction(campaign)}<a class="text-link" href="#processo">Como são feitas <span>↗</span></a></div></div><div class="hero-visual"><img src="${escapeHtml(campaign.imageUrl)}" alt="${escapeHtml(campaign.name)}" ${index === 0 ? "fetchpriority=\"high\"" : "loading=\"lazy\""} /><div class="hero-stamp" aria-hidden="true"><span>feito<br />com<br />luz</span></div></div></article>`).join("");
  const pagination = document.querySelector(".carousel-pagination");
  if (pagination) pagination.innerHTML = campaigns.map((campaign, index) => `<button class="carousel-dot ${index === 0 ? "is-active" : ""}" type="button" data-carousel-index="${index}" aria-label="Ver campanha ${index + 1}: ${escapeHtml(campaign.name)}" ${index === 0 ? "aria-current=\"true\"" : ""}></button>`).join("");
  campaignSlides = [...document.querySelectorAll("[data-campaign-slide]")];
  campaignDots = [...document.querySelectorAll("[data-carousel-index]")];
  campaignNames = campaigns.map((campaign) => campaign.name);
  activeCampaignIndex = 0;
  renderCampaign(0);
  startCampaignAutoplay();
}

document.querySelector("[data-carousel-previous]")?.addEventListener("click", (event) => {
  event.stopPropagation();
  moveCampaign(-1);
});

document.querySelector("[data-carousel-next]")?.addEventListener("click", (event) => {
  event.stopPropagation();
  moveCampaign(1);
});

campaignDots.forEach((dot) => {
  dot.addEventListener("click", (event) => {
    event.stopPropagation();
    selectCampaign(Number(dot.dataset.carouselIndex));
  });
});

function renderProducts(catalog) {
  const result = filteredProducts(catalog);
  grid.innerHTML = result.length ? result.map((product) => productCard(product, catalog)).join("") : `<div class="empty-results"><strong>Nenhuma peça encontrada.</strong><br />Tente outra busca ou publique um novo produto no catálogo.</div>`;
  let context = "";
  if (state.favoritesMode) context = "nos seus favoritos";
  else if (state.showNew) context = "em novidades";
  else if (state.categoryId) context = `em ${categoryFor(catalog, state.categoryId)?.name || "sua categoria"}`;
  else if (state.query) context = `para “${state.query}”`;
  feedback.textContent = context ? `${result.length} peça${result.length === 1 ? "" : "s"} encontrada${result.length === 1 ? "" : "s"} ${context}.` : "Coleção de Natal da Light.";
  resetFilter.hidden = !state.categoryId && !state.query && !state.showNew && !state.favoritesMode;
}

function renderAll() {
  const catalog = catalogStore.load();
  renderNavigation(catalog);
  renderCategories(catalog);
  renderProducts(catalog);
  updateCounts();
}

function updateCounts() {
  const cartItems = state.cart.reduce((total, item) => total + item.quantity, 0);
  document.querySelectorAll(".cart-count").forEach((counter) => { counter.textContent = cartItems; counter.dataset.empty = String(cartItems === 0); counter.setAttribute("aria-label", `${cartItems} itens no carrinho`); });
  document.querySelectorAll(".favorites-count").forEach((counter) => { counter.textContent = state.favorites.size; counter.dataset.empty = String(state.favorites.size === 0); counter.setAttribute("aria-label", `${state.favorites.size} favoritos`); });
}

function renderCart() {
  const catalog = catalogStore.load();
  const itemsArea = document.querySelector(".cart-items");
  const empty = document.querySelector(".empty-cart");
  itemsArea.innerHTML = state.cart.map((item) => {
    const currentProduct = catalog.products.find((product) => product.id === item.id) || item;
    const stock = stockLimit(currentProduct);
    const atLimit = stock !== null && item.quantity >= stock;
    return `
    <div class="cart-item">
      <div class="cart-item-thumb">${productMedia(item)}</div>
      <div class="cart-item-info"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(categoryFor(catalog, item.categoryId)?.name || "Coleção Light")}</p><div class="quantity-control" aria-label="Quantidade de ${escapeHtml(item.title)}"><button type="button" data-decrease="${escapeHtml(item.id)}" aria-label="Diminuir quantidade de ${escapeHtml(item.title)}">−</button><span>${item.quantity}</span><button type="button" ${atLimit ? "disabled" : `data-increase="${escapeHtml(item.id)}"`} aria-label="Aumentar quantidade de ${escapeHtml(item.title)}">+</button></div>${atLimit && stock !== null ? `<span class="cart-stock-message">${stock === 1 ? "Última unidade disponível" : "Limite disponível atingido"}</span>` : ""}<span class="cart-item-price">${formatPrice(item.price * item.quantity)}</span></div>
      <button class="remove-item" data-remove="${escapeHtml(item.id)}" type="button" aria-label="Remover ${escapeHtml(item.title)}">×</button>
    </div>`;
  }).join("");
  empty.classList.toggle("is-visible", state.cart.length === 0);
  renderOrderTotals();
  updateCounts();
}

function renderOrderTotals() {
  const subtotal = cartSubtotal();
  const delivery = selectedShipping();
  const deliveryPrice = delivery ? delivery.priceCents / 100 : 0;
  const total = subtotal + deliveryPrice;
  document.querySelector(".cart-subtotal").textContent = formatPrice(subtotal);
  document.querySelector(".cart-shipping").textContent = delivery ? formatPrice(deliveryPrice) : "Calcular frete";
  document.querySelector(".cart-total").textContent = formatPrice(total);
  document.querySelector(".shipping-summary-subtotal").textContent = formatPrice(subtotal);
  document.querySelector(".shipping-summary-delivery").textContent = formatPrice(deliveryPrice);
  document.querySelector(".shipping-summary-total-value").textContent = formatPrice(total);
  document.querySelector(".checkout-subtotal").textContent = formatPrice(subtotal);
  document.querySelector(".checkout-delivery").textContent = formatPrice(deliveryPrice);
  document.querySelector(".checkout-total").textContent = formatPrice(total);
  shippingSummary.hidden = !delivery;
}

function renderCheckoutOrder() {
  const items = document.querySelector(".checkout-order-items");
  items.innerHTML = state.cart.map((item) => `<div><span>${escapeHtml(item.title)} × ${item.quantity}</span><strong>${formatPrice(item.price * item.quantity)}</strong></div>`).join("");
  renderOrderTotals();
}

function changeCartQuantity(id, difference) {
  const item = state.cart.find((line) => line.id === id);
  if (!item) return;
  const product = catalogStore.load().products.find((entry) => entry.id === id && entry.visible);
  if (!product) {
    state.cart = state.cart.filter((line) => line.id !== id);
    resetShippingQuote();
    persistCart();
    renderCart();
    return showToast("Esta peça não está mais disponível.");
  }
  const stock = stockLimit(product);
  const maximum = stock === null ? 99 : stock;
  item.quantity = Math.max(0, Math.min(maximum, item.quantity + difference));
  if (item.quantity === 0) state.cart = state.cart.filter((line) => line.id !== id);
  resetShippingQuote();
  persistCart();
  renderCart();
}

function addToCart(id) {
  const product = catalogStore.load().products.find((item) => item.id === id && item.visible);
  if (!product) return showToast("Esta peça não está mais disponível.");
  const existing = state.cart.find((item) => item.id === id);
  const stock = stockLimit(product);
  if (stock === 0) return showToast("Esta peça está esgotada no momento.");
  if (existing && stock !== null && existing.quantity >= stock) return showToast(`Você atingiu o limite disponível de ${product.title}.`);
  if (existing) existing.quantity += 1;
  else state.cart.push({ ...product, quantity: 1 });
  resetShippingQuote();
  persistCart();
  renderCart();
  showToast(`${product.title} foi para o carrinho.`);
}

function toggleFavorite(id) {
  const product = catalogStore.load().products.find((item) => item.id === id);
  if (!product) return;
  if (state.favorites.has(id)) { state.favorites.delete(id); showToast(`${product.title} saiu dos favoritos.`); }
  else { state.favorites.add(id); showToast(`${product.title} entrou nos favoritos.`); }
  persistFavorites();
  renderAll();
}

function setCategory(id) {
  state.categoryId = id === "new" ? "" : id;
  state.showNew = id === "new";
  state.favoritesMode = false;
  state.query = "";
  searchInput.value = "";
  renderAll();
  document.querySelector("#produtos").scrollIntoView({ behavior: "smooth", block: "start" });
}

function openCart() {
  const drawer = document.querySelector(".cart-drawer");
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  document.querySelector(".drawer-backdrop").hidden = false;
  document.body.style.overflow = "hidden";
  drawer.querySelector(".close-drawer").focus();
}

function closeCart() {
  const drawer = document.querySelector(".cart-drawer");
  drawer.classList.remove("is-shipping");
  drawer.classList.remove("is-checkout");
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  shippingStep.hidden = true;
  checkoutStep.hidden = true;
  document.querySelector(".drawer-backdrop").hidden = true;
  document.body.style.overflow = "";
}

function formatPostalCode(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function formatDeliveryDays(days) {
  if (!Number.isFinite(days)) return "Prazo informado pela transportadora";
  return days === 0 ? "Entrega no mesmo dia" : `${days} dia${days === 1 ? " útil" : "s úteis"}`;
}

function resetShippingQuote() {
  shippingState.quotes = [];
  shippingState.selectedId = "";
  shippingOptions.innerHTML = "";
  shippingMessage.textContent = "";
  shippingSummary.hidden = true;
  renderOrderTotals();
}

function renderShippingQuotes() {
  if (!shippingState.quotes.length) {
    shippingOptions.innerHTML = "";
    shippingSummary.hidden = true;
    return;
  }
  shippingOptions.innerHTML = shippingState.quotes.map((quote) => `
    <button class="shipping-option ${shippingState.selectedId === quote.id ? "is-selected" : ""}" type="button" data-select-shipping="${escapeHtml(quote.id)}" aria-pressed="${shippingState.selectedId === quote.id}">
      <strong>${escapeHtml(quote.carrier)} · ${escapeHtml(quote.service)}</strong>
      <span>${formatDeliveryDays(quote.deliveryDays)}</span>
      <b>${formatPrice(quote.priceCents / 100)}</b>
    </button>`).join("");
  renderOrderTotals();
}

function openShipping() {
  if (!state.cart.length) return showToast("Adicione uma peça antes de calcular a entrega.");
  const drawer = document.querySelector(".cart-drawer");
  drawer.classList.remove("is-checkout");
  drawer.classList.add("is-shipping");
  shippingStep.hidden = false;
  checkoutStep.hidden = true;
  shippingMessage.textContent = shippingEndpoint ? "" : "A cotação será ativada assim que o endereço seguro da SuperFrete for configurado.";
  window.setTimeout(() => shippingPostalCode.focus(), 0);
}

function returnToCart() {
  const drawer = document.querySelector(".cart-drawer");
  drawer.classList.remove("is-shipping");
  drawer.classList.remove("is-checkout");
  shippingStep.hidden = true;
  checkoutStep.hidden = true;
  document.querySelector(".checkout-button").focus();
}

function openCheckout() {
  if (!selectedShipping()) return showToast("Escolha uma modalidade de entrega antes de continuar.");
  const drawer = document.querySelector(".cart-drawer");
  drawer.classList.remove("is-shipping");
  drawer.classList.add("is-checkout");
  shippingStep.hidden = true;
  checkoutStep.hidden = false;
  checkoutMessage.textContent = "";
  renderCheckoutOrder();
  window.setTimeout(() => checkoutForm.elements.fullName.focus(), 0);
}

function returnToShipping() {
  const drawer = document.querySelector(".cart-drawer");
  drawer.classList.remove("is-checkout");
  drawer.classList.add("is-shipping");
  checkoutStep.hidden = true;
  shippingStep.hidden = false;
  window.setTimeout(() => shippingPostalCode.focus(), 0);
}

async function requestShippingQuote() {
  const destinationPostalCode = shippingPostalCode.value.replace(/\D/g, "");
  if (destinationPostalCode.length !== 8) {
    shippingMessage.textContent = "Informe um CEP com oito números.";
    shippingPostalCode.focus();
    return;
  }
  if (!shippingEndpoint) {
    shippingMessage.textContent = "A cotação ainda não está conectada ao ambiente seguro da SuperFrete.";
    return;
  }

  const submit = shippingForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  shippingState.quotes = [];
  shippingState.selectedId = "";
  shippingMessage.textContent = "Consultando opções de entrega…";
  shippingOptions.innerHTML = "";
  renderOrderTotals();
  try {
    const response = await fetch(shippingEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        destinationPostalCode,
        items: state.cart.map((item) => ({ id: item.id, quantity: item.quantity, shipping: item.shipping })),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "Não foi possível calcular o frete agora.");
    shippingState.quotes = Array.isArray(result.quotes) ? result.quotes : [];
    shippingState.selectedId = "";
    if (!shippingState.quotes.length) {
      shippingMessage.textContent = "Nenhuma modalidade foi encontrada para este CEP. Tente outro CEP ou fale com a gente.";
      return;
    }
    shippingMessage.textContent = "Escolha a modalidade que prefere.";
    renderShippingQuotes();
  } catch (error) {
    shippingMessage.textContent = error instanceof Error ? error.message : "Não foi possível calcular o frete agora.";
  } finally {
    submit.disabled = false;
  }
}

function productShippingEntry(id) {
  if (!productShippingState.has(id)) productShippingState.set(id, { open: false, postalCode: "", quotes: [], message: "", loading: false });
  return productShippingState.get(id);
}

function toggleProductShipping(id) {
  const entry = productShippingEntry(id);
  entry.open = !entry.open;
  renderProducts(catalogStore.load());
  if (entry.open) window.setTimeout(() => document.querySelector(`#product-shipping-${CSS.escape(id)}`)?.focus(), 0);
}

function renderProductViews(id) {
  renderProducts(catalogStore.load());
  if (productDialog.open && productDetailState.id === id) renderProductDialog();
}

async function requestProductShippingQuote(form) {
  const id = form.dataset.productShippingForm;
  const product = catalogStore.load().products.find((item) => item.id === id && item.visible);
  if (!product) return;

  const entry = productShippingEntry(id);
  const postalCode = form.elements.postalCode.value.replace(/\D/g, "");
  entry.postalCode = formatPostalCode(postalCode);
  entry.quotes = [];
  if (postalCode.length !== 8) {
    entry.message = "Informe um CEP com oito números.";
    renderProductViews(id);
    return;
  }
  if (!shippingEndpoint) {
    entry.message = "A cotação ainda não está disponível.";
    renderProductViews(id);
    return;
  }

  entry.loading = true;
  entry.message = "Consultando opções…";
  renderProductViews(id);
  try {
    const response = await fetch(shippingEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ destinationPostalCode: postalCode, items: [{ id: product.id, quantity: 1, shipping: product.shipping }] }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "Não foi possível calcular o frete agora.");
    entry.quotes = Array.isArray(result.quotes) ? result.quotes : [];
    entry.message = entry.quotes.length ? "Opções para uma unidade deste produto:" : "Nenhuma modalidade foi encontrada para este CEP.";
  } catch (error) {
    entry.message = error instanceof Error ? error.message : "Não foi possível calcular o frete agora.";
  } finally {
    entry.loading = false;
    renderProductViews(id);
  }
}

document.addEventListener("click", (event) => {
  const previousCampaign = event.target.closest("[data-carousel-previous]");
  const nextCampaign = event.target.closest("[data-carousel-next]");
  const campaignDot = event.target.closest("[data-carousel-index]");
  const campaignCategory = event.target.closest("[data-campaign-category]");
  const add = event.target.closest("[data-add]");
  const favorite = event.target.closest("[data-favorite]");
  const category = event.target.closest("[data-category]");
  const remove = event.target.closest("[data-remove]");
  const selectedShipping = event.target.closest("[data-select-shipping]");
  const increase = event.target.closest("[data-increase]");
  const decrease = event.target.closest("[data-decrease]");
  const productShippingToggle = event.target.closest("[data-toggle-product-shipping]");
  const viewProduct = event.target.closest("[data-view-product]");
  const detailPhoto = event.target.closest("[data-detail-photo]");
  const detailAdd = event.target.closest("[data-detail-add]");
  const detailBuyNow = event.target.closest("[data-detail-buy-now]");
  const shareProductButton = event.target.closest("[data-share-product]");
  if (event.target.closest("[data-close-product-dialog]")) { closeProductDialog(); return; }
  if (viewProduct) { openProductDialog(viewProduct.dataset.viewProduct); return; }
  if (detailPhoto) {
    productDetailState.photoIndex = Number(detailPhoto.dataset.detailPhoto);
    renderProductDialog();
    return;
  }
  if (detailAdd) { addToCart(detailAdd.dataset.detailAdd); return; }
  if (detailBuyNow) { addToCart(detailBuyNow.dataset.detailBuyNow); closeProductDialog(); openCart(); return; }
  if (shareProductButton) { shareProduct(shareProductButton.dataset.shareProduct); return; }
  if (previousCampaign) { moveCampaign(-1); return; }
  if (nextCampaign) { moveCampaign(1); return; }
  if (campaignDot) { selectCampaign(Number(campaignDot.dataset.carouselIndex)); return; }
  if (campaignCategory) { event.preventDefault(); setCategory(campaignCategory.dataset.campaignCategory); return; }
  if (productShippingToggle) { toggleProductShipping(productShippingToggle.dataset.toggleProductShipping); return; }
  if (increase) { changeCartQuantity(increase.dataset.increase, 1); return; }
  if (decrease) { changeCartQuantity(decrease.dataset.decrease, -1); return; }
  if (add) addToCart(add.dataset.add);
  if (favorite) toggleFavorite(favorite.dataset.favorite);
  if (category && (category.tagName === "BUTTON" || category.tagName === "A")) { event.preventDefault(); setCategory(category.dataset.category); }
  if (remove) { state.cart = state.cart.filter((item) => item.id !== remove.dataset.remove); resetShippingQuote(); persistCart(); renderCart(); }
  if (event.target.closest("[data-open-cart]")) openCart();
  if (event.target.closest("[data-close-cart], .close-drawer, .drawer-backdrop")) closeCart();
  if (event.target.closest(".checkout-button")) openShipping();
  if (event.target.closest("[data-open-checkout]")) { openCheckout(); return; }
  if (event.target.closest("[data-back-to-cart]")) returnToCart();
  if (event.target.closest("[data-back-to-shipping]")) { returnToShipping(); return; }
  if (selectedShipping) {
    shippingState.selectedId = selectedShipping.dataset.selectShipping;
    const selected = shippingState.quotes.find((quote) => quote.id === shippingState.selectedId);
    shippingMessage.textContent = selected ? `${selected.carrier} · ${selected.service} selecionado. Revise o total abaixo.` : "";
    renderShippingQuotes();
  }
  if (event.target.closest("[data-show-favorites]")) {
    if (state.favorites.size === 0) showToast("Você ainda não salvou nenhuma peça.");
    else { state.categoryId = ""; state.showNew = false; state.query = ""; state.favoritesMode = true; searchInput.value = ""; renderAll(); document.querySelector("#produtos").scrollIntoView({ behavior: "smooth" }); }
  }
  if (event.target.closest(".reset-filter")) { state.categoryId = ""; state.showNew = false; state.query = ""; state.favoritesMode = false; searchInput.value = ""; renderAll(); }
  if (event.target.closest(".main-navigation a")) { document.querySelector(".main-navigation").classList.remove("is-open"); menuToggle.classList.remove("is-open"); menuToggle.setAttribute("aria-expanded", "false"); }
});

document.querySelector("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  state.query = searchInput.value;
  state.categoryId = "";
  state.showNew = false;
  state.favoritesMode = false;
  renderAll();
  document.querySelector("#produtos").scrollIntoView({ behavior: "smooth", block: "start" });
});

document.querySelector("#newsletter-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const email = document.querySelector("#newsletter-email");
  showToast(`Obrigada! Vamos escrever para ${email.value}.`);
  event.currentTarget.reset();
});

shippingPostalCode.addEventListener("input", () => {
  shippingPostalCode.value = formatPostalCode(shippingPostalCode.value);
});

document.addEventListener("input", (event) => {
  const input = event.target.closest("[data-product-shipping-form] input[name='postalCode']");
  if (!input) return;
  input.value = formatPostalCode(input.value);
  const entry = productShippingEntry(input.closest("[data-product-shipping-form]").dataset.productShippingForm);
  entry.postalCode = input.value;
  entry.quotes = [];
  entry.message = "";
});

document.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-product-shipping-form]");
  if (!form) return;
  event.preventDefault();
  requestProductShippingQuote(form);
});

productDialog.addEventListener("click", (event) => {
  if (event.target === productDialog) closeProductDialog();
});
productDialog.addEventListener("close", () => {
  productDetailState.id = "";
  if (productIdFromUrl()) history.replaceState({}, "", productUrl());
});

window.addEventListener("popstate", () => {
  const id = productIdFromUrl();
  if (id) openProductDialog(id, { updateUrl: false });
  else if (productDialog.open) closeProductDialog({ updateUrl: false });
});

shippingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  requestShippingQuote();
});

checkoutForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!checkoutForm.reportValidity()) return;
  checkoutMessage.textContent = "Dados validados. O pagamento será liberado quando conectarmos o provedor seguro.";
});

const menuToggle = document.querySelector(".menu-toggle");
menuToggle.addEventListener("click", () => {
  const nav = document.querySelector(".main-navigation");
  const isOpen = nav.classList.toggle("is-open");
  menuToggle.classList.toggle("is-open", isOpen);
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});

window.addEventListener("storage", (event) => {
  if (event.key !== "light-loja-catalog-v1") return;
  syncCartWithCatalog();
  resetShippingQuote();
  persistCart();
  renderAll();
  renderCart();
});

if (campaignCarousel) {
  campaignCarousel.addEventListener("mouseenter", stopCampaignAutoplay);
  campaignCarousel.addEventListener("mouseleave", startCampaignAutoplay);
  campaignCarousel.addEventListener("focusin", stopCampaignAutoplay);
  campaignCarousel.addEventListener("focusout", () => {
    window.setTimeout(() => {
      if (!campaignCarousel.matches(":focus-within")) startCampaignAutoplay();
    });
  });
  const startCampaignSwipe = (clientX, clientY, pointerId) => {
    campaignPointerStart = { clientX, clientY, pointerId };
    stopCampaignAutoplay();
  };
  const finishCampaignSwipe = (clientX, clientY, pointerId) => {
    if (!campaignPointerStart || (pointerId !== undefined && campaignPointerStart.pointerId !== pointerId)) return;
    const horizontalDistance = clientX - campaignPointerStart.clientX;
    const verticalDistance = clientY - campaignPointerStart.clientY;
    campaignPointerStart = undefined;
    if (Math.abs(horizontalDistance) > 45 && Math.abs(horizontalDistance) > Math.abs(verticalDistance)) moveCampaign(horizontalDistance > 0 ? -1 : 1);
    else startCampaignAutoplay();
  };

  if (window.PointerEvent) {
    campaignCarousel.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary) return;
      if (event.target.closest("button, a, input, select, textarea")) return;
      startCampaignSwipe(event.clientX, event.clientY, event.pointerId);
      campaignCarousel.setPointerCapture?.(event.pointerId);
    });
    campaignCarousel.addEventListener("pointerup", (event) => finishCampaignSwipe(event.clientX, event.clientY, event.pointerId));
    campaignCarousel.addEventListener("pointercancel", () => { campaignPointerStart = undefined; startCampaignAutoplay(); });
  } else {
    campaignCarousel.addEventListener("touchstart", (event) => {
      const touch = event.touches[0];
      if (touch) startCampaignSwipe(touch.clientX, touch.clientY);
    }, { passive: true });
    campaignCarousel.addEventListener("touchend", (event) => {
      const touch = event.changedTouches[0];
      if (touch) finishCampaignSwipe(touch.clientX, touch.clientY);
    }, { passive: true });
    campaignCarousel.addEventListener("touchcancel", () => { campaignPointerStart = undefined; startCampaignAutoplay(); }, { passive: true });
  }
  campaignCarousel.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") { event.preventDefault(); moveCampaign(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); moveCampaign(1); }
  });
  window.addEventListener("resize", () => renderCampaign(activeCampaignIndex));
}

restoreCart();
restoreFavorites();
renderAll();
renderCart();
renderCampaign(0);
startCampaignAutoplay();
const sharedProductId = productIdFromUrl();
if (sharedProductId) openProductDialog(sharedProductId, { updateUrl: false });

async function hydrateStorefront() {
  const catalog = await catalogStore.hydrate();
  const sharedCategoryId = categoryIdFromUrl();
  if (sharedCategoryId && catalog.categories.some((category) => category.id === sharedCategoryId && category.visible)) {
    state.categoryId = sharedCategoryId;
    state.showNew = false;
    state.favoritesMode = false;
  }
  renderAll();
  const campaigns = await catalogStore.loadCampaigns();
  renderRemoteCampaigns(campaigns);
}

hydrateStorefront();
