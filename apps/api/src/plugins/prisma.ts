import { Prisma, PrismaClient } from "@prisma/client";

const softDeleteModels = new Set(["User", "Course", "Product", "ProductVariant", "ProductImage", "Announcement", "ProductionBatch"]);

const softDeleteReadOperations = new Set(["findFirst", "findMany", "count"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasOwnProperty(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function withSoftDeleteFilter<TArgs>(args: TArgs): TArgs {
  if (!isObject(args)) {
    return args;
  }

  const where = isObject(args.where) ? args.where : undefined;

  if (where && hasOwnProperty(where, "deletedAt")) {
    return args;
  }

  return {
    ...args,
    where: {
      ...where,
      deletedAt: null
    }
  } as TArgs;
}

export const prisma = new PrismaClient().$extends(
  Prisma.defineExtension({
    name: "soft-delete-read-filter",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!softDeleteModels.has(model) || !softDeleteReadOperations.has(operation)) {
            return query(args);
          }

          return query(withSoftDeleteFilter(args));
        }
      }
    }
  })
);

export async function disconnectPrisma() {
  await prisma.$disconnect();
}
