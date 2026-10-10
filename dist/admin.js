import { catalogStore } from "./catalog-store.js?v=20261010-conversion";

const refs = {
  productForm: document.querySelector("#product-form"),
  productId: document.querySelector("#product-id"),
  productTitle: document.querySelector("#product-title"),
  productCategory: document.querySelector("#product-category"),
  productPrice: document.querySelector("#product-price"),
  productTag: document.querySelector("#product-tag"),
  productMaterial: document.querySelector("#product-material"),
  productProductionTime: document.querySelector("#product-production-time"),
  productAvailability: document.querySelector("#product-availability"),
  productStock: document.querySelector("#product-stock"),
  productFeatured: document.querySelector("#product-featured"),
  productWeight: document.querySelector("#product-weight"),
  productHeight: document.querySelector("#product-height"),
  productWidth: document.querySelector("#product-width"),
  productLength: document.querySelector("#product-length"),
  productDescription: document.querySelector("#product-description"),
  productArt: document.querySelector("#product-art"),
  productPhotos: document.querySelector("#product-photos"),
  productVisible: document.querySelector("#product-visible"),
  productHero: document.querySelector("#product-hero"),
  photoPreview: document.querySelector("#photo-preview"),
  productHeading: document.querySelector("#product-form-title"),
  productMessage: document.querySelector("#product-message"),
  categoryForm: document.querySelector("#category-form"),
  categoryPreviousId: document.querySelector("#category-previous-id"),
  categoryName: document.querySelector("#category-name"),
  categoryIcon: document.querySelector("#category-icon"),
  categoryOrder: document.querySelector("#category-order"),
  categoryNav: document.querySelector("#category-nav"),
  categoryList: document.querySelector("#category-list"),
  productList: document.querySelector("#admin-product-list"),
  toast: document.querySelector(".admin-toast"),
};

let draftPhotos = [];
let toastTimer;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
const formatPrice = (value) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const categories = (catalog) => [...catalog.categories].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "pt-BR"));
const categoryFor = (catalog, id) => catalog.categories.find((category) => category.id === id);

function notify(message) {
  refs.toast.textContent = message;
  refs.toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => refs.toast.classList.remove("is-visible"), 2900);
}

function productMedia(product) {
  if (product.photos?.[0]) return `<img src="${escapeHtml(product.photos[0])}" alt="" />`;
  return `<div class="product-art ${escapeHtml(product.art)}"><div class="object"></div></div>`;
}

function renderPhotoPreview() {
  refs.photoPreview.innerHTML = draftPhotos.map((photo, index) => `<div class="photo-thumb"><img src="${escapeHtml(photo)}" alt="Prévia da foto ${index + 1}" /><button type="button" data-remove-photo="${index}" aria-label="Remover foto ${index + 1}">×</button></div>`).join("");
}

