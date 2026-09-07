import { Prisma } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { hashToken } from "../../lib/crypto.js";
import { prisma } from "../../plugins/prisma.js";
import { requireAuthenticated } from "../auth/guards.js";
import { createHumanReadableOrderFields, createOrderSchema, createPublicOrderId, orderForApi, orderInclude } from "../orders/service.js";
import type { PaymentProvider } from "./provider.js";
import { paymentForApi, paymentInclude } from "./service.js";
import { staticPixFallbackForPayment } from "./static-pix-fallback.js";

const idempotencyHeader = z.string().trim().min(16).max(200);
const cpfCnpjSchema = z.string().transform((value) => value.replace(/\D/g, "")).refine(isValidCpfCnpj, "CPF ou CNPJ invalido.");
const publicIdParams = z.object({ publicId: z.string().min(10).max(100) });

const saleWindow = () => ({
  active: true,
  AND: [
    { OR: [{ salesStartAt: { lte: new Date() } }, { salesStartAt: null }] },
    { OR: [{ salesEndAt: { gte: new Date() } }, { salesEndAt: null }] }
  ]
});

function dueDate() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function paymentRoutes(provider: PaymentProvider): FastifyPluginAsync {
  return async (app) => {
    app.post("/checkout", { preHandler: requireAuthenticated, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
      const user = request.currentUser!;
      const rawKey = idempotencyHeader.parse(request.headers["idempotency-key"]);
      const idempotencyKey = hashToken(`${user.id}:${rawKey}`);
      const input = createOrderSchema.parse(request.body);
      const cpfCnpj = cpfCnpjSchema.parse((request.body as { cpfCnpj?: unknown }).cpfCnpj);

      if (!user.courseId || !user.courseConfirmedAt) {
        return reply.status(403).send({
          error: { code: "COURSE_REQUIRED", message: "Conclua seu cadastro antes de comprar." }
        });
      }
      const course = await prisma.course.findFirst({ where: { id: user.courseId, canPurchase: true } });
      if (!course) {
        return reply.status(403).send({
          error: { code: "COURSE_CANNOT_PURCHASE", message: "Seu curso nao esta habilitado para compras." }
        });
      }

      let payment = await prisma.payment.findUnique({ where: { idempotencyKey }, include: paymentInclude });
      if (payment && payment.order.userId !== user.id) {
        return reply.status(409).send({ error: { code: "IDEMPOTENCY_CONFLICT", message: "Chave de idempotencia invalida." } });
      }

      if (!payment) {
        payment = await createAtomicPixCheckout(provider, {
          idempotencyKey,
          user,
          input,
          cpfCnpj,
          courseNameSnapshot: course.name
        });
      }

      return reply.status(201).send({
        order: orderForApi(payment.order),
        payment: paymentForApi(payment)
      });
    });

    app.get("/orders/:publicId/payment", { preHandler: requireAuthenticated }, async (request, reply) => {
      const publicId = publicIdParams.parse(request.params).publicId;
      const payment = await prisma.payment.findFirst({
        where: { order: { publicId, userId: request.currentUser!.id } },
        include: paymentInclude,
        orderBy: { createdAt: "desc" }
      });
      if (!payment) {
        return reply.status(404).send({ error: { code: "PAYMENT_NOT_FOUND", message: "Pagamento nao encontrado." } });
      }
      const paymentOutput = paymentForApi(payment);
      return {
        payment: {
          ...paymentOutput,
          fallbackPix: payment.status === "PENDING"
            ? await staticPixFallbackForPayment({
              orderNumber: payment.order.orderNumber,
              orderYear: payment.order.orderYear,
              amount: paymentOutput.amount
            })
            : null
        }
      };
    });

  };
}

type AuthenticatedUser = NonNullable<FastifyRequestWithCurrentUser["currentUser"]>;
type CheckoutInput = z.infer<typeof createOrderSchema>;
type CheckoutSnapshot = {
  productId: string;
  productVariantId: string;
  productNameSnapshot: string;
  variantNameSnapshot: string;
  unitPrice: Prisma.Decimal;
  quantity: number;
  totalPrice: Prisma.Decimal;
};

type FastifyRequestWithCurrentUser = {
  currentUser?: {
    id: string;
    name: string;
    email: string;
    courseId: string | null;
    courseConfirmedAt: Date | null;
  };
};

