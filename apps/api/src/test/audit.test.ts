import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const env = readFileSync(join(process.cwd(), "..", "..", ".env"), "utf8");
for (const line of env.split(/\r?\n/)) {
  const [key, ...values] = line.split("=");
  if (key && values.length && process.env[key] === undefined) process.env[key] = values.join("=").replace(/\$\$/g, "$");
}

const { prisma } = await import("../plugins/prisma.js");

describe("audit log", () => {
  it("is append-only at the database level", async () => {
    const entry = await prisma.auditLog.create({ data: { action: "APPEND_ONLY_TEST", entityType: "Test" } });
    await expect(prisma.auditLog.update({ where: { id: entry.id }, data: { action: "MUTATED" } })).rejects.toThrow(/append-only/i);
    await expect(prisma.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow(/append-only/i);
    expect(await prisma.auditLog.findUnique({ where: { id: entry.id } })).toMatchObject({ action: "APPEND_ONLY_TEST" });
  });
});
