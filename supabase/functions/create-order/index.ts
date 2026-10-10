type OrderLine = { id?: unknown; quantity?: unknown };
type CatalogOrderProduct = {
  id: string;
  title: string;
  price_cents: number;
  stock: number | null;
  status: string;
  photos: unknown;
  shipping: unknown;
  catalog_categories: { visible: boolean } | Array<{ visible: boolean }>;
};
type Address = {
  postalCode?: unknown;
  street?: unknown;
  number?: unknown;
  complement?: unknown;
  neighborhood?: unknown;
  city?: unknown;
  state?: unknown;
};

const defaultPackage = { weight: 0.3, height: 13, width: 10, length: 15 };
const states = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));

function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
}

function clean(value: unknown, maximum: number) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maximum);
}

function postalCode(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  return /^\d{8}$/.test(digits) ? digits : null;
}

function numberInRange(value: unknown, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}

function cents(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);
  if (typeof value !== "string") return null;
  const normalised = value.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const parsed = Number(normalised);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function stringAt(object: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function normaliseQuote(value: Record<string, unknown>, index: number) {
  const company = value.company && typeof value.company === "object" ? value.company as Record<string, unknown> : {};
  const carrier = stringAt(company, ["name", "label"]) || stringAt(value, ["carrier_name", "carrier", "company_name"]) || "SuperFrete";
  const service = stringAt(value, ["name", "service", "description", "service_name"]) || "Entrega";
  const priceCents = cents(value.price ?? value.total_price ?? value.custom_price ?? value.amount);
  const deliveryDays = Number(value.delivery_time ?? value.delivery_days ?? value.deadline ?? value.delivery_estimate);
  if (priceCents === null || priceCents < 0 || !Number.isSafeInteger(priceCents)) return null;
  return {
    id: stringAt(value, ["id", "service_id", "code"]) || `${carrier}-${service}-${index}`,
    carrier,
    service,
    priceCents,
    deliveryDays: Number.isFinite(deliveryDays) && deliveryDays >= 0 ? Math.ceil(deliveryDays) : null,
  };
}

function quoteList(value: unknown) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const key of ["data", "quotes", "services"]) if (Array.isArray(object[key])) return object[key] as unknown[];
  }
  return [];
}

