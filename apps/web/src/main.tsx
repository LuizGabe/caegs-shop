import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Clock3, Home, Menu, PackageCheck, Shield, ShoppingBag, Store, User as UserIcon, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes, Navigate, useLocation } from "react-router";
import { AdminPage } from "./admin";
import { AdminUsersPage } from "./admin-users";
import { DashboardPage } from "./dashboard";
import { readCart, useAuth } from "./lib";
import { OrdersPage } from "./orders";
import { PendingPaymentsPage } from "./pending-payments";
import { OnboardingPage } from "./pages/OnboardingPage";
import { ProfilePage } from "./pages/ProfilePage";
import { WelcomePage } from "./pages/WelcomePage";
import { ProductionBatchesPage } from "./production-batches";
import { CartPage, CatalogPage, HomePage, PaymentPage, ProductPage } from "./storefront";
import { Skeleton } from "./components/ui/Skeleton";
import { Badge } from "./components/ui/Badge";
import { Avatar } from "./components/ui/Avatar";
import "./styles.css";

const queryClient = new QueryClient();

function Shell() {
  const { data: authData, isLoading: isAuthLoading } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [cartCount, setCartCount] = useState(() =>
    readCart().reduce((sum, item) => sum + item.quantity, 0)
  );

  useEffect(() => {
    const update = () =>
      setCartCount(readCart().reduce((sum, item) => sum + item.quantity, 0));
    window.addEventListener("cart-updated", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("cart-updated", update);
      window.removeEventListener("storage", update);
    };
  }, []);

  const user = authData?.user;

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // 1. Loading state during auth check
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm w-full">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white shadow-sm ring-1 ring-blue-100 animate-pulse overflow-hidden p-0">
            <img src="/logo-CAES.png" alt="CAES" className="h-full w-full scale-[1.35] object-cover" />
          </div>
          <Skeleton className="h-6 w-48 mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  // 2. Unauthenticated User Flow
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        <main className="flex-1 mx-auto max-w-6xl w-full px-4">
          <Routes>
            <Route path="*" element={<WelcomePage />} />
          </Routes>
        </main>
      </div>
    );
  }

  // 3. Authenticated without course flow (Onboarding)
  if (user.needsProfileCompletion || !user.courseId) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        <main className="flex-1 mx-auto max-w-6xl w-full px-4">
          <Routes>
            <Route path="*" element={<OnboardingPage />} />
          </Routes>
        </main>
      </div>
    );
  }

  // 4. Authenticated with complete profile (Main Application)
  const canPurchase = user.courseCanPurchase;
  const fallbackPath = user.role === "ADMIN" ? "/admin" : "/profile";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Sticky Glassmorphism Header */}
      <header className="sticky top-0 z-40 glass-nav">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-3 sm:px-4 sm:py-3.5">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-xl bg-white border border-blue-100 overflow-hidden p-0 shadow-xs flex items-center justify-center group-hover:scale-105 transition-transform">
              <img src="/logo-CAES.png" alt="CAES" className="h-full w-full scale-[1.35] object-cover" />
            </div>
            <div className="hidden sm:block">
              <span className="font-bold text-slate-900 text-sm block leading-tight">CAES</span>
              <span className="text-[10px] text-slate-500 font-medium block">Engenharia de Software</span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-2 text-sm font-medium text-slate-600">
            {canPurchase && (
              <NavLink to="/products" icon={<Store size={16} />}>
                Produtos
              </NavLink>
            )}

            <NavLink to="/orders" icon={<PackageCheck size={16} />}>
              Meus Pedidos
            </NavLink>

            {/* MANDATORY: Render Admin Link IF AND ONLY IF user.role === 'ADMIN' */}
            {user.role === "ADMIN" && (
              <NavLink to="/admin" icon={<Shield size={16} className="text-indigo-600" />}>
                Administração
              </NavLink>
            )}

            {canPurchase && (
              <NavLink to="/cart" className="relative p-2" ariaLabel={`Carrinho com ${cartCount} itens`}>
                <ShoppingBag size={20} className="text-slate-700" />
                {cartCount > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white shadow-xs">
                    {cartCount}
                  </span>
                )}
              </NavLink>
            )}

            <Link to="/profile" className="ml-1 sm:ml-2 pl-2 border-l border-slate-200 flex items-center gap-2" title="Meu Perfil">
              <Avatar src={user.avatarUrl} name={user.name} size="sm" />
            </Link>
          </nav>

          <div className="flex items-center gap-1.5 md:hidden">
            {canPurchase && (
              <Link
                to="/cart"
                className="relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-700 transition-colors active-press hover:bg-slate-100"
                aria-label={`Carrinho com ${cartCount} itens`}
              >
                <ShoppingBag size={21} />
                {cartCount > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white shadow-xs">
                    {cartCount}
                  </span>
                )}
              </Link>
            )}
            <Link
              to="/profile"
              className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors active-press hover:bg-slate-100"
              aria-label="Meu perfil"
            >
              <Avatar src={user.avatarUrl} name={user.name} size="sm" />
            </Link>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-700 transition-colors active-press hover:bg-slate-100"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </header>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/45 backdrop-blur-xs"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Fechar menu"
          />
          <aside className="absolute right-0 top-0 flex h-dvh w-[min(320px,calc(100vw-24px))] flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar src={user.avatarUrl} name={user.name} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{user.name}</p>
                  <p className="truncate font-mono text-[11px] text-slate-500">{user.email}</p>
                </div>
              </div>
              <button
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="Fechar menu"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-3 text-sm font-semibold text-slate-700">
              <MobileNavLink to="/" icon={<Home size={18} />}>Início</MobileNavLink>
              {canPurchase && <MobileNavLink to="/products" icon={<Store size={18} />}>Produtos</MobileNavLink>}
              <MobileNavLink to="/orders" icon={<PackageCheck size={18} />}>Meus Pedidos</MobileNavLink>
              <MobileNavLink to="/profile" icon={<UserIcon size={18} />}>Perfil</MobileNavLink>
              {user.role === "ADMIN" && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Administração</p>
                  <MobileNavLink to="/admin" icon={<Shield size={18} className="text-indigo-600" />}>Painel</MobileNavLink>
                  <MobileNavLink to="/admin/products" icon={<Store size={18} />}>Produtos</MobileNavLink>
                  <MobileNavLink to="/admin/pending-payments" icon={<Clock3 size={18} />}>PIX pendentes</MobileNavLink>
                  <MobileNavLink to="/admin/production-batches" icon={<PackageCheck size={18} />}>Lotes</MobileNavLink>
                  <MobileNavLink to="/admin/users" icon={<UserIcon size={18} />}>Usuários</MobileNavLink>
                </div>
              )}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 mx-auto max-w-6xl w-full px-4 py-6 sm:py-8">
        <Routes>
          <Route path="/" element={canPurchase ? <HomePage /> : <ProfilePage />} />
          <Route path="/products" element={canPurchase ? <CatalogPage /> : <Navigate to={fallbackPath} replace />} />
          <Route path="/products/:slug" element={canPurchase ? <ProductPage /> : <Navigate to={fallbackPath} replace />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/cart" element={canPurchase ? <CartPage /> : <Navigate to={fallbackPath} replace />} />
          <Route path="/checkout/:publicId" element={canPurchase ? <PaymentPage /> : <Navigate to={fallbackPath} replace />} />

          {/* Admin Routes strictly protected on client side */}
          {user.role === "ADMIN" ? (
            <>
              <Route path="/admin" element={<DashboardPage />} />
              <Route path="/admin/products" element={<AdminPage />} />
              <Route path="/admin/pending-payments" element={<PendingPaymentsPage />} />
              <Route path="/admin/users" element={<AdminUsersPage />} />
              <Route path="/admin/production-batches" element={<ProductionBatchesPage />} />
            </>
          ) : (
            <Route path="/admin/*" element={<Navigate to="/" replace />} />
          )}

          <Route
            path="*"
            element={
              <div className="py-12 text-center">
                <h1 className="text-2xl font-bold text-slate-900">Página não encontrada</h1>
                <p className="text-xs text-slate-500 mt-2">A página solicitada não existe ou foi movida.</p>
                <Link to="/" className="mt-4 inline-block text-xs font-semibold text-blue-700 underline">
                  Voltar para a página inicial
                </Link>
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  );
}

function NavLink({
  to,
  children,
  icon,
  className = "",
  ariaLabel
}: {
  to: string;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const location = useLocation();
  const isActive = location.pathname === to || (to !== "/" && location.pathname.startsWith(to));

  return (
    <Link
      to={to}
      aria-label={ariaLabel}
      className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 font-medium ${
        isActive
          ? "bg-slate-200/70 text-slate-900 font-semibold"
          : "hover:bg-slate-100/80 text-slate-600 hover:text-slate-900"
      } ${className}`}
    >
      {icon}
      {children}
    </Link>
  );
}

function MobileNavLink({ to, children, icon }: { to: string; children: React.ReactNode; icon: React.ReactNode }) {
  const location = useLocation();
  const isActive = location.pathname === to || (to !== "/" && location.pathname.startsWith(to));

  return (
    <Link
      to={to}
      className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 ${
        isActive ? "bg-slate-100 text-slate-950" : "text-slate-700 hover:bg-slate-50"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{children}</span>
    </Link>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  </QueryClientProvider>
);

