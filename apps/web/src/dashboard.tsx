import { useMutation, useQuery } from "@tanstack/react-query";
import { Banknote, Boxes, CheckCircle2, Clock3, Download, Factory, Mail, PackageCheck, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { currency, downloadCsv, request } from "./lib";

type Dashboard = {
  metrics: { totalOrders: number; paidOrders: number; awaitingPayment: number; inProduction: number; readyForPickup: number; pickedUp: number; confirmedValue: number; batches: number };
  unitsByProduct: Array<{ productId: string; name: string; quantity: number }>;
  unitsByVariant: Array<{ name: string; quantity: number }>;
  batchesByStatus: Record<string, number>;
};

const batchStatusLabel: Record<string, string> = {
  DRAFT: "Rascunho",
  SENT_TO_PRODUCTION: "Enviado para producao",
  RECEIVED: "Recebido",
  READY_FOR_PICKUP: "Pronto para retirada",
  CLOSED: "Fechado"
};

export function DashboardPage() {
  const dashboard = useQuery({ queryKey: ["admin-dashboard"], queryFn: () => request<Dashboard>("/admin/dashboard") });
  const emailSettings = useQuery({ queryKey: ["admin-email-settings"], queryFn: () => request<{ enabled: boolean }>("/admin/settings/emails") });
  const updateEmailSettings = useMutation({
    mutationFn: (enabled: boolean) => request<{ enabled: boolean }>("/admin/settings/emails", { method: "PATCH", body: JSON.stringify({ enabled }) }),
    onSuccess: async () => { await emailSettings.refetch(); }
  });
  const [exportError, setExportError] = useState("");
  if (dashboard.isLoading) return <p>Carregando dashboard...</p>;
  if (dashboard.error || !dashboard.data) return <p className="text-red-700">Acesso administrativo necessario: {dashboard.error?.message}</p>;
  const { metrics } = dashboard.data;
  const metricItems = [
    { label: "Total de pedidos", value: metrics.totalOrders, icon: ShoppingCart, color: "text-slate-700" },
    { label: "Pedidos pagos", value: metrics.paidOrders, icon: CheckCircle2, color: "text-emerald-700" },
    { label: "Aguardando pagamento", value: metrics.awaitingPayment, icon: Clock3, color: "text-amber-700" },
    { label: "Em producao", value: metrics.inProduction, icon: Factory, color: "text-blue-700" },
    { label: "Disponiveis para retirada", value: metrics.readyForPickup, icon: PackageCheck, color: "text-cyan-700" },
    { label: "Retirados", value: metrics.pickedUp, icon: CheckCircle2, color: "text-green-700" },
    { label: "Valor confirmado", value: currency.format(metrics.confirmedValue), icon: Banknote, color: "text-emerald-800" },
    { label: "Lotes", value: metrics.batches, icon: Boxes, color: "text-violet-700" }
  ];
  return <section><header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5"><div><h1 className="text-2xl font-semibold">Dashboard administrativo</h1><p className="mt-2 text-sm text-muted-foreground">Pedidos confirmados determinam o valor e as unidades vendidas.</p></div><div className="flex flex-wrap gap-2"><Link to="/admin/products" className="rounded border border-border bg-white px-3 py-2 text-sm">Gerenciar produtos</Link><button onClick={async () => { setExportError(""); try { await downloadCsv("/admin/reports/orders.csv", "pedidos.csv"); } catch (error) { setExportError((error as Error).message); } }} className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"><Download size={17} />Exportar pedidos CSV</button></div></header><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-y border-border py-3"><span className="inline-flex items-center gap-2 text-sm font-medium"><Mail size={18} />Envio de e-mails</span><label className="inline-flex items-center gap-3 text-sm"><span>{emailSettings.data?.enabled ? "Ativado" : "Desativado"}</span><input type="checkbox" role="switch" checked={emailSettings.data?.enabled ?? false} disabled={emailSettings.isLoading || updateEmailSettings.isPending} onChange={(event) => updateEmailSettings.mutate(event.target.checked)} className="h-5 w-5 accent-primary" /></label></div>{updateEmailSettings.error && <p className="mt-2 text-sm text-red-700">{updateEmailSettings.error.message}</p>}{exportError && <p className="mt-3 text-sm text-red-700">{exportError}</p>}<div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{metricItems.map(({ label, value, icon: Icon, color }) => <div key={label} className="rounded border border-border bg-white p-4"><Icon size={20} className={color} /><p className="mt-4 text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}</div><div className="mt-8 grid gap-8 lg:grid-cols-2"><UnitList title="Unidades vendidas por produto" items={dashboard.data.unitsByProduct} /><UnitList title="Unidades por tamanho" items={dashboard.data.unitsByVariant} /></div><div className="mt-8"><div className="flex items-center justify-between"><h2 className="font-semibold">Lotes</h2><Link to="/admin/production-batches" className="text-sm text-primary">Abrir lotes</Link></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{Object.entries(batchStatusLabel).map(([status, label]) => <div key={status} className="border-y border-border py-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{dashboard.data.batchesByStatus[status] ?? 0}</p></div>)}</div></div></section>;
}

function UnitList({ title, items }: { title: string; items: Array<{ name: string; quantity: number }> }) {
  const maximum = Math.max(...items.map((item) => item.quantity), 1);
  return <div><h2 className="font-semibold">{title}</h2><div className="mt-3 divide-y border-y border-border">{items.map((item, index) => <div key={`${item.name}:${index}`} className="py-3"><div className="flex justify-between gap-4 text-sm"><span>{item.name}</span><strong>{item.quantity}</strong></div><div className="mt-2 h-1.5 bg-muted"><div className="h-full bg-primary" style={{ width: `${(item.quantity / maximum) * 100}%` }} /></div></div>)}{!items.length && <p className="py-4 text-sm text-muted-foreground">Nenhuma venda confirmada.</p>}</div></div>;
}
