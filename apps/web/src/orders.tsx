import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock3, MapPin, Package } from "lucide-react";
import { currency, request } from "./lib";

type Order = {
  id: string;
  publicId: string;
  fulfillmentStatus: string;
  paymentStatus: string;
  total: number;
  createdAt: string;
  items: Array<{ id: string; productNameSnapshot: string; variantNameSnapshot: string; quantity: number }>;
  pickup: { available: boolean; pickedUp: boolean; location: string | null; notes: string | null; date: string | null; time: string | null };
};

const fulfillmentLabel: Record<string, string> = {
  WAITING_PAYMENT: "Aguardando pagamento",
  PAID: "Pago",
  WAITING_PRODUCTION: "Aguardando producao",
  IN_PRODUCTION: "Em producao",
  RECEIVED_FROM_SUPPLIER: "Recebido do fabricante",
  READY_FOR_PICKUP: "Disponivel para retirada",
  PICKED_UP: "Retirado",
  CANCELLED: "Cancelado"
};

export function OrdersPage() {
  const orders = useQuery({ queryKey: ["my-orders"], queryFn: () => request<{ orders: Order[] }>("/orders") });
  if (orders.isLoading) return <p>Carregando pedidos...</p>;
  if (orders.error) return <p className="text-red-700">{orders.error.message}</p>;
  return <section className="mx-auto max-w-4xl"><header className="border-b border-border pb-5"><h1 className="text-3xl font-semibold">Meus pedidos</h1><p className="mt-2 text-sm text-muted-foreground">Acompanhe a producao e as informacoes para retirada presencial.</p></header><div className="mt-6 grid gap-5">{orders.data?.orders.map((order) => <article key={order.id} className="rounded border border-border bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">Pedido {order.publicId}</p><h2 className="mt-1 font-semibold">{fulfillmentLabel[order.fulfillmentStatus] ?? order.fulfillmentStatus}</h2></div><div className="text-right"><p className="font-semibold">{currency.format(order.total)}</p><time className="text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleDateString("pt-BR")}</time></div></div><div className="mt-4 divide-y border-y border-border">{order.items.map((item) => <div key={item.id} className="flex justify-between gap-4 py-2 text-sm"><span>{item.productNameSnapshot} - {item.variantNameSnapshot}</span><span>x{item.quantity}</span></div>)}</div><PickupStatus pickup={order.pickup} /></article>)}{!orders.data?.orders.length && <div className="py-12 text-center text-muted-foreground"><Package className="mx-auto" size={36} /><p className="mt-3">Voce ainda nao possui pedidos.</p></div>}</div></section>;
}

function PickupStatus({ pickup }: { pickup: Order["pickup"] }) {
  if (pickup.pickedUp) return <div className="mt-5 flex items-center gap-2 text-sm font-medium text-emerald-800"><CheckCircle2 size={19} />Pedido retirado</div>;
  if (!pickup.available) return <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Clock3 size={19} />Ainda nao disponivel para retirada</div>;
  return <div className="mt-5 border-l-4 border-emerald-600 pl-4"><p className="font-semibold text-emerald-800">Disponivel para retirada</p>{pickup.location && <p className="mt-2 flex items-center gap-2 text-sm"><MapPin size={17} />{pickup.location}</p>}{(pickup.date || pickup.time) && <p className="mt-2 flex items-center gap-2 text-sm"><Clock3 size={17} />{pickup.date ? formatDate(pickup.date) : ""}{pickup.date && pickup.time ? " as " : ""}{pickup.time ?? ""}</p>}{pickup.notes && <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{pickup.notes}</p>}</div>;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
