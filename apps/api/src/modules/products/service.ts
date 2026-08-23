import type { Prisma } from "@prisma/client";
import { prisma } from "../../plugins/prisma.js";
export const productInclude = { variants: { where: { deletedAt: null }, orderBy: { displayOrder: "asc" } }, images: { where: { deletedAt: null }, orderBy: { displayOrder: "asc" } } } satisfies Prisma.ProductInclude;
export function productForApi(product: any, includeCostPrice = false) { const { costPrice, salePrice, ...rest } = product; return { ...rest, salePrice: Number(salePrice), ...(includeCostPrice ? { costPrice: Number(costPrice) } : {}) }; }
export function slugify(name: string) { return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
export async function uniqueSlug(name: string, excludeId?: string) { const base = slugify(name) || "produto"; let slug = base; let number = 2; while (await prisma.product.findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) } })) slug = `${base}-${number++}`; return slug; }
