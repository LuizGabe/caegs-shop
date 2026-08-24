import { useMutation, useQuery } from "@tanstack/react-query";
import { Banknote, Boxes, CheckCircle2, Clock3, Download, Factory, Mail, PackageCheck, ShoppingCart, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "./components/ui/Button";
import { GlassCard } from "./components/ui/GlassCard";
import { Skeleton } from "./components/ui/Skeleton";
import { EmptyState } from "./components/ui/EmptyState";
import { currency, downloadCsv, request } from "./lib";

type Dashboard = {
  metrics: {
    totalOrders: number;
    paidOrders: number;
    awaitingPayment: number;
    inProduction: number;
    readyForPickup: number;
    pickedUp: number;
    confirmedValue: number;
    batches: number;
  };
  unitsByProduct: Array<{ productId: string; name: string; quantity: number }>;
  unitsByVariant: Array<{ name: string; quantity: number }>;
  batchesByStatus: Record<string, number>;
};

const batchStatusLabel: Record<string, string> = {
  DRAFT: "Rascunho",
  SENT_TO_PRODUCTION: "Enviado p/ Produção",
  RECEIVED: "Recebido do Fabricante",
  READY_FOR_PICKUP: "Pronto p/ Retirada",
  CLOSED: "Fechado"
};

export function DashboardPage() {
  const dashboard = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => request<Dashboard>("/admin/dashboard")
  });
  const emailSettings = useQuery({
    queryKey: ["admin-email-settings"],
    queryFn: () => request<{ enabled: boolean }>("/admin/settings/emails")
  });

  const updateEmailSettings = useMutation({
    mutationFn: (enabled: boolean) =>
      request<{ enabled: boolean }>("/admin/settings/emails", {
        method: "PATCH",
        body: JSON.stringify({ enabled })
      }),
    onSuccess: async () => {
      await emailSettings.refetch();
    }
  });

  const [exportError, setExportError] = useState("");

  if (dashboard.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (dashboard.error || !dashboard.data) {
    return (
      <EmptyState
        icon={<ShieldAlert size={32} className="text-rose-600" />}
        title="Acesso Negado"
        description="Esta área é reservada exclusivamente para administradores do Centro Acadêmico."
        action={
          <Link to="/">
            <Button variant="outline">Voltar para a página inicial</Button>
          </Link>
        }
      />
    );
  }

  const { metrics } = dashboard.data;

  const metricItems = [
    { label: "Total de Pedidos", value: metrics.totalOrders, icon: ShoppingCart, color: "text-slate-700", bg: "bg-slate-100" },
    { label: "Pedidos Pagos", value: metrics.paidOrders, icon: CheckCircle2, color: "text-blue-700", bg: "bg-blue-50" },
    { label: "Aguardando PIX", value: metrics.awaitingPayment, icon: Clock3, color: "text-amber-700", bg: "bg-amber-50" },
    { label: "Em Produção", value: metrics.inProduction, icon: Factory, color: "text-sky-700", bg: "bg-sky-50" },
    { label: "Prontos p/ Retirada", value: metrics.readyForPickup, icon: PackageCheck, color: "text-cyan-700", bg: "bg-cyan-50" },
    { label: "Retirados", value: metrics.pickedUp, icon: CheckCircle2, color: "text-indigo-700", bg: "bg-indigo-50" },
    { label: "Valor Confirmado", value: currency.format(metrics.confirmedValue), icon: Banknote, color: "text-blue-800", bg: "bg-blue-100/70" },
    { label: "Lotes Criados", value: metrics.batches, icon: Boxes, color: "text-indigo-700", bg: "bg-indigo-50" }
  ];

  return (
    <section className="space-y-8">
      {/* Header Admin */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Painel Administrativo</h1>
          <p className="mt-1 text-xs text-slate-500">
            Visão geral de vendas, unidades vendidas e controle do Centro Acadêmico.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link to="/admin/products">
            <Button variant="outline" size="sm">Gerenciar Produtos</Button>
          </Link>
          <Link to="/admin/production-batches">
            <Button variant="outline" size="sm">Gerenciar Lotes</Button>
          </Link>
          <Link to="/admin/users">
            <Button variant="outline" size="sm">Gerenciar Usuários</Button>
          </Link>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Download size={16} />}
            onClick={async () => {
              setExportError("");
              try {
                await downloadCsv("/admin/reports/orders.csv", "pedidos.csv");
              } catch (error) {
                setExportError((error as Error).message);
              }
            }}
          >
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Email settings banner */}
      <GlassCard className="p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
            <Mail size={18} />
          </div>
          <div>
            <span className="block font-semibold text-sm text-slate-900">Envio Automático de E-mails</span>
            <span className="text-xs text-slate-500">Disparo de notificações sobre pagamentos e retiradas.</span>
          </div>
        </div>

        <label className="inline-flex items-center gap-3 cursor-pointer text-xs font-semibold text-slate-700">
          <span>{emailSettings.data?.enabled ? "Ativado" : "Desativado"}</span>
          <input
            type="checkbox"
            checked={emailSettings.data?.enabled ?? false}
            disabled={emailSettings.isLoading || updateEmailSettings.isPending}
            onChange={(event) => updateEmailSettings.mutate(event.target.checked)}
            className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600"
          />
        </label>
      </GlassCard>

      {updateEmailSettings.error && (
        <p className="text-xs text-rose-700 bg-rose-50 p-3 rounded-xl border border-rose-200">{updateEmailSettings.error.message}</p>
      )}
      {exportError && (
        <p className="text-xs text-rose-700 bg-rose-50 p-3 rounded-xl border border-rose-200">{exportError}</p>
      )}

      {/* Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricItems.map(({ label, value, icon: Icon, color, bg }) => (
          <GlassCard key={label} className="p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
              <div className={`w-8 h-8 rounded-xl ${bg} ${color} flex items-center justify-center`}>
                <Icon size={18} />
              </div>
            </div>
            <p className="mt-4 text-2xl font-extrabold text-slate-900 tracking-tight">{value}</p>
          </GlassCard>
        ))}
      </div>

      {/* Units Breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard className="p-6">
          <UnitList title="Unidades Vendidas por Produto" items={dashboard.data.unitsByProduct} />
        </GlassCard>
        <GlassCard className="p-6">
          <UnitList title="Unidades por Tamanho / Variante" items={dashboard.data.unitsByVariant} />
        </GlassCard>
      </div>

      {/* Batches Overview */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div>
            <h2 className="font-bold text-slate-900 text-base">Lotes de Produção</h2>
            <p className="text-xs text-slate-500">Resumo da situação dos lotes cadastrados.</p>
          </div>
          <Link to="/admin/production-batches" className="text-xs font-bold text-blue-700 hover:underline">
            Abrir Lotes →
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Object.entries(batchStatusLabel).map(([status, label]) => (
            <div key={status} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <span className="text-[11px] text-slate-500 font-medium block">{label}</span>
              <span className="text-xl font-extrabold text-slate-900 mt-1 block">
                {dashboard.data.batchesByStatus[status] ?? 0}
              </span>
            </div>
          ))}
        </div>
      </GlassCard>
    </section>
  );
}

function UnitList({ title, items }: { title: string; items: Array<{ name: string; quantity: number }> }) {
  const maximum = Math.max(...items.map((item) => item.quantity), 1);
  return (
    <div>
      <h2 className="font-bold text-slate-900 text-base mb-4">{title}</h2>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={`${item.name}:${index}`} className="space-y-1">
            <div className="flex justify-between gap-4 text-xs font-medium text-slate-800">
              <span>{item.name}</span>
              <span className="font-extrabold text-slate-900">{item.quantity} un</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-300"
                style={{ width: `${(item.quantity / maximum) * 100}%` }}
              />
            </div>
          </div>
        ))}
        {!items.length && <p className="py-4 text-xs text-slate-400">Nenhuma venda confirmada até o momento.</p>}
      </div>
    </div>
  );
}
