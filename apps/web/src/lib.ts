export const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers
    }
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      body?.error?.message ?? "Nao foi possivel concluir a operacao.",
      response.status,
      body?.error?.code
    );
  }
  return body as T;
}

export const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export async function downloadCsv(path: string, filename: string) {
  const response = await fetch(`${apiUrl}${path}`, { credentials: "include" });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.error?.message ?? "Nao foi possivel exportar o relatorio.", response.status, body?.error?.code);
  }
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export type Variant = { id: string; name: string; active: boolean; displayOrder: number };
export type ProductImage = { id: string; url: string; altText: string; type: "PRODUCT" | "SIZE_GUIDE"; displayOrder: number };
export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  costPrice: number;
  salePrice: number;
  active: boolean;
  featured: boolean;
  displayOrder: number;
  salesStartAt: string | null;
  salesEndAt: string | null;
  variants: Variant[];
  images: ProductImage[];
};

export type CartItem = { productId: string; productVariantId: string; quantity: number };
const cartKey = "ca-cart";
const checkoutKey = "ca-checkout-idempotency";

export function readCart(): CartItem[] {
  try {
    const value = JSON.parse(localStorage.getItem(cartKey) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function writeCart(items: CartItem[]) {
  localStorage.setItem(cartKey, JSON.stringify(items));
  sessionStorage.removeItem(checkoutKey);
  window.dispatchEvent(new Event("cart-updated"));
}

export function addToCart(item: CartItem) {
  const items = readCart();
  const existing = items.find((entry) => entry.productId === item.productId && entry.productVariantId === item.productVariantId);
  if (existing) existing.quantity += item.quantity;
  else items.push(item);
  writeCart(items);
}

export function checkoutIdempotencyKey() {
  const existing = sessionStorage.getItem(checkoutKey);
  if (existing) return existing;
  const value = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  sessionStorage.setItem(checkoutKey, value);
  return value;
}
