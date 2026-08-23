import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Minus, Plus, QrCode, ShoppingBag, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  ApiError,
  addToCart,
  apiUrl,
  checkoutIdempotencyKey,
  currency,
  readCart,
  request,
  type CartItem,
  type Product,
  writeCart
} from "./lib";

export function useProducts() {
  return useQuery({ queryKey: ["products"], queryFn: () => request<{ products: Product[] }>("/products") });
}

export function HomePage() {
  return <section><div className="mb-7"><p className="text-sm font-medium text-primary">Centro Academico</p><h1 className="mt-2 text-4xl font-bold">Produtos do CA</h1><p className="mt-3 max-w-xl text-muted-foreground">Itens oficiais da Engenharia de Software UNIJUI.</p></div><CatalogPage /></section>;
}

export function CatalogPage() {
  const { data, isLoading, error } = useProducts();
  if (isLoading) return <p>Carregando produtos...</p>;
  if (error) return <p className="text-red-700">{error.message}</p>;
  return <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{data?.products.map((product) => {
    const image = product.images.find((item) => item.type === "PRODUCT");
    return <Link key={product.id} to={`/products/${product.slug}`} className="overflow-hidden rounded-lg border border-border bg-white"><div className="aspect-[4/3] bg-muted">{image && <img className="h-full w-full object-cover" src={`${apiUrl}${image.url}`} alt={image.altText} />}</div><div className="p-4"><h2 className="font-semibold">{product.name}</h2><p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{product.description}</p><p className="mt-3 font-semibold text-primary">{currency.format(product.salePrice)}</p></div></Link>;
  })}{!data?.products.length && <p className="text-muted-foreground">Nenhum produto disponivel no momento.</p>}</section>;
}

