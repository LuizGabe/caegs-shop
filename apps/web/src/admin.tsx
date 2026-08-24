import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Plus, Trash2, ShieldAlert, Package, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "./components/ui/Button";
import { GlassCard } from "./components/ui/GlassCard";
import { Badge } from "./components/ui/Badge";
import { Skeleton } from "./components/ui/Skeleton";
import { EmptyState } from "./components/ui/EmptyState";
import { apiUrl, request, type Product } from "./lib";

export function AdminPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin-products"], queryFn: () => request<{ products: Product[] }>("/admin/products") });
  const [selected, setSelected] = useState<Product | null>(null);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const refresh = async (productId?: string) => {
    await queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    if (productId) {
      const result = await request<{ product: Product }>(`/admin/products/${productId}`);
      setSelected(result.product);
    }
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name")),
      description: String(form.get("description")),
      costPrice: Number(form.get("costPrice")),
      salePrice: Number(form.get("salePrice")),
      active: form.get("active") === "on",
      featured: form.get("featured") === "on",
      displayOrder: Number(form.get("displayOrder")),
      salesStartAt: form.get("salesStartAt") ? new Date(String(form.get("salesStartAt"))).toISOString() : null,
      salesEndAt: form.get("salesEndAt") ? new Date(String(form.get("salesEndAt"))).toISOString() : null
    };
    try {
      const result = await request<{ product: Product }>(
        selected ? `/admin/products/${selected.id}` : "/admin/products",
        { method: selected ? "PATCH" : "POST", body: JSON.stringify(payload) }
      );
      setSelected(result.product);
      setMessage("Produto salvo com sucesso.");
      await refresh(result.product.id);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  if (query.isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Skeleton className="h-96 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  if (query.error) {
    return (
      <EmptyState
        icon={<ShieldAlert size={32} className="text-rose-600" />}
        title="Acesso Administrativo Necessário"
        description={query.error.message}
      />
    );
  }

  const products = query.data?.products ?? [];

  return (
    <section className="grid gap-8 lg:grid-cols-[280px_1fr]">
      {/* Sidebar List */}
      <aside className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Produtos</h1>
          <Button
            size="sm"
            variant="primary"
            onClick={() => setSelected(null)}
            leftIcon={<Plus size={16} />}
          >
            Novo
          </Button>
        </div>

        <div className="space-y-2">
          {products.map((product) => {
            const isSelected = selected?.id === product.id;
            const thumbnail = product.images.find((image) => image.type === "PRODUCT");
            return (
              <button
                key={product.id}
                onClick={() => setSelected(product)}
                className={`w-full text-left p-2.5 rounded-xl border transition-all active-press ${
                  isSelected
                    ? "bg-blue-50 border-blue-500 shadow-xs"
                    : "bg-white/80 border-slate-200/80 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center">
                    {thumbnail ? (
                      <img src={`${apiUrl}${thumbnail.url}`} alt={thumbnail.altText || product.name} className="h-full w-full object-cover" />
                    ) : (
                      <Package size={18} className="text-slate-300" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-slate-900 line-clamp-1">{product.name}</span>
                      <Badge variant={product.active ? "blue" : "slate"}>
                        {product.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    <span className="text-xs text-slate-500 mt-1 block">R$ {product.salePrice.toFixed(2)}</span>
                  </div>
                </div>
              </button>
            );
          })}
          {!products.length && <p className="text-xs text-slate-400 p-4 text-center">Nenhum produto cadastrado.</p>}
        </div>
      </aside>

      {/* Main Form */}
      <div>
        <GlassCard className="p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <h2 className="text-xl font-bold text-slate-900">
              {selected ? `Editar: ${selected.name}` : "Novo Produto"}
            </h2>
            {selected && (
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                Limpar formulário
              </Button>
            )}
          </div>

          {message && (
            <div className={`p-3 rounded-xl border text-xs font-medium ${message.includes("sucesso") ? "bg-blue-50 border-blue-200 text-blue-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>
              {message}
            </div>
          )}

          <form className="space-y-4" onSubmit={save} key={selected?.id ?? "new"}>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Nome do produto <span className="text-rose-600">*</span>
              </label>
              <input
                name="name"
                required
                defaultValue={selected?.name}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Descrição <span className="text-rose-600">*</span>
              </label>
              <textarea
                name="description"
                required
                rows={3}
                defaultValue={selected?.description}
                className="w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Preço de Custo (R$)
                </label>
                <input
                  name="costPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  defaultValue={selected?.costPrice}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Preço de Venda (R$)
                </label>
                <input
                  name="salePrice"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  defaultValue={selected?.salePrice}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Ordem de Exibição
                </label>
                <input
                  name="displayOrder"
                  type="number"
                  min="0"
                  defaultValue={selected?.displayOrder ?? 0}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            </div>

            <div className="flex gap-6 py-2">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={selected?.active ?? true}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600"
                />
                Produto Ativo para Vendas
              </label>

              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  name="featured"
                  type="checkbox"
                  defaultChecked={selected?.featured ?? false}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600"
                />
                Destaque na Loja
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Início das Vendas (opcional)
                </label>
                <input
                  name="salesStartAt"
                  type="datetime-local"
                  defaultValue={selected?.salesStartAt?.slice(0, 16) ?? ""}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Fim das Vendas (opcional)
                </label>
                <input
                  name="salesEndAt"
                  type="datetime-local"
                  defaultValue={selected?.salesEndAt?.slice(0, 16) ?? ""}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-xs focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-2">
              <Button type="submit" variant="primary" isLoading={isSaving}>
                Salvar Produto
              </Button>
            </div>
          </form>

          {selected && <ProductAssets product={selected} refresh={refresh} />}
        </GlassCard>
      </div>
    </section>
  );
}

function ProductAssets({ product, refresh }: { product: Product; refresh: (productId?: string) => Promise<void> }) {
  const [variant, setVariant] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const upload = async (files: FileList | null, type: "PRODUCT" | "SIZE_GUIDE") => {
    if (!files) return;
    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const contentBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        await request(`/admin/products/${product.id}/images`, {
          method: "POST",
          body: JSON.stringify({ type, altText: file.name, fileName: file.name, mimeType: file.type, contentBase64 })
        });
      }
      await refresh(product.id);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="border-t border-slate-200 pt-6 space-y-6">
      <div>
        <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider mb-3">Variantes e Tamanhos</h3>
        <div className="flex gap-2 max-w-md">
          <input
            value={variant}
            onChange={(e) => setVariant(e.target.value)}
            placeholder="Ex: P, M, G, GG..."
            className="flex-1 h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none"
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              if (variant.trim()) {
                await request(`/admin/products/${product.id}/variants`, {
                  method: "POST",
                  body: JSON.stringify({ name: variant.trim(), displayOrder: product.variants.length })
                });
                setVariant("");
                await refresh(product.id);
              }
            }}
          >
            Adicionar Variante
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {product.variants.map((item) => (
            <span key={item.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
              {item.name}
              <button
                type="button"
                title={`Remover variante ${item.name}`}
                aria-label={`Remover variante ${item.name}`}
                onClick={async () => {
                  await request(`/admin/products/${product.id}/variants/${item.id}`, { method: "DELETE" });
                  await refresh(product.id);
                }}
                className="ml-1 rounded-full p-0.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 size={12} />
              </button>
            </span>
          ))}
          {!product.variants.length && <p className="text-xs text-slate-400">Nenhuma variante cadastrada.</p>}
        </div>
      </div>

      <div>
        <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider mb-3">Fotos e Guia de Medidas</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 hover:bg-slate-50 cursor-pointer block text-xs font-semibold text-slate-700">
            <div className="flex items-center gap-2 mb-1">
              <ImagePlus size={16} className="text-blue-700" /> Fotos do Produto
            </div>
            <span className="text-[11px] font-normal text-slate-500 block">Clique para fazer upload (JPEG, PNG, WebP)</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={async (e) => { await upload(e.target.files, "PRODUCT"); e.currentTarget.value = ""; }}
            />
          </label>

          <label className="p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 hover:bg-slate-50 cursor-pointer block text-xs font-semibold text-slate-700">
            <div className="flex items-center gap-2 mb-1">
              <ImagePlus size={16} className="text-sky-700" /> Guia de Medidas / Tamanhos
            </div>
            <span className="text-[11px] font-normal text-slate-500 block">Upload de tabelas de medidas</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={async (e) => { await upload(e.target.files, "SIZE_GUIDE"); e.currentTarget.value = ""; }}
            />
          </label>
        </div>

        {isUploading && <p className="mt-2 text-xs text-blue-700 animate-pulse font-medium">Fazendo upload das imagens...</p>}

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {product.images.map((image) => (
            <div key={image.id} className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-square">
              <img src={`${apiUrl}${image.url}`} alt={image.altText} className="h-full w-full object-cover" />
              <div className="absolute top-1 left-1">
                <Badge variant={image.type === "SIZE_GUIDE" ? "sky" : "slate"}>
                  {image.type === "SIZE_GUIDE" ? "Guia" : "Foto"}
                </Badge>
              </div>
              <button
                type="button"
                title="Remover imagem"
                onClick={async () => {
                  await request(`/admin/products/${product.id}/images/${image.id}`, { method: "DELETE" });
                  await refresh(product.id);
                }}
                className="absolute top-1 right-1 bg-white/90 text-rose-600 p-1.5 rounded-lg shadow-sm hover:bg-rose-600 hover:text-white transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}



