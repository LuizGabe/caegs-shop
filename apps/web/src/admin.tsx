import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { apiUrl, request, type Product } from "./lib";

export function AdminPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin-products"], queryFn: () => request<{ products: Product[] }>("/admin/products") });
  const [selected, setSelected] = useState<Product | null>(null);
  const [message, setMessage] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-products"] });
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name")), description: String(form.get("description")),
      costPrice: Number(form.get("costPrice")), salePrice: Number(form.get("salePrice")),
      active: form.get("active") === "on", featured: form.get("featured") === "on",
      displayOrder: Number(form.get("displayOrder")),
      salesStartAt: form.get("salesStartAt") ? new Date(String(form.get("salesStartAt"))).toISOString() : null,
      salesEndAt: form.get("salesEndAt") ? new Date(String(form.get("salesEndAt"))).toISOString() : null
    };
    try {
      const result = await request<{ product: Product }>(selected ? `/admin/products/${selected.id}` : "/admin/products", { method: selected ? "PATCH" : "POST", body: JSON.stringify(payload) });
      setSelected(result.product); setMessage("Produto salvo."); refresh();
    } catch (error) { setMessage((error as Error).message); }
  };
  if (query.isLoading) return <p>Carregando administracao...</p>;
  if (query.error) return <p className="text-red-700">Acesso administrativo necessario: {query.error.message}</p>;
  return <section className="grid gap-8 lg:grid-cols-[280px_1fr]"><aside><div className="flex items-center justify-between"><h1 className="text-xl font-semibold">Produtos</h1><button title="Novo produto" aria-label="Novo produto" onClick={() => setSelected(null)}><Plus size={20} /></button></div><div className="mt-4 space-y-2">{query.data?.products.map((product) => <button key={product.id} onClick={() => setSelected(product)} className="w-full rounded border border-border bg-white p-3 text-left"><span className="block font-medium">{product.name}</span><span className="text-xs text-muted-foreground">{product.active ? "Ativo" : "Inativo"}</span></button>)}</div></aside><div><h2 className="text-xl font-semibold">{selected ? "Editar produto" : "Novo produto"}</h2>{message && <p className="mt-2 text-sm text-primary">{message}</p>}<form className="mt-5 grid gap-4" onSubmit={save} key={selected?.id ?? "new"}><label>Nome<input name="name" required defaultValue={selected?.name} className="mt-1 w-full rounded border p-2" /></label><label>Descricao<textarea name="description" required defaultValue={selected?.description} className="mt-1 min-h-28 w-full rounded border p-2" /></label><div className="grid gap-4 sm:grid-cols-3"><label>Custo<input name="costPrice" type="number" min="0" step="0.01" required defaultValue={selected?.costPrice} className="mt-1 w-full rounded border p-2" /></label><label>Venda<input name="salePrice" type="number" min="0" step="0.01" required defaultValue={selected?.salePrice} className="mt-1 w-full rounded border p-2" /></label><label>Ordem<input name="displayOrder" type="number" min="0" defaultValue={selected?.displayOrder ?? 0} className="mt-1 w-full rounded border p-2" /></label></div><div className="flex gap-5"><label><input name="active" type="checkbox" defaultChecked={selected?.active} /> Ativo</label><label><input name="featured" type="checkbox" defaultChecked={selected?.featured} /> Destaque</label></div><div className="grid gap-4 sm:grid-cols-2"><label>Inicio das vendas<input name="salesStartAt" type="datetime-local" defaultValue={selected?.salesStartAt?.slice(0, 16) ?? ""} className="mt-1 w-full rounded border p-2" /></label><label>Fim das vendas<input name="salesEndAt" type="datetime-local" defaultValue={selected?.salesEndAt?.slice(0, 16) ?? ""} className="mt-1 w-full rounded border p-2" /></label></div><button className="w-fit rounded bg-primary px-4 py-2 text-primary-foreground">Salvar produto</button></form>{selected && <ProductAssets product={selected} refresh={refresh} />}</div></section>;
}

function ProductAssets({ product, refresh }: { product: Product; refresh: () => void }) {
  const [variant, setVariant] = useState("");
  const upload = async (files: FileList | null, type: "PRODUCT" | "SIZE_GUIDE") => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const contentBase64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.onerror = reject; reader.readAsDataURL(file); });
      await request(`/admin/products/${product.id}/images`, { method: "POST", body: JSON.stringify({ type, altText: file.name, fileName: file.name, mimeType: file.type, contentBase64 }) });
    }
    refresh();
  };
  return <div className="mt-8 border-t pt-6"><h3 className="font-semibold">Variantes e imagens</h3><div className="mt-3 flex gap-2"><input value={variant} onChange={(event) => setVariant(event.target.value)} placeholder="Nova variante" className="rounded border p-2" /><button title="Adicionar variante" aria-label="Adicionar variante" onClick={async () => { if (variant) { await request(`/admin/products/${product.id}/variants`, { method: "POST", body: JSON.stringify({ name: variant, displayOrder: product.variants.length }) }); setVariant(""); refresh(); } }} className="rounded border px-3"><Plus size={18} /></button></div><div className="mt-2 flex flex-wrap gap-2">{product.variants.map((item) => <span key={item.id} className="rounded border px-2 py-1 text-sm">{item.name}</span>)}</div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="rounded border p-3 text-sm"><ImagePlus className="mr-2 inline" size={18} />Fotos do produto<input className="mt-2 block" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => upload(event.target.files, "PRODUCT")} /></label><label className="rounded border p-3 text-sm"><ImagePlus className="mr-2 inline" size={18} />Guias de medida<input className="mt-2 block" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => upload(event.target.files, "SIZE_GUIDE")} /></label></div><div className="mt-3 grid grid-cols-4 gap-2">{product.images.map((image) => <div key={image.id} className="relative"><img src={`${apiUrl}${image.url}`} alt={image.altText} className="aspect-square w-full object-cover" /><button title="Remover imagem" aria-label="Remover imagem" onClick={async () => { await request(`/admin/products/${product.id}/images/${image.id}`, { method: "DELETE" }); refresh(); }} className="absolute right-1 top-1 bg-white p-1"><Trash2 size={15} /></button></div>)}</div></div>;
}
