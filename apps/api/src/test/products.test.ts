import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const env = readFileSync(join(process.cwd(), "..", "..", ".env"), "utf8");
for (const line of env.split(/\r?\n/)) { const [key, ...values] = line.split("="); if (key && values.length && process.env[key] === undefined) process.env[key] = values.join("=").replace(/\$\$/g, "$"); }
const { buildApp } = await import("../app.js");
const { prisma } = await import("../plugins/prisma.js");
const { createRandomToken, hashToken } = await import("../lib/crypto.js");

async function adminCookie() { const token = createRandomToken(48); const suffix = createRandomToken(8); const user = await prisma.user.create({ data: { googleSubject: `product-admin-${suffix}`, name: "Product Admin", email: `product-admin-${suffix}@sou.unijui.edu.br`, role: "ADMIN" } }); await prisma.session.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) } }); return `ca_session=${token}`; }
async function buyerCookie(canPurchase = true) {
  const token = createRandomToken(48);
  const suffix = createRandomToken(8);
  const course = await prisma.course.upsert({
    where: { slug: canPurchase ? "products-enabled" : "products-disabled" },
    create: { name: canPurchase ? "Curso habilitado para produtos" : "Curso bloqueado para produtos", slug: canPurchase ? "products-enabled" : "products-disabled", canPurchase },
    update: { canPurchase, deletedAt: null }
  });
  const user = await prisma.user.create({
    data: {
      googleSubject: `product-buyer-${suffix}`,
      name: "Product Buyer",
      email: `product-buyer-${suffix}@sou.unijui.edu.br`,
      courseId: course.id,
      courseConfirmedAt: new Date()
    }
  });
  await prisma.session.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) } });
  return `ca_session=${token}`;
}
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString("base64");

describe("product catalogue administration", () => {
  beforeAll(async () => { await prisma.$connect(); });
  it("creates, edits, manages variants and images, and soft deletes products", async () => {
    const app = buildApp(); const cookie = await adminCookie(); const headers = { cookie };
    const created = await app.inject({ method: "POST", url: "/admin/products", headers, payload: { name: `Moletom de teste ${createRandomToken(6)}`, description: "Produto de integração", costPrice: 45, salePrice: 75, active: true, displayOrder: 2 } });
    expect(created.statusCode).toBe(200); const product = created.json().product;
    const edited = await app.inject({ method: "PATCH", url: `/admin/products/${product.id}`, headers, payload: { salePrice: 80, featured: true } }); expect(edited.statusCode).toBe(200); expect(edited.json().product.salePrice).toBe(80);
    const variant = await app.inject({ method: "POST", url: `/admin/products/${product.id}/variants`, headers, payload: { name: "M", displayOrder: 1 } }); expect(variant.statusCode).toBe(200);
    const removedVariant = await app.inject({ method: "DELETE", url: `/admin/products/${product.id}/variants/${variant.json().variant.id}`, headers }); expect(removedVariant.statusCode).toBe(204);
    const restoredVariant = await app.inject({ method: "POST", url: `/admin/products/${product.id}/variants`, headers, payload: { name: "M", displayOrder: 1 } }); expect(restoredVariant.statusCode).toBe(200); expect(restoredVariant.json().variant.id).toBe(variant.json().variant.id); expect(restoredVariant.json().variant.deletedAt).toBeNull();
    const disabled = await app.inject({ method: "PATCH", url: `/admin/products/${product.id}/variants/${variant.json().variant.id}`, headers, payload: { active: false } }); expect(disabled.json().variant.active).toBe(false);
    const firstPhoto = await app.inject({ method: "POST", url: `/admin/products/${product.id}/images`, headers, payload: { type: "PRODUCT", altText: "Foto secundaria", fileName: "foto.jpg", mimeType: "image/jpeg", contentBase64: jpeg } }); expect(firstPhoto.statusCode).toBe(200); expect(firstPhoto.json().image.displayOrder).toBe(0);
    const sizeGuide = await app.inject({ method: "POST", url: `/admin/products/${product.id}/images`, headers, payload: { type: "SIZE_GUIDE", altText: "Guia de medidas", fileName: "foto.jpg", mimeType: "image/jpeg", contentBase64: jpeg } }); expect(sizeGuide.statusCode).toBe(200); expect(sizeGuide.json().image.displayOrder).toBe(0);
    const primaryPhoto = await app.inject({ method: "POST", url: `/admin/products/${product.id}/images`, headers, payload: { type: "PRODUCT", altText: "Foto principal", fileName: "foto.jpg", mimeType: "image/jpeg", contentBase64: jpeg } }); expect(primaryPhoto.statusCode).toBe(200); expect(primaryPhoto.json().image.displayOrder).toBe(1);
    const promotedPhoto = await app.inject({ method: "PATCH", url: `/admin/products/${product.id}/images/${primaryPhoto.json().image.id}`, headers, payload: { displayOrder: 0 } }); expect(promotedPhoto.statusCode).toBe(200);
    const demotedPhoto = await app.inject({ method: "PATCH", url: `/admin/products/${product.id}/images/${firstPhoto.json().image.id}`, headers, payload: { displayOrder: 1 } }); expect(demotedPhoto.statusCode).toBe(200);
    const buyer = await buyerCookie();
    expect((await app.inject({ method: "GET", url: "/products" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/products", headers: { cookie: await buyerCookie(false) } })).statusCode).toBe(403);
    const publicProduct = await app.inject({ method: "GET", url: `/products/${product.slug}`, headers: { cookie: buyer } }); expect(publicProduct.statusCode).toBe(200); expect(publicProduct.json().product.costPrice).toBeUndefined(); expect(publicProduct.json().product.variants).toHaveLength(0); expect(publicProduct.json().product.images).toHaveLength(3); const publicPhotos = publicProduct.json().product.images.filter((image: { type: string }) => image.type === "PRODUCT"); expect(publicPhotos.map((image: { altText: string }) => image.altText)).toEqual(["Foto principal", "Foto secundaria"]);
    const inactive = await app.inject({ method: "PATCH", url: `/admin/products/${product.id}`, headers, payload: { active: false } }); expect(inactive.statusCode).toBe(200); expect((await app.inject({ method: "GET", url: `/products/${product.slug}`, headers: { cookie: buyer } })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: `/admin/products/${product.id}`, headers })).statusCode).toBe(204); expect(await prisma.product.findFirst({ where: { id: product.id } })).toBeNull(); expect(await prisma.product.findFirst({ where: { id: product.id, deletedAt: { not: null } } })).not.toBeNull();
    await app.close();
  });
});
