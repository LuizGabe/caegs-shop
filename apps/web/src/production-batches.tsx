import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, CheckSquare, Download, MapPin, PackageCheck, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { currency, downloadCsv, request } from "./lib";

type BatchStatus = "DRAFT" | "SENT_TO_PRODUCTION" | "RECEIVED" | "READY_FOR_PICKUP" | "CLOSED";
type BatchListItem = { id: string; code: string; name: string; status: BatchStatus; createdAt: string; _count: { orders: number } };
type BatchOrder = { id: string; publicId: string; user: { name: string; email: string }; total: number; fulfillmentStatus: string; items: Array<{ id: string; productName: string; variantName: string; quantity: number }> };
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
type EligibleOrder = { id: string; publicId: string; user: { name: string; email: string }; total: number; associated: boolean; items: Array<{ productName: string; variantName: string; quantity: number }> };

const statusLabel: Record<BatchStatus, string> = {
  DRAFT: "Rascunho",
  SENT_TO_PRODUCTION: "Enviado para producao",
  RECEIVED: "Recebido",
  READY_FOR_PICKUP: "Pronto para retirada",
  CLOSED: "Fechado"
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
  const batches = useQuery({ queryKey: ["production-batches"], queryFn: () => request<{ batches: BatchListItem[] }>("/admin/production-batches") });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const createBatch = useMutation({
    mutationFn: (name: string) => request<{ batch: Batch }>("/admin/production-batches", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: async ({ batch }) => { setSelectedId(batch.id); await queryClient.invalidateQueries({ queryKey: ["production-batches"] }); }
  });
  return <section className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]"><aside><h1 className="text-xl font-semibold">Lotes de producao</h1><form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const name = String(form.get("name")); if (name.trim()) { createBatch.mutate(name); event.currentTarget.reset(); } }}><input name="name" required minLength={2} placeholder="Nome do novo lote" className="min-w-0 flex-1 rounded border border-border bg-white p-2 text-sm" /><button title="Criar lote" aria-label="Criar lote" className="h-10 w-10 shrink-0 rounded border border-border bg-white"><Plus className="mx-auto" size={18} /></button></form>{createBatch.error && <p className="mt-2 text-sm text-red-700">{createBatch.error.message}</p>}<div className="mt-5 divide-y border-y border-border">{batches.data?.batches.map((batch) => <button key={batch.id} onClick={() => setSelectedId(batch.id)} className={`w-full px-2 py-3 text-left ${selectedId === batch.id ? "bg-muted" : ""}`}><span className="block font-medium">{batch.name}</span><span className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{statusLabel[batch.status]}</span><span>{batch._count.orders} pedidos</span></span></button>)}{!batches.isLoading && !batches.data?.batches.length && <p className="py-4 text-sm text-muted-foreground">Nenhum lote criado.</p>}</div></aside><div>{selectedId ? <BatchDetail batchId={selectedId} /> : <div className="border-l-4 border-border py-8 pl-6"><PackageCheck size={32} className="text-muted-foreground" /><h2 className="mt-3 text-xl font-semibold">Selecione um lote</h2></div>}</div></section>;
}

