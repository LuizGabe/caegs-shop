import type { Prisma } from "@prisma/client";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import { auditRequestContext } from "../../lib/audit.js";
import { prisma } from "../../plugins/prisma.js";
import { requireAdmin, requirePurchaseEligible } from "../auth/guards.js";
import { storage } from "../storage/storage.js";
import { productForApi, productInclude, uniqueSlug } from "./service.js";

const idSchema = z.object({ id: z.string().min(1) });
const slugSchema = z.object({ slug: z.string().min(1) });
const variantParams = z.object({ id: z.string().min(1), variantId: z.string().min(1) });
const imageParams = z.object({ id: z.string().min(1), imageId: z.string().min(1) });
const dateSchema = z.string().datetime().nullable().optional();
const productBase = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(1).max(10000),
  costPrice: z.coerce.number().nonnegative().finite(),
  salePrice: z.coerce.number().nonnegative().finite(),
  active: z.boolean().optional(),
  featured: z.boolean().optional(),
  displayOrder: z.coerce.number().int().min(0).optional(),
  salesStartAt: dateSchema,
  salesEndAt: dateSchema
});
const productBody = productBase.superRefine(validateSalesWindow);
const variantBody = z.object({ name: z.string().trim().min(1).max(100), active: z.boolean().optional(), displayOrder: z.coerce.number().int().min(0).optional() });
const imageBody = z.object({
  type: z.enum(["PRODUCT", "SIZE_GUIDE"]),
  altText: z.string().trim().min(1).max(200),
  displayOrder: z.coerce.number().int().min(0).optional(),
  fileName: z.string().min(1).max(255),
  mimeType: z.string(),
  contentBase64: z.string().min(1).max(7_000_000)
});
const imageUpdateBody = z.object({ altText: z.string().trim().min(1).max(200).optional(), displayOrder: z.coerce.number().int().min(0).optional() });
const publicWindow = (): Prisma.ProductWhereInput => ({
  active: true,
  AND: [
    { OR: [{ salesStartAt: { lte: new Date() } }, { salesStartAt: null }] },
    { OR: [{ salesEndAt: { gte: new Date() } }, { salesEndAt: null }] }
  ]
});

function validateSalesWindow(data: { salesStartAt?: string | null | undefined; salesEndAt?: string | null | undefined }, context: z.RefinementCtx) {
  const start = data.salesStartAt ? new Date(data.salesStartAt) : null;
  const end = data.salesEndAt ? new Date(data.salesEndAt) : null;
  if (start && end && end <= start) context.addIssue({ code: z.ZodIssueCode.custom, path: ["salesEndAt"], message: "O fim das vendas deve ser posterior ao inicio." });
}

function missing(reply: FastifyReply, message = "Produto nao encontrado.") {
  return reply.status(404).send({ error: { code: "NOT_FOUND", message } });
}

