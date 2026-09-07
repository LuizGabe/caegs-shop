import { describe, expect, it } from "vitest";
import { createStaticPixPayload, isAsaasPixDegraded } from "../modules/payments/static-pix-fallback.js";

describe("static pix fallback", () => {
  it("detects degraded Asaas Pix payment components", () => {
    expect(isAsaasPixDegraded([
      { id: "h5rxq5d4xpgn", name: "Pix", status: "operational" },
      { id: "3y7g4j6xf9ss", name: "Transacional", status: "operational" }
    ])).toBe(false);

    expect(isAsaasPixDegraded([
      { id: "3qdlq3jqhgfr", name: "Chaves", status: "major_outage" },
      { id: "3y7g4j6xf9ss", name: "Transacional", status: "operational" }
    ])).toBe(false);

    expect(isAsaasPixDegraded([
      { id: "3y7g4j6xf9ss", name: "Transacional", status: "degraded_performance" }
    ])).toBe(true);
  });

  it("generates a static Pix BR Code with amount, key and txid", () => {
    const payload = createStaticPixPayload({
      key: "123e4567-e89b-12d3-a456-426614174000",
      amount: 42.5,
      txid: "CAES12026",
      merchantName: "PRESIDENTE CAES",
      merchantCity: "SANTA ROSA"
    });

    expect(payload).toContain("br.gov.bcb.pix");
    expect(payload).toContain("123e4567-e89b-12d3-a456-426614174000");
    expect(payload).toContain("540542.50");
    expect(payload).toContain("CAES12026");
    expect(payload).toMatch(/6304[A-F0-9]{4}$/);
  });
});
