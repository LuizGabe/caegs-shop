import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock3, MapPin, Package, Calendar, AlertCircle } from "lucide-react";
import { GlassCard } from "./components/ui/GlassCard";
import { Badge, type BadgeProps } from "./components/ui/Badge";
import { Skeleton } from "./components/ui/Skeleton";
import { EmptyState } from "./components/ui/EmptyState";
import { apiUrl, currency, request } from "./lib";

type Order = {
  id: string;
  publicId: string;
  humanReadableId: string;
  orderNumber: number;
  orderYear: number;
  fulfillmentStatus: string;
  paymentStatus: string;
  total: number;
  createdAt: string;
  items: Array<{ id: string; productNameSnapshot: string; variantNameSnapshot: string; quantity: number; thumbnailUrl: string | null; thumbnailAltText: string | null }>;
  pickup: {
    available: boolean;
    pickedUp: boolean;
    location: string | null;
    notes: string | null;
    date: string | null;
    time: string | null;
  };
};

const fulfillmentConfig: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  WAITING_PAYMENT: { label: "Aguardando Pagamento", variant: "amber" },
  PAID: { label: "Pago - Aguardando Produção", variant: "blue" },
  WAITING_PRODUCTION: { label: "Aguardando Produção", variant: "blue" },
  IN_PRODUCTION: { label: "Em Produção", variant: "indigo" },
  RECEIVED_FROM_SUPPLIER: { label: "Recebido do Fabricante", variant: "cyan" },
  READY_FOR_PICKUP: { label: "Disponível para Retirada", variant: "blue" },
  PICKED_UP: { label: "Retirado", variant: "slate" },
  CANCELLED: { label: "Cancelado", variant: "rose" }
};

export function OrdersPage() {
  const orders = useQuery({ queryKey: ["my-orders"], queryFn: () => request<{ orders: Order[] }>("/orders") });

  if (orders.isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (orders.error) {
    return (
      <EmptyState
        icon={<AlertCircle size={28} />}
        title="Erro ao carregar pedidos"
        description={orders.error.message}
      />
    );
  }

  const orderList = orders.data?.orders ?? [];

  if (!orderList.length) {
    return (
      <EmptyState
        icon={<Package size={32} />}
        title="Nenhum pedido realizado"
        description="Você ainda não comprou itens oficiais pelo sistema do Centro Acadêmico."
      />
    );
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header className="border-b border-slate-200/80 pb-4">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Meus Pedidos</h1>
        <p className="mt-1 text-xs text-slate-500">
          Acompanhe o status da produção de suas compras e as informações para retirada presencial.
        </p>
      </header>

      <div className="space-y-4">
        {orderList.map((order) => {
          const config = fulfillmentConfig[order.fulfillmentStatus] || {
            label: order.fulfillmentStatus,
            variant: "slate"
          };

          return (
            <GlassCard key={order.id} className="p-6 overflow-hidden">
              {/* Order Top Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                    Pedido #{order.humanReadableId}
                  </span>
                  <p className="mt-1 text-[11px] text-slate-400 font-mono break-all">Referência técnica: {order.publicId}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant={config.variant} dot>
                      {config.label}
                    </Badge>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-extrabold text-slate-900">{currency.format(order.total)}</p>
                  <time className="text-xs text-slate-400 font-mono">
                    {new Date(order.createdAt).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric"
                    })}
                  </time>
                </div>
              </div>

              {/* Items List */}
              <div className="py-4 space-y-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Itens do pedido</p>
                <div className="divide-y divide-slate-100 rounded-xl bg-slate-50/70 border border-slate-200/60 px-4">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-xs sm:text-sm">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white flex items-center justify-center">
                          {item.thumbnailUrl ? (
                            <img src={`${apiUrl}${item.thumbnailUrl}`} alt={item.thumbnailAltText || item.productNameSnapshot} className="h-full w-full object-cover" />
                          ) : (
                            <Package size={18} className="text-slate-300" />
                          )}
                        </div>
                        <div className="font-medium text-slate-800 min-w-0">
                          <span className="line-clamp-1">{item.productNameSnapshot}</span>
                          <span className="text-slate-400 text-xs font-normal">
                            {item.variantNameSnapshot}
                          </span>
                        </div>
                      </div>
                      <span className="font-bold text-slate-700 bg-white px-2 py-0.5 rounded-md border border-slate-200 text-xs shrink-0">
                        x{item.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pickup Information Section */}
              <PickupStatus pickup={order.pickup} />
            </GlassCard>
          );
        })}
      </div>
    </section>
  );
}

function PickupStatus({ pickup }: { pickup: Order["pickup"] }) {
  if (pickup.pickedUp) {
    return (
      <div className="mt-2 p-4 rounded-xl bg-blue-50/80 border border-blue-200/80 flex items-center gap-3 text-xs font-semibold text-blue-900">
        <CheckCircle2 size={20} className="text-blue-600 shrink-0" />
        <span>Pedido já retirado no Centro Acadêmico!</span>
      </div>
    );
  }

  if (!pickup.available) {
    return (
      <div className="mt-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center gap-2.5 text-xs text-slate-500">
        <Clock3 size={16} className="text-slate-400 shrink-0" />
        <span>Ainda não disponível para retirada presencial.</span>
      </div>
    );
  }

  return (
    <div className="mt-3 p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50/60 border border-blue-200 shadow-xs">
      <div className="flex items-center gap-2 text-blue-900 font-bold text-sm mb-3">
        <MapPin size={18} className="text-blue-700" />
        <span className="uppercase tracking-wide text-xs">Disponível para Retirada Presencial</span>
      </div>

      <div className="space-y-2 text-xs text-blue-950">
        {pickup.location && (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-blue-800 shrink-0">Local:</span>
            <span className="bg-white/80 px-2.5 py-1 rounded-lg border border-blue-200 font-medium">
              {pickup.location}
            </span>
          </div>
        )}

        {(pickup.date || pickup.time) && (
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-blue-700 shrink-0" />
            <span className="font-semibold text-blue-800 shrink-0">Data/Horário:</span>
            <span className="bg-white/80 px-2.5 py-1 rounded-lg border border-blue-200 font-medium">
              {pickup.date ? formatDate(pickup.date) : ""}
              {pickup.date && pickup.time ? " às " : ""}
              {pickup.time ?? ""}
            </span>
          </div>
        )}

        {pickup.notes && (
          <div className="mt-3 pt-2 border-t border-blue-200/60 text-blue-900 text-xs whitespace-pre-line leading-relaxed">
            <strong className="font-semibold block mb-0.5 text-blue-800">Observações de retirada:</strong>
            {pickup.notes}
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}




