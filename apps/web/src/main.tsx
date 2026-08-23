import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import { AdminPage } from "./admin";
import { readCart } from "./lib";
import { CartPage, CatalogPage, HomePage, PaymentPage, ProductPage } from "./storefront";
import { ProductionBatchesPage } from "./production-batches";
import "./styles.css";

const queryClient = new QueryClient();

function Shell() {
  const [cartCount, setCartCount] = useState(() => readCart().reduce((sum, item) => sum + item.quantity, 0));
  useEffect(() => {
    const update = () => setCartCount(readCart().reduce((sum, item) => sum + item.quantity, 0));
    window.addEventListener("cart-updated", update);
    window.addEventListener("storage", update);
    return () => { window.removeEventListener("cart-updated", update); window.removeEventListener("storage", update); };
  }, []);
  return <div className="min-h-screen bg-background text-foreground"><header className="border-b border-border bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4"><Link to="/" className="font-semibold">CA Engenharia de Software</Link><nav className="flex items-center gap-5 text-sm text-muted-foreground"><Link to="/products">Produtos</Link><Link to="/admin/products">Admin</Link><Link to="/admin/production-batches">Lotes</Link><Link to="/cart" aria-label={`Carrinho com ${cartCount} itens`} className="relative"><ShoppingBag size={20} />{cartCount > 0 && <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-white">{cartCount}</span>}</Link></nav></div></header><main className="mx-auto max-w-6xl px-4 py-8"><Routes><Route path="/" element={<HomePage />} /><Route path="/products" element={<CatalogPage />} /><Route path="/products/:slug" element={<ProductPage />} /><Route path="/cart" element={<CartPage />} /><Route path="/checkout/:publicId" element={<PaymentPage />} /><Route path="/admin" element={<AdminPage />} /><Route path="/admin/products" element={<AdminPage />} /><Route path="/admin/production-batches" element={<ProductionBatchesPage />} /><Route path="*" element={<h1 className="text-3xl font-semibold">Pagina nao encontrada</h1>} /></Routes></main></div>;
}

createRoot(document.getElementById("root") as HTMLElement).render(<QueryClientProvider client={queryClient}><BrowserRouter><Shell /></BrowserRouter></QueryClientProvider>);