export function ProductPage() {
  const { slug = "" } = useParams();
  const { data, isLoading, error } = useQuery({ queryKey: ["product", slug], queryFn: () => request<{ product: Product }>(`/products/${slug}`) });
  const [quantity, setQuantity] = useState(1);
  const [variant, setVariant] = useState("");
  const [imageIndex, setImageIndex] = useState(0);
  const [added, setAdded] = useState(false);
  if (isLoading) return <p>Carregando produto...</p>;
  if (error || !data) return <p className="text-red-700">{error?.message ?? "Produto nao encontrado."}</p>;
  const product = data.product;
  const photos = product.images.filter((item) => item.type === "PRODUCT");
  const canAdd = product.variants.length > 0 && Boolean(variant);
  return <section className="grid gap-8 lg:grid-cols-2"><div><div className="aspect-square overflow-hidden rounded-lg bg-muted">{photos[imageIndex] && <img className="h-full w-full object-cover" src={`${apiUrl}${photos[imageIndex].url}`} alt={photos[imageIndex].altText} />}</div><div className="mt-3 flex gap-2 overflow-auto">{photos.map((item, index) => <button key={item.id} onClick={() => setImageIndex(index)} className="h-16 w-16 shrink-0 overflow-hidden rounded border border-border" aria-label={`Ver ${item.altText}`}><img className="h-full w-full object-cover" src={`${apiUrl}${item.url}`} alt="" /></button>)}</div></div><div><h1 className="text-3xl font-bold">{product.name}</h1><p className="mt-4 whitespace-pre-line text-muted-foreground">{product.description}</p><p className="mt-5 text-2xl font-semibold text-primary">{currency.format(product.salePrice)}</p><label className="mt-6 block text-sm font-medium">Variante<select value={variant} onChange={(event) => setVariant(event.target.value)} className="mt-2 w-full rounded border border-border bg-white p-2"><option value="">Selecione</option>{product.variants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="mt-5 flex h-10 w-32 items-center justify-between rounded border border-border px-2"><button aria-label="Diminuir quantidade" onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus size={18} /></button><span>{quantity}</span><button aria-label="Aumentar quantidade" onClick={() => setQuantity(Math.min(20, quantity + 1))}><Plus size={18} /></button></div><button disabled={!canAdd} onClick={() => { addToCart({ productId: product.id, productVariantId: variant, quantity }); setAdded(true); }} className="mt-5 inline-flex items-center gap-2 rounded bg-primary px-5 py-3 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{added ? <Check size={19} /> : <ShoppingBag size={19} />}{added ? "Adicionado" : "Adicionar ao carrinho"}</button></div></section>;
}

export function CartPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useProducts();
  const [items, setItems] = useState(readCart);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cpfCnpj, setCpfCnpj] = useState("");
  const rows = useMemo(() => items.flatMap((item) => {
    const product = data?.products.find((candidate) => candidate.id === item.productId);
    const variant = product?.variants.find((candidate) => candidate.id === item.productVariantId);
    return product && variant ? [{ item, product, variant }] : [];
  }), [data, items]);
  const total = rows.reduce((sum, row) => sum + row.product.salePrice * row.item.quantity, 0);
  const update = (next: CartItem[]) => { setItems(next); writeCart(next); };
  const checkout = async () => {
    setBusy(true); setError(null);
    try {
      const result = await request<{ order: { publicId: string } }>("/checkout", {
        method: "POST",
        headers: { "idempotency-key": checkoutIdempotencyKey() },
        body: JSON.stringify({ items, cpfCnpj })
      });
      localStorage.removeItem("ca-cart");
      window.dispatchEvent(new Event("cart-updated"));
      navigate(`/checkout/${result.order.publicId}`);
    } catch (reason) {
      const apiError = reason as ApiError;
      setError(apiError.status === 401 ? "Entre com seu e-mail institucional para continuar." : apiError.message);
    } finally { setBusy(false); }
  };
  if (isLoading) return <p>Carregando carrinho...</p>;
  if (!rows.length) return <section><h1 className="text-3xl font-semibold">Carrinho</h1><p className="mt-3 text-muted-foreground">Seu carrinho esta vazio.</p><Link className="mt-5 inline-block text-primary" to="/products">Ver produtos</Link></section>;
  return <section className="mx-auto max-w-3xl"><h1 className="text-3xl font-semibold">Carrinho</h1><div className="mt-6 divide-y rounded border border-border bg-white">{rows.map(({ item, product, variant }) => <div key={`${item.productId}:${item.productVariantId}`} className="grid grid-cols-[1fr_auto] gap-4 p-4"><div><h2 className="font-medium">{product.name}</h2><p className="text-sm text-muted-foreground">{variant.name}</p><p className="mt-2 font-medium">{currency.format(product.salePrice * item.quantity)}</p></div><div className="flex items-center gap-3"><button aria-label="Diminuir" onClick={() => update(items.map((entry) => entry === item ? { ...entry, quantity: Math.max(1, entry.quantity - 1) } : entry))}><Minus size={17} /></button><span className="w-5 text-center">{item.quantity}</span><button aria-label="Aumentar" onClick={() => update(items.map((entry) => entry === item ? { ...entry, quantity: Math.min(20, entry.quantity + 1) } : entry))}><Plus size={17} /></button><button aria-label="Remover" className="ml-2 text-red-700" onClick={() => update(items.filter((entry) => entry !== item))}><Trash2 size={18} /></button></div></div>)}</div><div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"><label className="text-sm font-medium">CPF do pagador<input value={cpfCnpj} onChange={(event) => setCpfCnpj(event.target.value)} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" className="mt-1 w-full rounded border border-border bg-white p-2" /></label><div className="flex items-center gap-5"><div><p className="text-sm text-muted-foreground">Total</p><p className="text-2xl font-semibold">{currency.format(total)}</p></div><button disabled={busy || cpfCnpj.replace(/\D/g, "").length !== 11} onClick={checkout} className="rounded bg-primary px-5 py-3 font-medium text-primary-foreground disabled:opacity-60">{busy ? "Gerando PIX..." : "Pagar com PIX"}</button></div></div><p className="mt-2 text-xs text-muted-foreground">O CPF e enviado ao Asaas para emissao da cobranca e nao e salvo na plataforma.</p>{error && <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}{error.startsWith("Entre") && <a className="ml-2 font-medium underline" href={`${apiUrl}/auth/google`}>Entrar</a>}</div>}</section>;
}