function BatchDetail({ batchId }: { batchId: string }) {
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ["production-batch", batchId], queryFn: () => request<{ batch: Batch }>(`/admin/production-batches/${batchId}`) });
  const transition = useMutation({
    mutationFn: (status: BatchStatus) => request<{ batch: Batch }>(`/admin/production-batches/${batchId}/transition`, { method: "POST", body: JSON.stringify({ status }) }),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["production-batch", batchId] }), queryClient.invalidateQueries({ queryKey: ["production-batches"] })]); }
  });
  const markPickedUp = useMutation({
    mutationFn: (publicId: string) => request(`/admin/orders/${publicId}/pickup`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["production-batch", batchId] }); }
  });
  const exportProduction = useMutation({ mutationFn: () => downloadCsv(`/admin/reports/production-batches/${batchId}.csv`, `producao-${batchId}.csv`) });
  if (detail.isLoading) return <p>Carregando lote...</p>;
  if (detail.error || !detail.data) return <p className="text-red-700">{detail.error?.message ?? "Lote nao encontrado."}</p>;
  const batch = detail.data.batch;
  const next = nextStatus[batch.status];
  const regularNext = next === "READY_FOR_PICKUP" ? null : next;
  return <div><header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5"><div><p className="text-sm text-muted-foreground">{batch.code}</p><h2 className="mt-1 text-2xl font-semibold">{batch.name}</h2><span className="mt-2 inline-block rounded bg-muted px-2 py-1 text-xs font-medium">{statusLabel[batch.status]}</span></div><div className="flex flex-wrap gap-2"><button disabled={exportProduction.isPending} onClick={() => exportProduction.mutate()} className="inline-flex items-center gap-2 rounded border border-border bg-white px-3 py-2 text-sm disabled:opacity-50"><Download size={17} />CSV de producao</button>{regularNext && <button disabled={transition.isPending} onClick={() => transition.mutate(regularNext)} className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">{statusLabel[regularNext]}<ArrowRight size={17} /></button>}</div></header>{(transition.error || exportProduction.error) && <p className="mt-3 text-sm text-red-700">{transition.error?.message ?? exportProduction.error?.message}</p>}{batch.notes && <p className="mt-5 whitespace-pre-line text-sm text-muted-foreground">{batch.notes}</p>}{batch.status === "DRAFT" && <OrderSelector batchId={batchId} />}{["RECEIVED", "READY_FOR_PICKUP"].includes(batch.status) && <PickupEditor batch={batch} />}{batch.summary.length > 0 && <BatchSummary summary={batch.summary} />}<div className="mt-8"><h3 className="font-semibold">Pedidos no lote <span className="text-muted-foreground">({batch.orders.length})</span></h3>{markPickedUp.error && <p className="mt-2 text-sm text-red-700">{markPickedUp.error.message}</p>}<div className="mt-3 divide-y border-y border-border">{batch.orders.map((order) => <div key={order.id} className="grid gap-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="font-medium">{order.user.name}</p><p className="text-xs text-muted-foreground">{order.publicId} - {order.items.map((item) => `${item.productName} ${item.variantName} x${item.quantity}`).join(", ")}</p><p className="mt-1 text-xs font-medium">{order.fulfillmentStatus === "PICKED_UP" ? "Retirado" : order.fulfillmentStatus === "READY_FOR_PICKUP" ? "Disponivel" : "Em andamento"}</p></div><div className="flex flex-wrap items-center gap-3"><span className="text-sm font-medium">{currency.format(order.total)}</span>{order.fulfillmentStatus === "READY_FOR_PICKUP" && <button disabled={markPickedUp.isPending} onClick={() => markPickedUp.mutate(order.publicId)} className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"><CheckCircle2 size={17} />Marcar como retirado</button>}</div></div>)}</div></div><div className="mt-8"><h3 className="font-semibold">Historico</h3><div className="mt-3 divide-y border-y border-border">{batch.auditLogs.map((log) => <div key={log.id} className="flex justify-between gap-4 py-3 text-sm"><span>{auditLabel(log.action)}</span><time className="shrink-0 text-muted-foreground">{new Date(log.createdAt).toLocaleString("pt-BR")}</time></div>)}</div></div></div>;
}

function PickupEditor({ batch }: { batch: Batch }) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (payload: Record<string, string | null>) => request(`/admin/production-batches/${batch.id}/pickup`, { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["production-batch", batch.id] }), queryClient.invalidateQueries({ queryKey: ["production-batches"] })]); }
  });
  return <form className="mt-8 border-y border-border py-5" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); save.mutate({ location: String(data.get("location")), notes: String(data.get("notes")) || null, date: String(data.get("date")) || null, time: String(data.get("time")) || null }); }}><div className="flex items-center gap-2"><MapPin size={19} /><h3 className="font-semibold">Retirada presencial</h3></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">Local<input name="location" required minLength={2} defaultValue={batch.pickupLocation ?? ""} placeholder="Sala do Centro Academico" className="mt-1 w-full rounded border border-border bg-white p-2" /></label><label className="text-sm font-medium">Data, opcional<input name="date" type="date" defaultValue={batch.pickupDate ?? ""} className="mt-1 w-full rounded border border-border bg-white p-2" /></label><label className="text-sm font-medium">Horario, opcional<input name="time" type="time" defaultValue={batch.pickupTime ?? ""} className="mt-1 w-full rounded border border-border bg-white p-2" /></label><label className="text-sm font-medium sm:col-span-2">Observacoes<textarea name="notes" defaultValue={batch.pickupNotes ?? ""} placeholder="Retirada das 18h as 21h." className="mt-1 min-h-20 w-full rounded border border-border bg-white p-2" /></label></div><button disabled={save.isPending} className="mt-4 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{batch.status === "RECEIVED" ? "Disponibilizar lote para retirada" : "Atualizar informacoes"}</button>{save.error && <p className="mt-2 text-sm text-red-700">{save.error.message}</p>}</form>;
}

