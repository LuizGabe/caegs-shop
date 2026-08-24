import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, CheckSquare, Download, MapPin, PackageCheck, Plus, ShieldAlert, Boxes } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./components/ui/Button";
import { GlassCard } from "./components/ui/GlassCard";
import { Badge, type BadgeProps } from "./components/ui/Badge";
import { Skeleton } from "./components/ui/Skeleton";
import { EmptyState } from "./components/ui/EmptyState";
import { currency, downloadCsv, request } from "./lib";

type BatchStatus = "DRAFT" | "SENT_TO_PRODUCTION" | "RECEIVED" | "READY_FOR_PICKUP" | "CLOSED";
type BatchListItem = { id: string; code: string; name: string; status: BatchStatus; createdAt: string; _count: { orders: number } };
type BatchOrder = { id: string; publicId: string; humanReadableId: string; orderNumber: number; orderYear: number; user: { name: string; email: string }; total: number; fulfillmentStatus: string; items: Array<{ id: string; productName: string; variantName: string; quantity: number }> };
type Batch = BatchListItem & {
  notes: string | null;
  pickupLocation: string | null;
  pickupNotes: string | null;
  pickupDate: string | null;
  pickupTime: string | null;
  closedAt: string | null;
  orders: BatchOrder[];
  summary: Array<{ productId: string; productName: string; totalQuantity: number; variants: Array<{ productVariantId: string; variantName: string; quantity: number }> }>;
  auditLogs: Array<{ id: string; action: string; metadata: Record<string, unknown>; createdAt: string }>;
};
type EligibleOrder = { id: string; publicId: string; humanReadableId: string; orderNumber: number; orderYear: number; user: { name: string; email: string }; total: number; associated: boolean; items: Array<{ productName: string; variantName: string; quantity: number }> };

const statusConfig: Record<BatchStatus, { label: string; variant: BadgeProps["variant"] }> = {
  DRAFT: { label: "Rascunho", variant: "slate" },
  SENT_TO_PRODUCTION: { label: "Enviado para Produção", variant: "blue" },
  RECEIVED: { label: "Recebido do Fabricante", variant: "indigo" },
  READY_FOR_PICKUP: { label: "Pronto para Retirada", variant: "blue" },
  CLOSED: { label: "Fechado", variant: "slate" }
};

const nextStatus: Record<BatchStatus, BatchStatus | null> = {
  DRAFT: "SENT_TO_PRODUCTION",
  SENT_TO_PRODUCTION: "RECEIVED",
  RECEIVED: "READY_FOR_PICKUP",
  READY_FOR_PICKUP: "CLOSED",
  CLOSED: null
};