export const productRoutes: FastifyPluginAsync = async (app) => {
  app.get("/uploads/:key", async (request, reply) => {
    const key = z.object({ key: z.string() }).parse(request.params).key;
    const content = await storage.read(key);
    if (!content) return reply.status(404).send();
    reply.header("Cross-Origin-Resource-Policy", "cross-origin");
    reply.header("Cache-Control", "public, max-age=604800, immutable");
    return reply.type(key.endsWith(".png") ? "image/png" : key.endsWith(".webp") ? "image/webp" : "image/jpeg").send(content);
  });

  app.get("/products", { preHandler: requirePurchaseEligible }, async () => {
    const products = await prisma.product.findMany({ where: publicWindow(), include: productInclude, orderBy: [{ featured: "desc" }, { displayOrder: "asc" }, { createdAt: "desc" }] });
    return { products: products.map((product) => productForApi(product)) };
  });
  app.get("/products/:slug", { preHandler: requirePurchaseEligible }, async (request, reply) => {
    const product = await prisma.product.findFirst({
      where: { slug: slugSchema.parse(request.params).slug, ...publicWindow() },
      include: { variants: { where: { active: true, deletedAt: null }, orderBy: { displayOrder: "asc" } }, images: { where: { deletedAt: null }, orderBy: { displayOrder: "asc" } } }
    });
    return product ? { product: productForApi(product) } : missing(reply);
  });

  app.get("/admin/products", { preHandler: requireAdmin }, async () => {
    const products = await prisma.product.findMany({ include: productInclude, orderBy: [{ active: "desc" }, { displayOrder: "asc" }, { createdAt: "desc" }] });
    return { products: products.map((product) => productForApi(product, true)) };
  });
  app.get("/admin/products/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const product = await prisma.product.findFirst({ where: idSchema.parse(request.params), include: productInclude });
    return product ? { product: productForApi(product, true) } : missing(reply);
  });
  app.post("/admin/products", { preHandler: requireAdmin }, async (request) => {
    const data = productBody.parse(request.body);
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          ...data,
          salesStartAt: data.salesStartAt ? new Date(data.salesStartAt) : null,
          salesEndAt: data.salesEndAt ? new Date(data.salesEndAt) : null,
          slug: await uniqueSlug(data.name),
          active: data.active ?? false,
          featured: data.featured ?? false,
          displayOrder: data.displayOrder ?? 0
        },
        include: productInclude
      });
      await tx.auditLog.create({ data: { actorUserId: request.currentUser!.id, action: "PRODUCT_CREATED", entityType: "Product", entityId: created.id, ...auditRequestContext(request) } });
      return created;
    });
    return { product: productForApi(product, true) };
  });
  app.patch("/admin/products/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const data = productBase.partial().parse(request.body);
    const current = await prisma.product.findFirst({ where: { id } });
    if (!current) return missing(reply);
    const salesStartAt = data.salesStartAt === undefined ? current.salesStartAt : data.salesStartAt ? new Date(data.salesStartAt) : null;
    const salesEndAt = data.salesEndAt === undefined ? current.salesEndAt : data.salesEndAt ? new Date(data.salesEndAt) : null;
    if (salesStartAt && salesEndAt && salesEndAt <= salesStartAt) {
      return reply.status(400).send({ error: { code: "INVALID_SALES_WINDOW", message: "O fim das vendas deve ser posterior ao inicio." } });
    }
    const slug = data.name ? await uniqueSlug(data.name, id) : undefined;
    const product = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: {
          ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
          ...(data.salesStartAt !== undefined ? { salesStartAt: data.salesStartAt ? new Date(data.salesStartAt) : null } : {}),
          ...(data.salesEndAt !== undefined ? { salesEndAt: data.salesEndAt ? new Date(data.salesEndAt) : null } : {}),
          ...(slug ? { slug } : {})
        },
        include: productInclude
      });
      await tx.auditLog.create({ data: { actorUserId: request.currentUser!.id, action: "PRODUCT_UPDATED", entityType: "Product", entityId: id, metadata: { changedFields: Object.keys(data) }, ...auditRequestContext(request) } });
      if (!current.salePrice.equals(updated.salePrice)) {
        await tx.auditLog.create({ data: { actorUserId: request.currentUser!.id, action: "PRODUCT_SALE_PRICE_UPDATED", entityType: "Product", entityId: id, metadata: { previousSalePrice: current.salePrice.toString(), salePrice: updated.salePrice.toString() }, ...auditRequestContext(request) } });
      }
      return updated;
    });
    return { product: productForApi(product, true) };
  });
  app.delete("/admin/products/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    if (!await prisma.product.findFirst({ where: { id } })) return missing(reply);
    await prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
      await tx.auditLog.create({ data: { actorUserId: request.currentUser!.id, action: "PRODUCT_DELETED", entityType: "Product", entityId: id, ...auditRequestContext(request) } });
    });
    return reply.status(204).send();
  });

  app.post("/admin/products/:id/variants", { preHandler: requireAdmin }, async (request, reply) => {
    const productId = idSchema.parse(request.params).id;
    if (!await prisma.product.findFirst({ where: { id: productId } })) return missing(reply);
    const data = variantBody.parse(request.body);
    const variant = await prisma.$transaction(async (tx) => {
      const activeVariant = await tx.productVariant.findFirst({ where: { productId, name: data.name } });
      if (activeVariant) {
        throw Object.assign(new Error("Essa variante ja existe para este produto."), { statusCode: 409 });
      }
      const removedVariant = await tx.productVariant.findFirst({ where: { productId, name: data.name, deletedAt: { not: null } } });
      const saved = removedVariant
        ? await tx.productVariant.update({
            where: { id: removedVariant.id },
            data: { active: data.active ?? true, deletedAt: null, displayOrder: data.displayOrder ?? removedVariant.displayOrder }
          })
        : await tx.productVariant.create({ data: { productId, name: data.name, active: data.active ?? true, displayOrder: data.displayOrder ?? 0 } });
      await tx.auditLog.create({
        data: {
          actorUserId: request.currentUser!.id,
          action: removedVariant ? "PRODUCT_VARIANT_RESTORED" : "PRODUCT_VARIANT_CREATED",
          entityType: "ProductVariant",
          entityId: saved.id,
          metadata: { productId },
          ...auditRequestContext(request)
        }
      });
      return saved;
    });
    return { variant };
  });
  app.patch("/admin/products/:id/variants/:variantId", { preHandler: requireAdmin }, async (request, reply) => {
    const params = variantParams.parse(request.params);
    const found = await prisma.productVariant.findFirst({ where: { id: params.variantId, productId: params.id } });
    if (!found) return missing(reply, "Variante nao encontrada.");
    const data = variantBody.partial().parse(request.body);
    const variant = await prisma.$transaction(async (tx) => {
      const updated = await tx.productVariant.update({ where: { id: found.id }, data: Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) });
      await tx.auditLog.create({ data: { actorUserId: request.currentUser!.id, action: "PRODUCT_VARIANT_UPDATED", entityType: "ProductVariant", entityId: found.id, metadata: { productId: params.id, changedFields: Object.keys(data) }, ...auditRequestContext(request) } });
      return updated;
    });
    return { variant };
  });
  app.delete("/admin/products/:id/variants/:variantId", { preHandler: requireAdmin }, async (request, reply) => {
    const params = variantParams.parse(request.params);
    const found = await prisma.productVariant.findFirst({ where: { id: params.variantId, productId: params.id } });
    if (!found) return missing(reply, "Variante nao encontrada.");
    await prisma.$transaction(async (tx) => {
      await tx.productVariant.update({ where: { id: found.id }, data: { active: false, deletedAt: new Date() } });
      await tx.auditLog.create({ data: { actorUserId: request.currentUser!.id, action: "PRODUCT_VARIANT_DELETED", entityType: "ProductVariant", entityId: found.id, metadata: { productId: params.id }, ...auditRequestContext(request) } });
    });
    return reply.status(204).send();
  });

  app.post("/admin/products/:id/images", { preHandler: requireAdmin, bodyLimit: 7_500_000 }, async (request, reply) => {
    const productId = idSchema.parse(request.params).id;
    if (!await prisma.product.findFirst({ where: { id: productId } })) return missing(reply);
    const data = imageBody.parse(request.body);
    const stored = await storage.upload(data);
    const image = await prisma.$transaction(async (tx) => {
      const highestOrder = (await tx.productImage.aggregate({
        where: { productId, type: data.type, deletedAt: null },
        _max: { displayOrder: true }
      }))._max.displayOrder ?? -1;
      const created = await tx.productImage.create({ data: { productId, type: data.type, altText: data.altText, displayOrder: data.displayOrder ?? highestOrder + 1, url: stored.url } });
      await tx.auditLog.create({ data: { actorUserId: request.currentUser!.id, action: "PRODUCT_IMAGE_CREATED", entityType: "ProductImage", entityId: created.id, metadata: { productId, type: data.type }, ...auditRequestContext(request) } });
      return created;
    });
    return { image };
  });
  app.patch("/admin/products/:id/images/:imageId", { preHandler: requireAdmin }, async (request, reply) => {
    const params = imageParams.parse(request.params);
    const found = await prisma.productImage.findFirst({ where: { id: params.imageId, productId: params.id } });
    if (!found) return missing(reply, "Imagem nao encontrada.");
    const data = imageUpdateBody.parse(request.body);
    const image = await prisma.$transaction(async (tx) => {
      const updated = await tx.productImage.update({ where: { id: found.id }, data: Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) });
      await tx.auditLog.create({ data: { actorUserId: request.currentUser!.id, action: "PRODUCT_IMAGE_UPDATED", entityType: "ProductImage", entityId: found.id, metadata: { productId: params.id, changedFields: Object.keys(data) }, ...auditRequestContext(request) } });
      return updated;
    });
    return { image };
  });
  app.delete("/admin/products/:id/images/:imageId", { preHandler: requireAdmin }, async (request, reply) => {
    const params = imageParams.parse(request.params);
    const found = await prisma.productImage.findFirst({ where: { id: params.imageId, productId: params.id } });
    if (!found) return missing(reply, "Imagem nao encontrada.");
    await prisma.$transaction(async (tx) => {
      await tx.productImage.update({ where: { id: found.id }, data: { deletedAt: new Date() } });
      await tx.auditLog.create({ data: { actorUserId: request.currentUser!.id, action: "PRODUCT_IMAGE_DELETED", entityType: "ProductImage", entityId: found.id, metadata: { productId: params.id }, ...auditRequestContext(request) } });
    });
    return reply.status(204).send();
  });
};