function renderProductSelect(catalog, selectedId = refs.productCategory.value) {
  refs.productCategory.innerHTML = categories(catalog).map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}${category.visible ? "" : " (oculta)"}</option>`).join("");
  if (catalog.categories.some((category) => category.id === selectedId)) refs.productCategory.value = selectedId;
}

function renderMetrics(catalog) {
  const visible = catalog.products.filter((product) => product.visible);
  const hero = visible.find((product) => product.isHero);
  document.querySelector("#total-products").textContent = catalog.products.length;
  document.querySelector("#visible-products").textContent = visible.length;
  document.querySelector("#total-categories").textContent = catalog.categories.filter((category) => category.visible).length;
  document.querySelector("#hero-product").textContent = hero?.title || "Sem destaque";
}

function renderCategories(catalog) {
  refs.categoryList.innerHTML = categories(catalog).map((category) => `
    <article class="category-row">
      <span class="category-symbol">${escapeHtml(category.icon)}</span>
      <div><strong>${escapeHtml(category.name)}</strong><small>${category.showOnNav ? "No menu" : "Fora do menu"} · posição ${category.order}${category.visible ? "" : " · oculta"}</small></div>
      <div class="category-row-actions"><button class="icon-action" type="button" data-edit-category="${escapeHtml(category.id)}" aria-label="Editar ${escapeHtml(category.name)}">✎</button><button class="icon-action" type="button" data-delete-category="${escapeHtml(category.id)}" aria-label="Remover ${escapeHtml(category.name)}">×</button></div>
    </article>`).join("");
}

function renderProducts(catalog) {
  const products = [...catalog.products].sort((first, second) => new Date(second.updatedAt) - new Date(first.updatedAt));
  refs.productList.innerHTML = products.length ? products.map((product) => {
    const category = categoryFor(catalog, product.categoryId);
    const status = product.isHero ? "No topo" : product.featuredRank ? `Destaque ${product.featuredRank}` : product.visible ? "Na vitrine" : "Oculto";
    return `<article class="admin-product-row">
      <div class="admin-product-image">${productMedia(product)}</div>
      <div class="admin-product-info"><h3>${escapeHtml(product.title)}</h3><p>${escapeHtml(category?.name || "Sem categoria")} · ${product.photos.length ? `${product.photos.length} foto${product.photos.length === 1 ? "" : "s"}` : "visual provisório"}</p></div>
      <div class="admin-product-meta"><strong>${formatPrice(product.price)}</strong><span>${status}</span></div>
      <div class="admin-product-actions"><button type="button" data-edit-product="${escapeHtml(product.id)}">Editar</button><button type="button" data-toggle-product="${escapeHtml(product.id)}">${product.visible ? "Ocultar" : "Exibir"}</button><button class="delete-product" type="button" data-delete-product="${escapeHtml(product.id)}" aria-label="Excluir ${escapeHtml(product.title)}">×</button></div>
    </article>`;
  }).join("") : `<p class="form-message">Ainda não há produtos cadastrados.</p>`;
}

function render() {
  const catalog = catalogStore.load();
  renderMetrics(catalog);
  renderProductSelect(catalog);
  renderCategories(catalog);
  renderProducts(catalog);
}

function clearProductForm() {
  const catalog = catalogStore.load();
  refs.productForm.reset();
  refs.productId.value = "";
  refs.productHeading.textContent = "Adicionar peça";
  refs.productVisible.checked = true;
  refs.productHero.checked = false;
  refs.productFeatured.value = "0";
  refs.productMaterial.value = "PLA impresso em 3D";
  refs.productProductionTime.value = "Produção em 3 a 5 dias úteis";
  refs.productAvailability.value = "Sob encomenda";
  refs.productStock.value = "";
  refs.productWeight.value = "0.3";
  refs.productHeight.value = "13";
  refs.productWidth.value = "10";
  refs.productLength.value = "15";
  refs.productArt.value = "art-lamp";
  draftPhotos = [];
  refs.productMessage.textContent = "";
  renderProductSelect(catalog, categories(catalog)[0]?.id);
  renderPhotoPreview();
}

function editProduct(id) {
  const catalog = catalogStore.load();
  const product = catalog.products.find((item) => item.id === id);
  if (!product) return;
  refs.productId.value = product.id;
  refs.productTitle.value = product.title;
  renderProductSelect(catalog, product.categoryId);
  refs.productPrice.value = product.price;
  refs.productTag.value = product.tag;
  refs.productMaterial.value = product.material;
  refs.productProductionTime.value = product.productionTime;
  refs.productAvailability.value = product.availability;
  refs.productStock.value = product.stock ?? "";
  refs.productFeatured.value = product.featuredRank || 0;
  refs.productWeight.value = product.shipping.weight;
  refs.productHeight.value = product.shipping.height;
  refs.productWidth.value = product.shipping.width;
  refs.productLength.value = product.shipping.length;
  refs.productDescription.value = product.description;
  refs.productArt.value = product.art;
  refs.productVisible.checked = product.visible;
  refs.productHero.checked = product.isHero;
  refs.productHeading.textContent = `Editar ${product.title}`;
  draftPhotos = [...product.photos];
  refs.productMessage.textContent = "";
  renderPhotoPreview();
  refs.productForm.closest(".admin-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function editCategory(id) {
  const category = catalogStore.load().categories.find((item) => item.id === id);
  if (!category) return;
  refs.categoryPreviousId.value = category.id;
  refs.categoryName.value = category.name;
  refs.categoryIcon.value = category.icon;
  refs.categoryOrder.value = category.order;
  refs.categoryNav.checked = category.showOnNav;
  refs.categoryName.focus();
}

function clearCategoryForm() {
  refs.categoryForm.reset();
  refs.categoryPreviousId.value = "";
  refs.categoryIcon.value = "✦";
  refs.categoryOrder.value = catalogStore.load().categories.length + 1;
  refs.categoryNav.checked = true;
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Não foi possível abrir ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

async function addPhotos(files) {
  const selected = [...files];
  if (!selected.length) return;
  if (selected.some((file) => file.size > 700 * 1024)) throw new Error("Cada foto deve ter no máximo 700 KB nesta prévia local.");
  const remaining = 4 - draftPhotos.length;
  if (remaining <= 0) throw new Error("Um produto pode ter até quatro fotos.");
  const accepted = selected.slice(0, remaining);
  const photos = await Promise.all(accepted.map(fileAsDataUrl));
  draftPhotos = [...draftPhotos, ...photos];
  renderPhotoPreview();
  if (selected.length > accepted.length) notify("Só as primeiras fotos que cabiam foram adicionadas.");
}

refs.productPhotos.addEventListener("change", async (event) => {
  try { await addPhotos(event.target.files); } catch (error) { notify(error.message); }
  event.target.value = "";
});

refs.productForm.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    catalogStore.saveProduct({
      id: refs.productId.value,
      title: refs.productTitle.value,
      categoryId: refs.productCategory.value,
      price: refs.productPrice.value,
      tag: refs.productTag.value,
      material: refs.productMaterial.value,
      productionTime: refs.productProductionTime.value,
      availability: refs.productAvailability.value,
      stock: refs.productStock.value,
      featuredRank: refs.productFeatured.value,
      shipping: { weight: refs.productWeight.value, height: refs.productHeight.value, width: refs.productWidth.value, length: refs.productLength.value },
      description: refs.productDescription.value,
      art: refs.productArt.value,
      visible: refs.productVisible.checked,
      isHero: refs.productHero.checked,
      photos: draftPhotos,
    });
    refs.productMessage.textContent = "Produto salvo na vitrine local.";
    notify("Produto salvo.");
    render();
    clearProductForm();
  } catch (error) { refs.productMessage.textContent = error.message; }
});

refs.categoryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    catalogStore.saveCategory({ previousId: refs.categoryPreviousId.value, name: refs.categoryName.value, icon: refs.categoryIcon.value, order: refs.categoryOrder.value, showOnNav: refs.categoryNav.checked, visible: true });
    notify("Categoria salva.");
    render();
    clearCategoryForm();
  } catch (error) { notify(error.message); }
});

document.addEventListener("click", (event) => {
  const removePhoto = event.target.closest("[data-remove-photo]");
  const editProductButton = event.target.closest("[data-edit-product]");
  const toggleProduct = event.target.closest("[data-toggle-product]");
  const deleteProduct = event.target.closest("[data-delete-product]");
  const editCategoryButton = event.target.closest("[data-edit-category]");
  const deleteCategoryButton = event.target.closest("[data-delete-category]");
  if (removePhoto) { draftPhotos.splice(Number(removePhoto.dataset.removePhoto), 1); renderPhotoPreview(); }
  if (editProductButton) editProduct(editProductButton.dataset.editProduct);
  if (toggleProduct) {
    const product = catalogStore.load().products.find((item) => item.id === toggleProduct.dataset.toggleProduct);
    if (product) { catalogStore.saveProduct({ ...product, visible: !product.visible }); render(); notify(product.visible ? "Produto ocultado." : "Produto exibido na vitrine."); }
  }
  if (deleteProduct) {
    const product = catalogStore.load().products.find((item) => item.id === deleteProduct.dataset.deleteProduct);
    if (product && window.confirm(`Excluir “${product.title}” da prévia local?`)) { catalogStore.deleteProduct(product.id); render(); clearProductForm(); notify("Produto removido."); }
  }
  if (editCategoryButton) editCategory(editCategoryButton.dataset.editCategory);
  if (deleteCategoryButton) {
    const category = catalogStore.load().categories.find((item) => item.id === deleteCategoryButton.dataset.deleteCategory);
    if (category && window.confirm(`Remover a categoria “${category.name}”?`)) { try { catalogStore.deleteCategory(category.id); render(); clearCategoryForm(); notify("Categoria removida."); } catch (error) { notify(error.message); } }
  }
  if (event.target.closest("#clear-product")) clearProductForm();
  if (event.target.closest("#reset-catalog") && window.confirm("Restaurar os produtos e categorias demonstrativos? As mudanças locais serão perdidas.")) { catalogStore.reset(); render(); clearProductForm(); clearCategoryForm(); notify("Catálogo demonstrativo restaurado."); }
});

window.addEventListener("storage", (event) => { if (event.key === "light-loja-catalog-v1") { render(); } });

render();
clearProductForm();
clearCategoryForm();