export function ProductionBatchesPage() {
  const queryClient = useQueryClient();
  const batches = useQuery({
    queryKey: ["production-batches"],
    queryFn: () => request<{ batches: BatchListItem[] }>("/admin/production-batches")
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const createBatch = useMutation({
    mutationFn: (name: string) =>
      request<{ batch: Batch }>("/admin/production-batches", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: async ({ batch }) => {
      setSelectedId(batch.id);
      await queryClient.invalidateQueries({ queryKey: ["production-batches"] });
    }
  });

  if (batches.isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Skeleton className="h-80 w-full rounded-2xl" />
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    );
  }

  if (batches.error) {
    return (
      <EmptyState
        icon={<ShieldAlert size={32} className="text-rose-600" />}
        title="Acesso Negado"
        description={batches.error.message}
      />
    );
  }

  return (
    <section className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* Batches Sidebar */}
      <aside className="space-y-4">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Lotes de Produção</h1>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const name = String(form.get("name"));
            if (name.trim()) {
              createBatch.mutate(name);
              event.currentTarget.reset();
            }
          }}
        >
          <input
            name="name"
            required
            minLength={2}
            placeholder="Nome do novo lote..."
            className="min-w-0 flex-1 h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none"
          />
          <Button type="submit" size="sm" variant="primary" isLoading={createBatch.isPending}>
            <Plus size={16} />
          </Button>
        </form>

        {createBatch.error && (
          <p className="text-xs text-rose-700 bg-rose-50 p-2.5 rounded-xl border border-rose-200">{createBatch.error.message}</p>
        )}

        <div className="space-y-2">
          {batches.data?.batches.map((batch) => {
            const isSelected = selectedId === batch.id;
            const config = statusConfig[batch.status];
            return (
              <button
                key={batch.id}
                onClick={() => setSelectedId(batch.id)}
                className={`w-full text-left p-3.5 rounded-xl border transition-all active-press ${
                  isSelected
                    ? "bg-blue-50 border-blue-500 shadow-xs"
                    : "bg-white/80 border-slate-200/80 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-slate-900">{batch.name}</span>
                  <Badge variant={config.variant}>{config.label}</Badge>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                  <span className="font-mono">{batch.code}</span>
                  <span>{batch._count.orders} pedidos</span>
                </div>
              </button>
            );
          })}
          {!batches.data?.batches.length && (
            <p className="text-xs text-slate-400 p-4 text-center">Nenhum lote de produção criado.</p>
          )}
        </div>
      </aside>

      {/* Detail Area */}
      <div>
        {selectedId ? (
          <BatchDetail batchId={selectedId} />
        ) : (
          <EmptyState
            icon={<Boxes size={32} />}
            title="Selecione um Lote"
            description="Escolha um lote na lista lateral para gerenciar pedidos, atualizações e informações de retirada presencial."
          />
        )}
      </div>
    </section>
  );
}

function BatchDetail({ batchId }: { batchId: string }) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["production-batch", batchId],
    queryFn: () => request<{ batch: Batch }>(`/admin/production-batches/${batchId}`)
  });

  const transition = useMutation({
    mutationFn: (status: BatchStatus) =>
      request<{ batch: Batch }>(`/admin/production-batches/${batchId}/transition`, {
        method: "POST",
        body: JSON.stringify({ status })
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["production-batch", batchId] }),
        queryClient.invalidateQueries({ queryKey: ["production-batches"] })
      ]);
    }
  });

  const markPickedUp = useMutation({
    mutationFn: (publicId: string) =>
      request(`/admin/orders/${publicId}/pickup`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["production-batch", batchId] });
    }
  });

  const exportProduction = useMutation({
    mutationFn: () => downloadCsv(`/admin/reports/production-batches/${batchId}.csv`, `producao-${batchId}.csv`)
  });

  if (detail.isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (detail.error || !detail.data) {
    return <p className="text-xs text-rose-700">{detail.error?.message ?? "Lote não encontrado."}</p>;
  }

  const batch = detail.data.batch;
  const config = statusConfig[batch.status];
  const next = nextStatus[batch.status];
  const regularNext = next === "READY_FOR_PICKUP" ? null : next;

  return (
    <GlassCard className="p-6 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <span className="text-xs font-mono text-slate-400 uppercase">{batch.code}</span>
          <h2 className="text-2xl font-bold text-slate-900 mt-0.5">{batch.name}</h2>
          <div className="mt-2">
            <Badge variant={config.variant} dot>
              {config.label}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            isLoading={exportProduction.isPending}
            onClick={() => exportProduction.mutate()}
            leftIcon={<Download size={16} />}
          >
            Exportar CSV
          </Button>

          {regularNext && (
            <Button
              size="sm"
              variant="primary"
              isLoading={transition.isPending}
              onClick={() => transition.mutate(regularNext)}
              rightIcon={<ArrowRight size={16} />}
            >
              Avançar para {statusConfig[regularNext].label}
            </Button>
          )}
        </div>
      </div>

      {(transition.error || exportProduction.error) && (
        <p className="text-xs text-rose-700 bg-rose-50 p-3 rounded-xl border border-rose-200">
          {transition.error?.message ?? exportProduction.error?.message}
        </p>
      )}

      {batch.notes && <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl">{batch.notes}</p>}

      {batch.status === "DRAFT" && <OrderSelector batchId={batchId} />}
      {["RECEIVED", "READY_FOR_PICKUP"].includes(batch.status) && <PickupEditor batch={batch} />}

      {batch.summary.length > 0 && <BatchSummary summary={batch.summary} />}

      {/* Orders List */}
      <div className="pt-4 space-y-3">
        <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
          Pedidos no Lote ({batch.orders.length})
        </h3>
        {markPickedUp.error && (
          <p className="text-xs text-rose-700 bg-rose-50 p-2.5 rounded-xl">{markPickedUp.error.message}</p>
        )}
        <div className="divide-y divide-slate-100 rounded-xl bg-slate-50/70 border border-slate-200/60 px-4">
          {batch.orders.map((order) => (
            <div key={order.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-semibold text-slate-900">{order.user.name}</span>
                <span className="text-slate-400 font-mono ml-2">#{order.humanReadableId}</span>
                <p className="text-slate-400 font-mono text-[11px] mt-0.5 break-all">Referência técnica: {order.publicId}</p>
                <p className="text-slate-500 mt-0.5">
                  {order.items.map((item) => `${item.productName} (${item.variantName}) x${item.quantity}`).join(", ")}
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="font-extrabold text-slate-900">{currency.format(order.total)}</span>
                {order.fulfillmentStatus === "READY_FOR_PICKUP" && (
                  <Button
                    size="sm"
                    variant="primary"
                    isLoading={markPickedUp.isPending}
                    onClick={() => markPickedUp.mutate(order.publicId)}
                    leftIcon={<CheckCircle2 size={14} />}
                  >
                    Marcar como Retirado
                  </Button>
                )}
                {order.fulfillmentStatus === "PICKED_UP" && (
                  <Badge variant="slate" dot>Retirado</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Audit History */}
      <div className="pt-4 border-t border-slate-100 space-y-3">
        <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">Histórico de Alterações</h3>
        <div className="divide-y divide-slate-100 text-xs">
          {batch.auditLogs.map((log) => (
            <div key={log.id} className="py-2.5 flex justify-between gap-4 text-slate-600">
              <span>{auditLabel(log.action)}</span>
              <time className="text-slate-400 font-mono">
                {new Date(log.createdAt).toLocaleString("pt-BR")}
              </time>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

function PickupEditor({ batch }: { batch: Batch }) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (payload: Record<string, string | null>) =>
      request(`/admin/production-batches/${batch.id}/pickup`, { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["production-batch", batch.id] }),
        queryClient.invalidateQueries({ queryKey: ["production-batches"] })
      ]);
    }
  });

  return (
    <form
      className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        save.mutate({
          location: String(data.get("location")),
          notes: String(data.get("notes")) || null,
          date: String(data.get("date")) || null,
          time: String(data.get("time")) || null
        });
      }}
    >
      <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
        <MapPin size={18} className="text-blue-700" />
        <span>Configurar Retirada Presencial</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Local de Retirada <span className="text-rose-600">*</span>
          </label>
          <input
            name="location"
            required
            minLength={2}
            defaultValue={batch.pickupLocation ?? ""}
            placeholder="Ex: Sala 204 - Centro Acadêmico"
            className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Data (opcional)
          </label>
          <input
            name="date"
            type="date"
            defaultValue={batch.pickupDate ?? ""}
            className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Horário (opcional)
          </label>
          <input
            name="time"
            type="time"
            defaultValue={batch.pickupTime ?? ""}
            className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Observações de Retirada
          </label>
          <textarea
            name="notes"
            rows={2}
            defaultValue={batch.pickupNotes ?? ""}
            placeholder="Orientações adicionais aos alunos..."
            className="w-full p-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none"
          />
        </div>
      </div>

      <Button type="submit" size="sm" variant="primary" isLoading={save.isPending}>
        {batch.status === "RECEIVED" ? "Disponibilizar Lote para Retirada" : "Atualizar Informações de Retirada"}
      </Button>

      {save.error && <p className="text-xs text-rose-700">{save.error.message}</p>}
    </form>
  );
}

function OrderSelector({ batchId }: { batchId: string }) {
  const queryClient = useQueryClient();
  const eligible = useQuery({
    queryKey: ["batch-eligible-orders", batchId],
    queryFn: () => request<{ orders: EligibleOrder[] }>(`/admin/production-batches/${batchId}/eligible-orders?pageSize=100`)
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelected(new Set());
  }, [batchId, eligible.dataUpdatedAt]);

  const associate = useMutation({
    mutationFn: () =>
      request(`/admin/production-batches/${batchId}/orders`, {
        method: "PUT",
        body: JSON.stringify({ orderIds: [...selected] })
      }),
    onSuccess: async () => {
      setSelected(new Set());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["production-batch", batchId] }),
        queryClient.invalidateQueries({ queryKey: ["batch-eligible-orders", batchId] }),
        queryClient.invalidateQueries({ queryKey: ["production-batches"] })
      ]);
    }
  });

  const available = eligible.data?.orders.filter((order) => !order.associated) ?? [];

  return (
    <div className="space-y-3 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
          Pedidos Elegíveis sem Lote
        </h3>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!available.length}
            onClick={() => setSelected(new Set(available.map((order) => order.id)))}
            leftIcon={<CheckSquare size={16} />}
          >
            Selecionar Todos ({available.length})
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!selected.size || associate.isPending}
            isLoading={associate.isPending}
            onClick={() => associate.mutate()}
          >
            Associar Selecionados ({selected.size})
          </Button>
        </div>
      </div>

      {associate.error && <p className="text-xs text-rose-700 bg-rose-50 p-2.5 rounded-xl">{associate.error.message}</p>}

      <div className="divide-y divide-slate-100 rounded-xl bg-slate-50/70 border border-slate-200/60 max-h-60 overflow-y-auto px-4">
        {eligible.data?.orders.map((order) => (
          <label
            key={order.id}
            className={`py-2.5 flex items-center justify-between gap-3 text-xs cursor-pointer ${
              order.associated ? "opacity-50 pointer-events-none" : "hover:bg-slate-100/50"
            }`}
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={order.associated || selected.has(order.id)}
                disabled={order.associated}
                onChange={(event) =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(order.id);
                    else next.delete(order.id);
                    return next;
                  })
                }
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600"
              />
              <div>
                <span className="font-semibold text-slate-900">{order.user.name}</span>
                <span className="text-slate-400 font-mono ml-2">#{order.humanReadableId}</span>
                <p className="text-slate-400 font-mono text-[11px] break-all">Ref: {order.publicId}</p>
                <p className="text-slate-500 text-[11px]">
                  {order.items.map((item) => `${item.productName} ${item.variantName} x${item.quantity}`).join(", ")}
                </p>
              </div>
            </div>
            <span className="font-extrabold text-slate-900">{currency.format(order.total)}</span>
          </label>
        ))}
        {!eligible.isLoading && !eligible.data?.orders.length && (
          <p className="py-4 text-xs text-slate-400 text-center">Nenhum pedido pago aguardando lote.</p>
        )}
      </div>
    </div>
  );
}

function BatchSummary({ summary }: { summary: Batch["summary"] }) {
  return (
    <div className="space-y-3 pt-2">
      <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
        Resumo de Itens para Produção
      </h3>
      <div className="divide-y divide-slate-100 rounded-xl bg-slate-50/70 border border-slate-200/60 p-4 space-y-3">
        {summary.map((product) => (
          <div key={product.productId} className="pt-3 first:pt-0">
            <div className="flex justify-between items-center text-xs font-bold text-slate-900 mb-2">
              <span>{product.productName}</span>
              <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md font-extrabold">
                Total: {product.totalQuantity} un
              </span>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-600">
              {product.variants.map((variant) => (
                <span key={variant.productVariantId} className="bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                  <strong className="text-slate-800 font-semibold">{variant.variantName}:</strong> {variant.quantity}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function auditLabel(action: string) {
  if (action === "PRODUCTION_BATCH_CREATED") return "Lote criado";
  if (action === "PRODUCTION_BATCH_ORDERS_ADDED") return "Pedidos associados ao lote";
  if (action === "PRODUCTION_BATCH_STATUS_CHANGED") return "Status de produção atualizado";
  if (action === "PRODUCTION_BATCH_PICKUP_PUBLISHED") return "Retirada disponibilizada";
  if (action === "PRODUCTION_BATCH_PICKUP_UPDATED") return "Informações de retirada atualizadas";
  return action;
}

