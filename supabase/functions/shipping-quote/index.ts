type ShippingItem = {
  quantity?: unknown;
  shipping?: {
    weight?: unknown;
    height?: unknown;
    width?: unknown;
    length?: unknown;
  };
};

type SuperFreteQuote = Record<string, unknown>;

const defaultPackage = { weight: 0.3, height: 13, width: 10, length: 15 };

function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
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

function normaliseQuote(value: SuperFreteQuote, index: number) {
  const company = value.company && typeof value.company === "object" ? value.company as Record<string, unknown> : {};
  const carrier = stringAt(company, ["name", "label"]) || stringAt(value, ["carrier_name", "carrier", "company_name"]) || "SuperFrete";
  const service = stringAt(value, ["name", "service", "description", "service_name"]) || "Entrega";
  const priceCents = cents(value.price ?? value.total_price ?? value.custom_price ?? value.amount);
  const deliveryDays = Number(value.delivery_time ?? value.delivery_days ?? value.deadline ?? value.delivery_estimate);

  if (priceCents === null) return null;
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
  const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "*";
  const corsHeaders = {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "Origin",
  };

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ message: "Método não permitido." }, 405, corsHeaders);

  const token = Deno.env.get("SUPERFRETE_TOKEN");
  const origin = postalCode(Deno.env.get("SUPERFRETE_ORIGIN_POSTAL_CODE"));
  if (!token || !origin) return json({ message: "A cotação ainda não foi configurada." }, 503, corsHeaders);

  let body: { destinationPostalCode?: unknown; items?: ShippingItem[] };
  try {
    body = await request.json();
  } catch {
    return json({ message: "Dados da cotação inválidos." }, 400, corsHeaders);
  }

  const destination = postalCode(body.destinationPostalCode);
  if (!destination) return json({ message: "Informe um CEP válido." }, 400, corsHeaders);
  if (!Array.isArray(body.items) || body.items.length === 0) return json({ message: "O carrinho está vazio." }, 400, corsHeaders);

  const products = body.items.slice(0, 20).map((item) => {
    const shipping = item?.shipping || {};
    return {
      quantity: Math.min(Math.max(Math.floor(Number(item?.quantity) || 1), 1), 20),
      weight: numberInRange(shipping.weight, defaultPackage.weight, 30),
      height: numberInRange(shipping.height, defaultPackage.height, 100),
      width: numberInRange(shipping.width, defaultPackage.width, 100),
      length: numberInRange(shipping.length, defaultPackage.length, 100),
    };
  });

  const apiBase = (Deno.env.get("SUPERFRETE_API_BASE_URL") || "https://sandbox.superfrete.com").replace(/\/$/, "");
  const services = Deno.env.get("SUPERFRETE_SERVICES") || "1,2,17,3,33,31";
  const userAgent = Deno.env.get("SUPERFRETE_USER_AGENT") || "Light.loja/0.1 (contato@light.loja)";

  let response: Response;
  try {
    response = await fetch(`${apiBase}/api/v0/calculator`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "user-agent": userAgent,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: { postal_code: origin },
        to: { postal_code: destination },
        services,
        options: { own_hand: false, receipt: false, insurance_value: 0, use_insurance_value: false },
        products,
      }),
    });
  } catch {
    return json({ message: "Não foi possível consultar a SuperFrete agora. Tente novamente." }, 502, corsHeaders);
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = result && typeof result === "object" ? stringAt(result as Record<string, unknown>, ["message", "error"]) : "";
    return json({ message: providerMessage || "A SuperFrete não conseguiu calcular este envio." }, 502, corsHeaders);
  }

  const quotes = quoteList(result)
    .map((item, index) => item && typeof item === "object" ? normaliseQuote(item as SuperFreteQuote, index) : null)
    .filter(Boolean);
  return json({ quotes }, 200, corsHeaders);
});