Deno.serve(async (request) => {
  const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "https://lightloja.vercel.app";
  const originHeader = request.headers.get("origin") || "";
  const corsHeaders = {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "Origin",
  };

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ message: "Método não permitido." }, 405, corsHeaders);
  if (originHeader && allowedOrigin !== "*" && originHeader !== allowedOrigin) return json({ message: "Origem não autorizada." }, 403, corsHeaders);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const token = Deno.env.get("SUPERFRETE_TOKEN");
  const originPostalCode = postalCode(Deno.env.get("SUPERFRETE_ORIGIN_POSTAL_CODE"));
  if (!supabaseUrl || !serviceKey || !token || !originPostalCode) return json({ message: "A criação de pedidos ainda não está configurada." }, 503, corsHeaders);

  let body: {
    customer?: Record<string, unknown>;
    address?: Address;
    items?: OrderLine[];
    shippingServiceId?: unknown;
    requestKey?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return json({ message: "Dados do pedido inválidos." }, 400, corsHeaders);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ message: "Dados do pedido inválidos." }, 400, corsHeaders);

  const customer = body.customer || {};
  const address = body.address || {};
  const name = clean(customer.fullName, 100);
  const email = clean(customer.email, 120).toLowerCase();
  const phone = clean(customer.phone, 20);
  const recipient = clean(customer.recipient, 100);
  const phoneDigits = phone.replace(/\D/g, "");
  const requestKey = clean(body.requestKey, 36);
  const destination = postalCode(address.postalCode);
  const street = clean(address.street, 120);
  const number = clean(address.number, 20);
  const complement = clean(address.complement, 80);
  const neighborhood = clean(address.neighborhood, 80);
  const city = clean(address.city, 80);
  const state = clean(address.state, 2).toUpperCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey) || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phoneDigits.length < 10 || phoneDigits.length > 13 || !recipient || !destination || !street || !number || !neighborhood || !city || !states.has(state)) {
    return json({ message: "Confira seus dados e o endereço de entrega." }, 400, corsHeaders);
  }
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) return json({ message: "O carrinho está vazio ou possui itens demais." }, 400, corsHeaders);
  const requestedItems = body.items.map((line) => ({ id: clean(line?.id, 90), quantity: Number(line?.quantity) }));
  if (requestedItems.some((line) => !line.id || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20) || new Set(requestedItems.map((line) => line.id)).size !== requestedItems.length) {
    return json({ message: "Confira as quantidades no carrinho." }, 400, corsHeaders);
  }

  const supabaseModule = await import("https://esm.sh/@supabase/supabase-js@2.57.4");
  const supabase = supabaseModule.createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: previousOrder } = await supabase.from("light_orders").select("id,created_at,status,total_cents").eq("request_key", requestKey).maybeSingle();
  if (previousOrder) return json({ order: { id: previousOrder.id, createdAt: previousOrder.created_at, status: previousOrder.status, totalCents: previousOrder.total_cents } }, 200, corsHeaders);

  const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "";
  if (!/^[0-9a-fA-F:.]{2,64}$/.test(clientIp)) return json({ message: "Não foi possível validar a origem deste pedido. Tente novamente." }, 503, corsHeaders);
  const { data: withinRateLimit, error: rateLimitError } = await supabase.rpc("consume_light_order_rate_limit", { client_ip: clientIp });
  if (rateLimitError) return json({ message: "Não foi possível validar este pedido agora. Tente novamente." }, 503, corsHeaders);
  if (!withinRateLimit) return json({ message: "Muitas tentativas de pedido. Aguarde uma hora antes de tentar novamente." }, 429, { ...corsHeaders, "retry-after": "3600" });

  const { data: products, error: productError } = await supabase.from("catalog_products")
    .select("id,title,price_cents,stock,status,category_id,photos,shipping,catalog_categories!inner(visible)")
    .in("id", requestedItems.map((line) => line.id));
  if (productError) return json({ message: "Não foi possível conferir os produtos. Tente novamente." }, 503, corsHeaders);
  const productRows = (products || []) as unknown as CatalogOrderProduct[];
  const productById = new Map<string, CatalogOrderProduct>(productRows.map((product) => [product.id, product]));
  const orderItems: Array<Record<string, unknown>> = [];
  const shippingProducts: Array<Record<string, unknown>> = [];
  let subtotalCents = 0;
  for (const line of requestedItems) {
    const product = productById.get(line.id);
    const productCategory = product && (Array.isArray(product.catalog_categories) ? product.catalog_categories[0] : product.catalog_categories);
    if (!product || product.status !== "published" || productCategory?.visible !== true) return json({ message: "Uma peça do carrinho não está mais disponível. Atualize a página." }, 409, corsHeaders);
    if (product.stock !== null && line.quantity > product.stock) return json({ message: `Estoque insuficiente para ${product.title}. Atualize a quantidade.` }, 409, corsHeaders);
    const unitPriceCents = Number(product.price_cents);
    if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0) return json({ message: "O preço de uma peça precisa ser conferido pela equipe." }, 409, corsHeaders);
    subtotalCents += unitPriceCents * line.quantity;
    orderItems.push({ id: product.id, title: product.title, photo: Array.isArray(product.photos) ? product.photos[0] || null : null, quantity: line.quantity, unitPriceCents, lineTotalCents: unitPriceCents * line.quantity });
    const dimensions = product.shipping && typeof product.shipping === "object" ? product.shipping as Record<string, unknown> : {};
    shippingProducts.push({
      quantity: line.quantity,
      weight: numberInRange(dimensions.weight, defaultPackage.weight, 30),
      height: numberInRange(dimensions.height, defaultPackage.height, 100),
      width: numberInRange(dimensions.width, defaultPackage.width, 100),
      length: numberInRange(dimensions.length, defaultPackage.length, 100),
    });
  }

  const apiBase = (Deno.env.get("SUPERFRETE_API_BASE_URL") || "https://sandbox.superfrete.com").replace(/\/$/, "");
  const services = Deno.env.get("SUPERFRETE_SERVICES") || "1,2,17,3,33,31";
  const userAgent = Deno.env.get("SUPERFRETE_USER_AGENT") || "Light.loja/0.1 (contato@light.loja)";
  let quoteResponse: Response;
  try {
    quoteResponse = await fetch(`${apiBase}/api/v0/calculator`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "user-agent": userAgent, accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        from: { postal_code: originPostalCode },
        to: { postal_code: destination },
        services,
        options: { own_hand: false, receipt: false, insurance_value: 0, use_insurance_value: false },
        products: shippingProducts,
      }),
    });
  } catch {
    return json({ message: "Não foi possível confirmar o frete agora. Tente novamente." }, 502, corsHeaders);
  }
  const quoteResult = await quoteResponse.json().catch(() => ({}));
  if (!quoteResponse.ok) return json({ message: "Não foi possível confirmar o frete agora. Recalcule as opções e tente novamente." }, 502, corsHeaders);
  const quotes = quoteList(quoteResult).map((item, index) => item && typeof item === "object" ? normaliseQuote(item as Record<string, unknown>, index) : null).filter(Boolean);
  const selectedQuote = quotes.find((quote) => quote?.id === clean(body.shippingServiceId, 120));
  if (!selectedQuote) return json({ message: "A opção de entrega mudou. Calcule o frete novamente." }, 409, corsHeaders);

  const shippingAddress = { street, number, complement, neighborhood, city, state };
  const totalCents = subtotalCents + selectedQuote.priceCents;
  if (!Number.isSafeInteger(totalCents) || totalCents > 2_147_483_647) return json({ message: "O total do pedido excede o limite permitido. Fale com a equipe da Light." }, 409, corsHeaders);
  const { data: order, error: insertError } = await supabase.from("light_orders").insert({
    request_key: requestKey,
    customer_name: name,
    customer_email: email,
    customer_phone: phone,
    recipient_name: recipient,
    shipping_address: shippingAddress,
    postal_code: destination,
    items: orderItems,
    shipping_service: selectedQuote,
    subtotal_cents: subtotalCents,
    shipping_cents: selectedQuote.priceCents,
    total_cents: totalCents,
    status: "pending_payment",
  }).select("id,created_at,status,total_cents").single();
  if (insertError || !order) {
    const { data: repeatedOrder } = await supabase.from("light_orders").select("id,created_at,status,total_cents").eq("request_key", requestKey).maybeSingle();
    if (repeatedOrder) return json({ order: { id: repeatedOrder.id, createdAt: repeatedOrder.created_at, status: repeatedOrder.status, totalCents: repeatedOrder.total_cents } }, 200, corsHeaders);
    return json({ message: "Não foi possível registrar o pedido. Tente novamente." }, 503, corsHeaders);
  }

  return json({ order: { id: order.id, createdAt: order.created_at, status: order.status, totalCents: order.total_cents } }, 201, corsHeaders);
});