type Payment = { id: string; orderPublicId: string; status: string; amount: number; pixQrCodeImage: string | null; pixCopyPasteCode: string | null; pixExpiresAt: string | null; confirmedAt: string | null };

export function PaymentPage() {
  const { publicId = "" } = useParams();
  const [copied, setCopied] = useState(false);
  const query = useQuery({
    queryKey: ["payment", publicId],
    queryFn: () => request<{ payment: Payment }>(`/orders/${publicId}/payment`),
    refetchInterval: (state) => state.state.data?.payment.status === "PENDING" ? 5000 : false
  });
  useEffect(() => { if (copied) { const timeout = window.setTimeout(() => setCopied(false), 2000); return () => window.clearTimeout(timeout); } }, [copied]);
  if (query.isLoading) return <p>Carregando pagamento...</p>;
  if (query.error || !query.data) return <p className="text-red-700">{query.error?.message ?? "Pagamento nao encontrado."}</p>;
  const payment = query.data.payment;
  const paid = payment.status === "CONFIRMED";
  return <section className="mx-auto max-w-3xl"><div className="flex items-center justify-between border-b border-border pb-5"><div><p className="text-sm text-muted-foreground">Pedido {payment.orderPublicId}</p><h1 className="mt-1 text-3xl font-semibold">{paid ? "Pagamento confirmado" : "Pague com PIX"}</h1></div><span className={`rounded px-3 py-1 text-sm font-medium ${paid ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{paid ? "Pago" : "Aguardando"}</span></div>{paid ? <div className="py-12 text-center"><Check className="mx-auto text-emerald-700" size={48} /><p className="mt-4 text-lg">Recebemos seu pagamento de {currency.format(payment.amount)}.</p><Link className="mt-5 inline-block text-primary" to="/products">Voltar aos produtos</Link></div> : <div className="grid gap-8 py-8 md:grid-cols-[280px_1fr] md:items-center"><div className="aspect-square rounded border border-border bg-white p-4">{payment.pixQrCodeImage ? <img className="h-full w-full" src={`data:image/png;base64,${payment.pixQrCodeImage}`} alt="QR Code PIX" /> : <QrCode className="h-full w-full text-muted" />}</div><div><p className="text-sm text-muted-foreground">Valor</p><p className="mt-1 text-3xl font-semibold">{currency.format(payment.amount)}</p><p className="mt-5 text-sm font-medium">PIX copia e cola</p><div className="mt-2 flex items-stretch"><textarea readOnly value={payment.pixCopyPasteCode ?? ""} className="min-h-24 min-w-0 flex-1 resize-none rounded-l border border-border bg-white p-3 text-xs" /><button title="Copiar codigo PIX" aria-label="Copiar codigo PIX" onClick={async () => { await navigator.clipboard.writeText(payment.pixCopyPasteCode ?? ""); setCopied(true); }} className="w-12 rounded-r border border-l-0 border-border bg-white">{copied ? <Check className="mx-auto text-emerald-700" size={19} /> : <Copy className="mx-auto" size={19} />}</button></div><p className="mt-3 text-sm text-muted-foreground">O status sera atualizado automaticamente apos a confirmacao do Asaas.</p>{payment.pixExpiresAt && <p className="mt-1 text-xs text-muted-foreground">Valido ate {new Date(payment.pixExpiresAt).toLocaleString("pt-BR")}.</p>}</div></div>}</section>;
}
