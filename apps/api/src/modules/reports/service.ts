import { prisma } from "../../plugins/prisma.js";

export async function dashboardData() {
  const [
    totalOrders,
    paidOrders,
    awaitingPayment,
    inProduction,
    readyForPickup,
    pickedUp,
    confirmedValue,
    soldItems,
    batches,
    batchStatuses
  ] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { paymentStatus: "CONFIRMED" } }),
    prisma.order.count({ where: { paymentStatus: "PENDING" } }),
    prisma.order.count({ where: { fulfillmentStatus: "IN_PRODUCTION" } }),
    prisma.order.count({ where: { fulfillmentStatus: "READY_FOR_PICKUP" } }),
    prisma.order.count({ where: { fulfillmentStatus: "PICKED_UP" } }),
    prisma.payment.aggregate({ where: { status: "CONFIRMED" }, _sum: { amount: true } }),
    prisma.orderItem.findMany({
      where: { order: { paymentStatus: "CONFIRMED" } },
      select: { productId: true, productVariantId: true, productNameSnapshot: true, variantNameSnapshot: true, quantity: true }
    }),
    prisma.productionBatch.count({ where: { deletedAt: null } }),
    prisma.productionBatch.groupBy({ by: ["status"], where: { deletedAt: null }, _count: { _all: true } })
  ]);

  const products = new Map<string, { productId: string; name: string; quantity: number }>();
  const variants = new Map<string, { name: string; quantity: number }>();
  for (const item of soldItems) {
    const product = products.get(item.productId);
    if (product) product.quantity += item.quantity;
    else products.set(item.productId, { productId: item.productId, name: item.productNameSnapshot, quantity: item.quantity });
    const variantKey = item.variantNameSnapshot.trim().toLocaleUpperCase("pt-BR");
    const variant = variants.get(variantKey);
    if (variant) variant.quantity += item.quantity;
    else variants.set(variantKey, { name: item.variantNameSnapshot, quantity: item.quantity });
  }

  return {
    metrics: {
      totalOrders,
      paidOrders,
      awaitingPayment,
      inProduction,
      readyForPickup,
      pickedUp,
      confirmedValue: Number(confirmedValue._sum.amount ?? 0),
      batches
    },
    unitsByProduct: [...products.values()].sort((left, right) => right.quantity - left.quantity || left.name.localeCompare(right.name, "pt-BR")),
    unitsByVariant: [...variants.values()].sort((left, right) => right.quantity - left.quantity || left.name.localeCompare(right.name, "pt-BR")),
    batchesByStatus: Object.fromEntries(batchStatuses.map((entry) => [entry.status, entry._count._all]))
  };
}
