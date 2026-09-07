import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Minus, Plus, QrCode, ShoppingBag, Trash2, ArrowRight, Ruler, ShieldAlert, CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "./components/ui/Button";
import { GlassCard } from "./components/ui/GlassCard";
import { Badge } from "./components/ui/Badge";
import { EmptyState } from "./components/ui/EmptyState";
import { Skeleton } from "./components/ui/Skeleton";
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
  return (
    <section className="space-y-6 sm:space-y-8">
      <div className="rounded-3xl bg-gradient-to-r from-blue-900 via-indigo-800 to-slate-900 text-white p-5 sm:p-12 relative overflow-hidden shadow-xl shadow-blue-950/10">
        <div className="absolute right-0 top-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl">
          <Badge variant="blue" className="bg-blue-400/20 text-blue-200 border-blue-400/30 mb-4">
            PRODUTOS OFICIAIS CAES
          </Badge>
          <h1 className="text-2xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            Engenharia de Software UNIJUÍ
          </h1>
          <p className="mt-4 text-blue-100/90 text-sm sm:text-base leading-relaxed">
            Camisetas, moletons e acessórios desenvolvidos para os estudantes do curso. Garanta seus itens e acompanhe a produção e retirada.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/products" className="inline-flex w-full sm:w-fit">
              <Button
                variant="primary"
                size="lg"
                rightIcon={<ArrowRight size={18} className="shrink-0" />}
                className="w-full sm:w-auto sm:min-w-[280px] bg-blue-500 hover:bg-blue-400 text-slate-950 font-semibold border-none px-6 sm:px-10"
              >
                Ver todos os produtos
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="pt-4">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight mb-6">Destaques da Loja</h2>
        <CatalogPage />
      </div>
    </section>
  );
}

export function CatalogPage() {
  const { data, isLoading, error } = useProducts();

  if (isLoading) {
    return (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
        <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
        <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
        Não foi possível carregar os produtos: {error.message}
      </div>
    );
  }

  const products = data?.products ?? [];

  if (!products.length) {
    return (
      <EmptyState
        icon={<ShoppingBag size={24} />}
        title="Nenhum produto disponível"
        description="Não há itens com vendas abertas no momento. Volte em breve!"
      />
    );
  }

  return (
    <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => {
        const image = product.images.find((item) => item.type === "PRODUCT");
        return (
          <Link key={product.id} to={`/products/${product.slug}`} className="group">
            <GlassCard hoverEffect className="overflow-hidden h-full flex flex-col">
              <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden">
                {image ? (
                  <img
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300 ease-out"
                    src={`${apiUrl}${image.url}`}
                    alt={image.altText}
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-slate-400">
                    <ShoppingBag size={36} />
                  </div>
                )}
                {product.featured && (
                  <div className="absolute top-3 left-3">
                    <Badge variant="amber">Destaque</Badge>
                  </div>
                )}
              </div>
              <div className="p-4 sm:p-5 flex flex-col flex-1 justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                    {product.name}
                  </h3>
                  <p className="mt-1.5 line-clamp-2 text-xs text-slate-500 leading-relaxed">
                    {product.description}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                  <span className="text-lg font-extrabold text-slate-900">
                    {currency.format(product.salePrice)}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-blue-700 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                    Ver detalhes <ArrowRight size={14} />
                  </span>
                </div>
              </div>
            </GlassCard>
          </Link>
        );
      })}
    </section>
  );
}

