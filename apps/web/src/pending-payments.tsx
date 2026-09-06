import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Mail, RefreshCw, Send, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Badge } from "./components/ui/Badge";
import { Button } from "./components/ui/Button";
import { EmptyState } from "./components/ui/EmptyState";
import { GlassCard } from "./components/ui/GlassCard";
import { Skeleton } from "./components/ui/Skeleton";
import { currency, request, type AdminPendingPaymentOrder } from "./lib";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function PendingPaymentsPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: ["admin-pending-payments"],
    queryFn: () => request<{ orders: AdminPendingPaymentOrder[] }>("/admin/orders/pending-payment")
  });

  const sendReminder = useMutation({
    mutationFn: (publicId: string) => request<{ ok: true }>(`/admin/orders/${publicId}/payment-reminder`, { method: "POST" }),
    onSuccess: async (_data, publicId) => {
      setMessage(`Aviso enviado para o pedido #${orderLabel(query.data?.orders, publicId)}.`);
      await queryClient.invalidateQueries({ queryKey: ["admin-pending-payments"] });
    },
    onError: (error) => setMessage((error as Error).message)
  });

  const sendTest = useMutation({
    mutationFn: (publicId: string) => request<{ ok: true; to: string }>(`/admin/orders/${publicId}/payment-reminder/test`, { method: "POST" }),
    onSuccess: (data, publicId) => setMessage(`Teste do pedido #${orderLabel(query.data?.orders, publicId)} enviado para ${data.to}.`),
    onError: (error) => setMessage((error as Error).message)
  });

  if (query.isLoading) {
    return (
      <section className="space-y-5">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </section>
    );
  }

  if (query.error || !query.data) {
    return (
      <EmptyState
        icon={<ShieldAlert size={32} className="text-rose-600" />}
        title="Nao foi possivel carregar pedidos pendentes"
        description={query.error?.message ?? "Tente novamente em alguns instantes."}
      />
    );
  }

  const orders = query.data.orders;

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Pedidos aguardando PIX</h1>
          <p className="mt-1 text-xs text-slate-500">Envie aviso individual para pedidos ainda nao pagos com a data de vencimento do PIX.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<RefreshCw size={15} />}
          isLoading={query.isFetching}
          onClick={() => query.refetch()}
          className="w-full sm:w-auto"
        >
          Atualizar
        </Button>
      </header>

      {message && (
        <p className={`rounded-xl border p-3 text-xs font-medium ${message.includes("enviado") ? "border-blue-200 bg-blue-50 text-blue-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
          {message}
        </p>
      )}

      {!orders.length && (
        <EmptyState
          icon={<Clock3 size={32} className="text-blue-700" />}
          title="Nenhum pedido aguardando PIX"
          description="Quando houver pedidos pendentes, eles aparecerao aqui para envio do aviso."
        />
      )}

      <div className="space-y-4">
        {orders.map((order) => {
          const isSendingReminder = sendReminder.isPending && sendReminder.variables === order.publicId;
          const isSendingTest = sendTest.isPending && sendTest.variables === order.publicId;
          return (
            <GlassCard key={order.id} className="p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-extrabold text-slate-900">#{order.humanReadableId}</span>
                    <Badge variant="amber">Aguardando PIX</Badge>
                    <span className="text-xs text-slate-500">{currency.format(order.total)}</span>
                  </div>

                  <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                    <div>
                      <span className="block font-semibold uppercase tracking-wider text-slate-400">Comprador</span>
                      <span className="block truncate font-semibold text-slate-900">{order.user.name}</span>
                      <span className="block break-all font-mono text-[11px] text-slate-500">{order.user.email}</span>
                    </div>
                    <div>
                      <span className="block font-semibold uppercase tracking-wider text-slate-400">PIX vence em</span>
                      <span className="block font-semibold text-slate-900">{formatDate(order.payment?.pixExpiresAt)}</span>
                      <span className="block text-[11px] text-slate-500">Pedido criado em {formatDate(order.createdAt)}</span>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/60 px-3">
                    {order.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                        <div className="min-w-0">
                          <span className="block truncate font-semibold text-slate-800">{item.productNameSnapshot}</span>
                          <span className="text-slate-500">{item.variantNameSnapshot} x {item.quantity}</span>
                        </div>
                        <span className="shrink-0 font-bold text-slate-900">{currency.format(item.totalPrice)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:w-52 lg:grid-cols-1">
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<Send size={15} />}
                    isLoading={isSendingReminder}
                    disabled={sendReminder.isPending || sendTest.isPending}
                    onClick={() => sendReminder.mutate(order.publicId)}
                    className="w-full"
                  >
                    Enviar aviso
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Mail size={15} />}
                    isLoading={isSendingTest}
                    disabled={sendReminder.isPending || sendTest.isPending}
                    onClick={() => sendTest.mutate(order.publicId)}
                    className="w-full"
                  >
                    Enviar teste
                  </Button>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </section>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Nao informado";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Nao informado" : dateTime.format(date);
}

function orderLabel(orders: AdminPendingPaymentOrder[] | undefined, publicId: string) {
  return orders?.find((order) => order.publicId === publicId)?.humanReadableId ?? publicId;
}