function OrderSelector({ batchId }: { batchId: string }) {
  const queryClient = useQueryClient();
  const eligible = useQuery({ queryKey: ["batch-eligible-orders", batchId], queryFn: () => request<{ orders: EligibleOrder[] }>(`/admin/production-batches/${batchId}/eligible-orders?pageSize=100`) });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => { setSelected(new Set()); }, [batchId, eligible.dataUpdatedAt]);
  const associate = useMutation({
    mutationFn: () => request(`/admin/production-batches/${batchId}/orders`, { method: "PUT", body: JSON.stringify({ orderIds: [...selected] }) }),
    onSuccess: async () => { setSelected(new Set()); await Promise.all([queryClient.invalidateQueries({ queryKey: ["production-batch", batchId] }), queryClient.invalidateQueries({ queryKey: ["batch-eligible-orders", batchId] }), queryClient.invalidateQueries({ queryKey: ["production-batches"] })]); }
  });
  const available = eligible.data?.orders.filter((order) => !order.associated) ?? [];
  return <div className="mt-8"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Pedidos elegiveis</h3><div className="flex gap-2"><button disabled={!available.length} onClick={() => setSelected(new Set(available.map((order) => order.id)))} className="inline-flex items-center gap-2 rounded border border-border bg-white px-3 py-2 text-sm disabled:opacity-50"><CheckSquare size={17} />Selecionar todos</button><button disabled={!selected.size || associate.isPending} onClick={() => associate.mutate()} className="rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Confirmar associacao</button></div></div>{associate.error && <p className="mt-2 text-sm text-red-700">{associate.error.message}</p>}<div className="mt-3 divide-y border-y border-border">{eligible.data?.orders.map((order) => <label key={order.id} className={`grid grid-cols-[24px_1fr_auto] items-center gap-3 py-3 ${order.associated ? "text-muted-foreground" : ""}`}><input type="checkbox" checked={order.associated || selected.has(order.id)} disabled={order.associated} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(order.id); else next.delete(order.id); return next; })} /><span><span className="block text-sm font-medium">{order.user.name}</span><span className="block text-xs">{order.publicId} - {order.items.map((item) => `${item.productName} ${item.variantName} x${item.quantity}`).join(", ")}</span></span><span className="text-sm">{currency.format(order.total)}</span></label>)}{!eligible.isLoading && !eligible.data?.orders.length && <p className="py-4 text-sm text-muted-foreground">Nenhum pedido pago elegivel.</p>}</div></div>;
}

function BatchSummary({ summary }: { summary: Batch["summary"] }) {
  return <div className="mt-8"><h3 className="font-semibold">Resumo para producao</h3><div className="mt-3 divide-y border-y border-border">{summary.map((product) => <div key={product.productId} className="grid gap-3 py-4 sm:grid-cols-[1fr_2fr_auto]"><div className="font-medium">{product.productName}</div><div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">{product.variants.map((variant) => <span key={variant.productVariantId}><strong>{variant.variantName}</strong>: {variant.quantity}</span>)}</div><div className="text-sm font-medium">Total {product.totalQuantity}</div></div>)}</div></div>;
}

function auditLabel(action: string) {
  if (action === "PRODUCTION_BATCH_CREATED") return "Lote criado";
  if (action === "PRODUCTION_BATCH_ORDERS_ADDED") return "Pedidos associados";
  if (action === "PRODUCTION_BATCH_STATUS_CHANGED") return "Status atualizado";
  if (action === "PRODUCTION_BATCH_PICKUP_PUBLISHED") return "Retirada disponibilizada";
  if (action === "PRODUCTION_BATCH_PICKUP_UPDATED") return "Informacoes de retirada atualizadas";
  return action;
}