async function createAtomicPixCheckout(
  provider: PaymentProvider,
  params: {
    idempotencyKey: string;
    user: AuthenticatedUser;
    input: CheckoutInput;
    cpfCnpj: string;
    courseNameSnapshot: string;
  }
) {
  const snapshots = await checkoutSnapshots(params.input);
  const total = snapshots.reduce((sum, item) => sum.add(item.totalPrice), new Prisma.Decimal(0));
  const externalReference = `checkout:${params.idempotencyKey}`;
  let providerPaymentId: string | null = null;

  try {
    const charge = await provider.createPixPayment({
      externalReference,
      customer: { ...params.user, cpfCnpj: params.cpfCnpj },
      amount: Number(total),
      description: "Pedido CAEGS",
      dueDate: dueDate()
    });
    providerPaymentId = charge.providerPaymentId;
    const qrCode = await provider.getPixQrCode(charge.providerPaymentId);

    return await prisma.$transaction(async (tx) => {
      const orderIdentity = await createHumanReadableOrderFields(tx);
      const order = await tx.order.create({
        data: {
          publicId: createPublicOrderId(),
          ...orderIdentity,
          userId: params.user.id,
          courseNameSnapshot: params.courseNameSnapshot,
          subtotal: total,
          total,
          items: { create: snapshots },
          statusHistory: {
            create: {
              newPaymentStatus: "PENDING",
              newFulfillmentStatus: "WAITING_PAYMENT",
              source: "SYSTEM",
              note: "Checkout PIX criado."
            }
          }
        }
      });
      return tx.payment.create({
        data: {
          orderId: order.id,
          idempotencyKey: params.idempotencyKey,
          provider: "ASAAS",
          providerCustomerId: charge.providerCustomerId,
          providerPaymentId: charge.providerPaymentId,
          method: "PIX",
          amount: total,
          pixQrCodeImage: qrCode.encodedImage,
          pixCopyPasteCode: qrCode.payload,
          pixExpiresAt: qrCode.expirationDate ? new Date(qrCode.expirationDate) : null
        },
        include: paymentInclude
      });
    });
  } catch (error) {
    const existing = await prisma.payment.findUnique({ where: { idempotencyKey: params.idempotencyKey }, include: paymentInclude });
    if (existing && existing.order.userId === params.user.id) return existing;
    if (providerPaymentId) await provider.deletePayment(providerPaymentId).catch(() => undefined);
    throw error;
  }
}

async function checkoutSnapshots(input: CheckoutInput): Promise<CheckoutSnapshot[]> {
  const snapshots = await Promise.all(input.items.map(async (item) => {
    const product = await prisma.product.findFirst({ where: { id: item.productId, ...saleWindow(), deletedAt: null } });
    const variant = await prisma.productVariant.findFirst({
      where: { id: item.productVariantId, productId: item.productId, active: true, deletedAt: null }
    });
    if (!product || !variant) {
      throw Object.assign(new Error("Um produto ou variante nao esta disponivel."), { statusCode: 400 });
    }
    return {
      productId: product.id,
      productVariantId: variant.id,
      productNameSnapshot: product.name,
      variantNameSnapshot: variant.name,
      unitPrice: product.salePrice,
      quantity: item.quantity,
      totalPrice: product.salePrice.mul(item.quantity)
    };
  }));
  return snapshots;
}

function isValidCpfCnpj(value: string) {
  if (/^(\d)\1+$/.test(value)) return false;
  const baseLength = value.length === 11 ? 9 : value.length === 14 ? 12 : 0;
  if (!baseLength) return false;
  let digits = value.slice(0, baseLength).split("").map(Number);
  for (let checkIndex = 0; checkIndex < 2; checkIndex += 1) {
    let factor = baseLength === 9 ? digits.length + 1 : digits.length - 7;
    const sum = digits.reduce((total, digit) => {
      const subtotal = total + digit * factor;
      factor -= 1;
      if (factor === 1) factor = 9;
      return subtotal;
    }, 0);
    const remainder = sum % 11;
    const checkDigit = remainder < 2 ? 0 : 11 - remainder;
    if (checkDigit !== Number(value[baseLength + checkIndex])) return false;
    digits = [...digits, checkDigit];
  }
  return true;
}