export function ProductPage() {
  const { slug = "" } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["product", slug],
    queryFn: () => request<{ product: Product }>(`/products/${slug}`)
  });

  const [quantity, setQuantity] = useState(1);
  const [variant, setVariant] = useState("");
  const [imageIndex, setImageIndex] = useState(0);
  const [added, setAdded] = useState(false);
  const [showSizeGuide, setShowSizeGuide] = useState(false);

  if (isLoading) {
    return (
      <div className="grid gap-8 lg:grid-cols-2">
        <Skeleton className="aspect-square w-full rounded-3xl" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-12 w-1/3" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <EmptyState
        icon={<ShieldAlert size={28} />}
        title="Produto não encontrado"
        description={error?.message || "O item buscado não está disponível."}
        action={
          <Link to="/products" className="inline-flex w-fit">
            <Button variant="outline">Voltar para a Loja</Button>
          </Link>
        }
      />
    );
  }

  const product = data.product;
  const photos = product.images.filter((item) => item.type === "PRODUCT");
  const sizeGuides = product.images.filter((item) => item.type === "SIZE_GUIDE");
  const canAdd = product.variants.length > 0 && Boolean(variant);

  const handleAddToCart = () => {
    if (!canAdd) return;
    addToCart({ productId: product.id, productVariantId: variant, quantity });
    setAdded(true);
    setTimeout(() => setAdded(false), 2500);
  };

  return (
    <section className="grid gap-6 lg:grid-cols-2 lg:gap-8 items-start">
      {/* Gallery */}
      <div className="space-y-4">
        <GlassCard className="aspect-square max-h-[min(78svh,520px)] overflow-hidden rounded-3xl p-2">
          {photos[imageIndex] ? (
            <img
              className="h-full w-full object-cover rounded-2xl"
              src={`${apiUrl}${photos[imageIndex].url}`}
              alt={photos[imageIndex].altText}
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-slate-300">
              <ShoppingBag size={48} />
            </div>
          )}
        </GlassCard>

        {photos.length > 1 && (
          <div className="flex gap-3 overflow-x-auto overscroll-x-contain pb-2">
            {photos.map((item, index) => (
              <button
                key={item.id}
                onClick={() => setImageIndex(index)}
                className={`h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 transition-all active-press ${
                  imageIndex === index ? "border-blue-600 ring-2 ring-blue-600/20" : "border-slate-200 opacity-70 hover:opacity-100"
                }`}
                aria-label={`Ver ${item.altText}`}
              >
                <img className="h-full w-full object-cover" src={`${apiUrl}${item.url}`} alt="" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Product Information */}
      <GlassCard className="p-5 sm:p-8 space-y-6">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge variant="blue">OFICIAL CAES</Badge>
            {sizeGuides.length > 0 && (
              <button
                onClick={() => setShowSizeGuide(true)}
                className="min-h-9 rounded-lg px-1 text-xs font-semibold text-blue-700 hover:text-blue-800 flex items-center gap-1 underline underline-offset-4"
              >
                <Ruler size={14} /> Guia de Medidas
              </button>
            )}
          </div>
          <h1 className="text-xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {product.name}
          </h1>
          <p className="mt-4 whitespace-pre-line text-sm text-slate-600 leading-relaxed">
            {product.description}
          </p>
        </div>

        <div className="pt-4 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Valor unitário</p>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-0.5">
            {currency.format(product.salePrice)}
          </p>
        </div>

        {/* Variant Selection */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
            Selecione a variante / tamanho <span className="text-rose-600">*</span>
          </label>
          {product.variants.length === 0 ? (
            <p className="text-xs text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200">
              Nenhuma variante disponível para compra neste item.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {product.variants.map((item) => {
                const isSelected = variant === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setVariant(item.id)}
                    className={`min-h-11 py-3 px-3 rounded-xl border text-xs font-semibold transition-all active-press ${
                      isSelected
                        ? "bg-blue-700 text-white border-blue-700 shadow-sm"
                        : "bg-white text-slate-800 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {item.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Quantity Selection */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
            Quantidade
          </label>
          <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50/80 p-1">
            <button
              type="button"
              className="w-10 h-10 rounded-lg bg-white shadow-xs text-slate-700 flex items-center justify-center active-press hover:bg-slate-100 disabled:opacity-40"
              disabled={quantity <= 1}
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              aria-label="Diminuir quantidade"
            >
              <Minus size={16} />
            </button>
            <span className="w-12 text-center text-sm font-bold text-slate-900">{quantity}</span>
            <button
              type="button"
              className="w-10 h-10 rounded-lg bg-white shadow-xs text-slate-700 flex items-center justify-center active-press hover:bg-slate-100 disabled:opacity-40"
              disabled={quantity >= 20}
              onClick={() => setQuantity(Math.min(20, quantity + 1))}
              aria-label="Aumentar quantidade"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Add to Cart CTA */}
        <div className="pt-4 border-t border-slate-100">
          <Button
            type="button"
            size="lg"
            variant={added ? "secondary" : "primary"}
            className="w-full font-semibold"
            disabled={!canAdd}
            onClick={handleAddToCart}
            leftIcon={added ? <Check size={20} className="text-blue-700" /> : <ShoppingBag size={20} />}
          >
            {added ? "Adicionado ao Carrinho!" : "Adicionar ao Carrinho"}
          </Button>
          {!variant && product.variants.length > 0 && (
            <p className="text-[11px] text-slate-400 text-center mt-2">
              Selecione um tamanho ou variante acima para habilitar a compra.
            </p>
          )}
        </div>
      </GlassCard>

      {/* Size Guide Modal */}
      {showSizeGuide && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
          <GlassCard className="w-full max-w-2xl max-h-[92dvh] overflow-y-auto rounded-b-none bg-white p-4 shadow-2xl sm:rounded-2xl sm:p-6">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Ruler className="text-blue-700" size={20} /> Guia de Medidas
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setShowSizeGuide(false)}>
                Fechar
              </Button>
            </div>
            <div className="space-y-4">
              {sizeGuides.map((guide) => (
                <div key={guide.id} className="rounded-xl overflow-hidden border border-slate-200">
                  <img src={`${apiUrl}${guide.url}`} alt={guide.altText || "Tabela de tamanhos"} className="w-full h-auto object-contain" />
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      )}
    </section>
  );
}

export function CartPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useProducts();
  const [items, setItems] = useState(readCart);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cpfCnpj, setCpfCnpj] = useState("");

  const formatCPF = (value: string) => {
    const numbers = value.replace(/\D/g, "").slice(0, 11);
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 6) return `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
    if (numbers.length <= 9) return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`;
    return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9)}`;
  };

  const rows = useMemo(() => {
    return items.flatMap((item) => {
      const product = data?.products.find((candidate) => candidate.id === item.productId);
      const variant = product?.variants.find((candidate) => candidate.id === item.productVariantId);
      return product && variant ? [{ item, product, variant }] : [];
    });
  }, [data, items]);

  const total = rows.reduce((sum, row) => sum + row.product.salePrice * row.item.quantity, 0);

  const update = (next: CartItem[]) => {
    setItems(next);
    writeCart(next);
  };

  const checkout = async () => {
    const rawCpf = cpfCnpj.replace(/\D/g, "");
    if (rawCpf.length !== 11) {
      setError("Informe um CPF válido contendo 11 dígitos.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await request<{ order: { publicId: string } }>("/checkout", {
        method: "POST",
        headers: { "idempotency-key": checkoutIdempotencyKey() },
        body: JSON.stringify({ items, cpfCnpj: rawCpf })
      });
      localStorage.removeItem("ca-cart");
      window.dispatchEvent(new Event("cart-updated"));
      navigate(`/checkout/${result.order.publicId}`);
    } catch (reason) {
      const apiError = reason as ApiError;
      setError(apiError.status === 401 ? "Entre com seu e-mail institucional para continuar." : apiError.message);
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <EmptyState
        icon={<ShoppingBag size={32} />}
        title="Seu carrinho está vazio"
        description="Explore os produtos oficiais do Centro Acadêmico e monte seu pedido."
        action={
          <Link to="/products" className="inline-flex w-fit">
            <Button variant="primary">Ver Produtos</Button>
          </Link>
        }
      />
    );
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Carrinho de Compras</h1>
        <p className="text-xs text-slate-500 mt-1">Revise os itens e informe o CPF para geração da cobrança PIX.</p>
      </div>

      <GlassCard className="divide-y divide-slate-100 overflow-hidden">
        {rows.map(({ item, product, variant }) => {
          const thumbnail = product.images.find((image) => image.type === "PRODUCT");
          return (
          <div key={`${item.productId}:${item.productVariantId}`} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center">
                {thumbnail ? (
                  <img src={`${apiUrl}${thumbnail.url}`} alt={thumbnail.altText || product.name} className="h-full w-full object-cover" />
                ) : (
                  <ShoppingBag size={22} className="text-slate-300" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900 text-sm sm:text-base line-clamp-2">{product.name}</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Tamanho/Variante: {variant.name}</p>
                <p className="text-sm font-bold text-blue-800 mt-2">
                  {currency.format(product.salePrice * item.quantity)}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
              <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  className="h-10 w-10 rounded-lg bg-white text-slate-700 flex items-center justify-center active-press hover:bg-slate-100 sm:h-7 sm:w-7"
                  onClick={() => update(items.map((entry) => entry === item ? { ...entry, quantity: Math.max(1, entry.quantity - 1) } : entry))}
                  aria-label="Diminuir"
                >
                  <Minus size={14} />
                </button>
                <span className="w-10 text-center text-sm font-bold text-slate-900 sm:w-8 sm:text-xs">{item.quantity}</span>
                <button
                  type="button"
                  className="h-10 w-10 rounded-lg bg-white text-slate-700 flex items-center justify-center active-press hover:bg-slate-100 sm:h-7 sm:w-7"
                  onClick={() => update(items.map((entry) => entry === item ? { ...entry, quantity: Math.min(20, entry.quantity + 1) } : entry))}
                  aria-label="Aumentar"
                >
                  <Plus size={14} />
                </button>
              </div>

              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-800"
                onClick={() => update(items.filter((entry) => entry !== item))}
                aria-label="Remover item"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
          );
        })}
      </GlassCard>

      {/* Checkout Inputs Card */}
      <GlassCard className="p-4 sm:p-6">
        <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              CPF do Pagador (para PIX)
            </label>
            <input
              value={cpfCnpj}
              onChange={(e) => setCpfCnpj(formatCPF(e.target.value))}
              inputMode="numeric"
              placeholder="000.000.000-00"
              className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            <p className="mt-1.5 text-[11px] text-slate-400">
              O CPF é utilizado unicamente pelo gateway de pagamento Asaas e não é armazenado na plataforma.
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-2 sm:items-end sm:pt-0">
            <div>
              <p className="text-xs text-slate-400 font-medium sm:text-right">Total a pagar</p>
              <p className="text-2xl font-extrabold text-slate-900">{currency.format(total)}</p>
            </div>
            <Button
              type="button"
              size="lg"
              variant="primary"
              isLoading={busy}
              disabled={cpfCnpj.replace(/\D/g, "").length !== 11}
              onClick={checkout}
              className="w-full sm:w-auto"
            >
              {busy ? "Gerando PIX..." : "Pagar com PIX"}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {error}
            {error.startsWith("Entre") && (
              <a className="ml-2 font-semibold underline text-rose-900" href={`${apiUrl}/auth/google`}>
                Entrar com Google
              </a>
            )}
          </div>
        )}
      </GlassCard>
    </section>
  );
}

type Payment = {
  id: string;
  orderPublicId: string;
  orderHumanReadableId: string;
  orderNumber: number;
  orderYear: number;
  status: string;
  amount: number;
  pixQrCodeImage: string | null;
  pixCopyPasteCode: string | null;
  pixExpiresAt: string | null;
  confirmedAt: string | null;
  fallbackPix: {
    active: true;
    reason: "ASAAS_PIX_DEGRADED";
    copyPasteCode: string;
    qrCodeImage: string;
    manualConfirmationNotice: string;
  } | null;
};

export function PaymentPage() {
  const { publicId = "" } = useParams();
  const [copied, setCopied] = useState(false);

  const query = useQuery({
    queryKey: ["payment", publicId],
    queryFn: () => request<{ payment: Payment }>(`/orders/${publicId}/payment`),
    refetchInterval: (state) => (state.state.data?.payment.status === "PENDING" ? 4000 : false)
  });

  useEffect(() => {
    if (copied) {
      const timeout = window.setTimeout(() => setCopied(false), 2000);
      return () => window.clearTimeout(timeout);
    }
  }, [copied]);

  if (query.isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <Skeleton className="h-48 w-full rounded-3xl" />
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <EmptyState
        icon={<ShieldAlert size={28} />}
        title="Pagamento não encontrado"
        description={query.error?.message || "Não foi possível carregar as informações desta cobrança."}
      />
    );
  }

  const payment = query.data.payment;
  const paid = payment.status === "CONFIRMED";
  const fallbackPix = payment.fallbackPix?.active ? payment.fallbackPix : null;
  const pixCopyPasteCode = fallbackPix?.copyPasteCode ?? payment.pixCopyPasteCode ?? "";
  const pixQrCodeImage = fallbackPix?.qrCodeImage ?? (payment.pixQrCodeImage ? `data:image/png;base64,${payment.pixQrCodeImage}` : null);

  return (
    <section className="mx-auto max-w-2xl">
      <GlassCard className="p-4 sm:p-8 space-y-6">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <span className="text-xs font-mono text-slate-400 uppercase">Pedido #{payment.orderHumanReadableId}</span>
            <p className="mt-1 text-[11px] text-slate-400 font-mono break-all">Referência técnica: {payment.orderPublicId}</p>
            <h1 className="text-2xl font-bold text-slate-900 mt-0.5">
              {paid ? "Pagamento Confirmado!" : fallbackPix ? "Pague com PIX alternativo" : "Pague com PIX"}
            </h1>
          </div>
          <Badge variant={paid ? "blue" : "amber"} dot className="w-fit">
            {paid ? "Pago" : "Aguardando PIX"}
          </Badge>
        </div>

        {paid ? (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 size={36} />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Obrigado pelo seu pedido!</h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Recebemos seu pagamento de <strong className="text-slate-900">{currency.format(payment.amount)}</strong>. Seu pedido já foi registrado e entrará na fila de produção.
            </p>
            <div className="pt-4 flex justify-center gap-3">
              <Link to="/orders">
                <Button variant="primary">Acompanhar Meus Pedidos</Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {fallbackPix && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                <div className="flex items-start gap-3">
                  <ShieldAlert size={20} className="mt-0.5 shrink-0 text-amber-700" />
                  <div className="space-y-1">
                    <p className="font-extrabold text-slate-900">Sistema de pagamentos degradado</p>
                    <p className="text-xs leading-relaxed text-slate-700">O Pix dinamico do Asaas esta com instabilidade. Use o Pix alternativo abaixo para concluir o pagamento.</p>
                    <p className="text-xs leading-relaxed text-slate-700">{fallbackPix.manualConfirmationNotice}</p>
                  </div>
                </div>
              </div>
            )}

          <div className="grid gap-6 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-center">
            <div className="mx-auto aspect-square w-full max-w-[240px] rounded-2xl border border-slate-200 bg-white p-3 shadow-xs flex items-center justify-center sm:max-w-none">
              {pixQrCodeImage ? (
                <img className="h-full w-full object-contain" src={pixQrCodeImage} alt="QR Code PIX" />
              ) : (
                <QrCode className="h-24 w-24 text-slate-300" />
              )}
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Valor total do PIX</p>
                <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-0.5">{currency.format(payment.amount)}</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">PIX Copia e Cola</p>
                <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row">
                  <textarea
                    readOnly
                    value={pixCopyPasteCode}
                    className="min-h-[84px] min-w-0 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 text-[11px] font-mono text-slate-700 leading-tight focus:outline-none"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0 px-3"
                    onClick={async () => {
                      await navigator.clipboard.writeText(pixCopyPasteCode);
                      setCopied(true);
                    }}
                  >
                    {copied ? <Check size={18} className="text-blue-700" /> : <Copy size={18} />}
                  </Button>
                </div>
              </div>

              <div className="text-xs text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <p>{fallbackPix ? "A confirmacao pode levar mais tempo porque sera conferida manualmente." : "O status do pedido sera atualizado automaticamente assim que o pagamento for confirmado pelo banco."}</p>
                {payment.pixExpiresAt && (
                  <p className="mt-1 text-[11px] font-mono text-slate-400">
                    Vencimento: {new Date(payment.pixExpiresAt).toLocaleString("pt-BR")}
                  </p>
                )}
              </div>
            </div>
          </div>
          </div>
        )}
      </GlassCard>
    </section>
  );
}




