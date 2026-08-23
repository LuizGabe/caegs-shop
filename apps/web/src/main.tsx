import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import "./styles.css";

const queryClient = new QueryClient();

function Shell() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-lg font-semibold">
            CA Engenharia de Software
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="/orders">Pedidos</Link>
            <Link to="/cart">Carrinho</Link>
            <Link to="/profile">Perfil</Link>
            <Link to="/admin">Admin</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<Placeholder title="Login institucional" />} />
          <Route path="/products/:slug" element={<Placeholder title="Produto" />} />
          <Route path="/cart" element={<Placeholder title="Carrinho" />} />
          <Route path="/checkout" element={<Placeholder title="Checkout PIX" />} />
          <Route path="/orders" element={<Placeholder title="Meus pedidos" />} />
          <Route path="/orders/:id" element={<Placeholder title="Detalhes do pedido" />} />
          <Route path="/profile" element={<Placeholder title="Perfil" />} />
          <Route path="/admin" element={<Placeholder title="Painel administrativo" />} />
        </Routes>
      </main>
    </div>
  );
}

function HomePage() {
  return (
    <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
      <div className="space-y-5">
        <p className="text-sm font-medium uppercase tracking-wide text-primary">Centro Acadêmico</p>
        <h1 className="max-w-3xl text-4xl font-bold leading-tight md:text-5xl">
          Engenharia de Software UNIJUÍ
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Plataforma oficial para vendas do CA, pagamentos PIX, acompanhamento de pedidos,
          produção e retirada.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" to="/login">
            Entrar com Google
          </Link>
          <Link className="rounded-md border border-border px-4 py-2 text-sm font-medium" to="/orders">
            Ver meus pedidos
          </Link>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Primeira etapa em construção</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          A base técnica já separa frontend, API, shared types, Prisma, Docker e documentação
          arquitetural para seguir o fluxo de implementação por etapas.
        </p>
      </div>
    </section>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <section className="space-y-3">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">Esta rota será implementada nas próximas features planejadas.</p>
    </section>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
