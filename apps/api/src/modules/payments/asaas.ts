import { config } from "../../config.js";
import type {
  CreatePixPaymentInput,
  PaymentProvider,
  PixPayment,
  PixQrCode
} from "./provider.js";

type AsaasList<T> = { data?: T[] };
type AsaasCustomer = { id: string };
type AsaasPayment = { id: string; customer: string; status: string };

export class PaymentProviderError extends Error {
  statusCode = 502;

  constructor(message: string, readonly uncertain = false) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

export class AsaasPaymentProvider implements PaymentProvider {
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    environment: "sandbox" | "production"
  ) {
    this.baseUrl = environment === "production"
      ? "https://api.asaas.com/v3"
      : "https://api-sandbox.asaas.com/v3";
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.apiKey) {
      throw new PaymentProviderError("ASAAS_API_KEY nao configurada.");
    }
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(12_000),
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": "CA-Engenharia-Software/0.1",
          access_token: this.apiKey,
          ...init.headers
        }
      });
    } catch {
      throw new PaymentProviderError("Nao foi possivel confirmar a operacao no Asaas.", true);
    }

    const body = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
      const description = extractAsaasError(body);
      throw new PaymentProviderError(`Asaas recusou a operacao: ${redactCpfCnpj(description)}`);
    }

    return body as T;
  }

  private async findCustomer(externalReference: string) {
    const query = new URLSearchParams({ externalReference, limit: "1" });
    const result = await this.request<AsaasList<AsaasCustomer>>(`/customers?${query}`);
    return result.data?.[0] ?? null;
  }

  private async getOrCreateCustomer(input: CreatePixPaymentInput) {
    const existing = await this.findCustomer(input.customer.id);
    if (existing) return existing;

    try {
      return await this.request<AsaasCustomer>("/customers", {
        method: "POST",
        body: JSON.stringify({
          name: input.customer.name,
          email: input.customer.email,
          cpfCnpj: input.customer.cpfCnpj,
          externalReference: input.customer.id,
          notificationDisabled: true
        })
      });
    } catch (error) {
      const recovered = await this.findCustomer(input.customer.id);
      if (recovered) return recovered;
      throw error;
    }
  }

  private async findPayment(externalReference: string) {
    const query = new URLSearchParams({ externalReference, limit: "1" });
    const result = await this.request<AsaasList<AsaasPayment>>(`/payments?${query}`);
    return result.data?.[0] ?? null;
  }

  async createPixPayment(input: CreatePixPaymentInput): Promise<PixPayment> {
    const customer = await this.getOrCreateCustomer(input);
    const existing = await this.findPayment(input.externalReference);
    if (existing) {
      return {
        providerCustomerId: existing.customer,
        providerPaymentId: existing.id,
        status: existing.status
      };
    }

    try {
      const payment = await this.request<AsaasPayment>("/payments", {
        method: "POST",
        body: JSON.stringify({
          customer: customer.id,
          billingType: "PIX",
          value: input.amount,
          dueDate: input.dueDate,
          description: input.description,
          externalReference: input.externalReference
        })
      });
      return {
        providerCustomerId: customer.id,
        providerPaymentId: payment.id,
        status: payment.status
      };
    } catch (error) {
      const recovered = await this.findPayment(input.externalReference);
      if (recovered) {
        return {
          providerCustomerId: recovered.customer,
          providerPaymentId: recovered.id,
          status: recovered.status
        };
      }
      throw error;
    }
  }

  getPixQrCode(providerPaymentId: string) {
    return this.request<PixQrCode>(`/payments/${encodeURIComponent(providerPaymentId)}/pixQrCode`);
  }

  async deletePayment(providerPaymentId: string) {
    await this.request(`/payments/${encodeURIComponent(providerPaymentId)}`, { method: "DELETE" });
  }

  async refundPayment(providerPaymentId: string, description: string) {
    await this.request(`/payments/${encodeURIComponent(providerPaymentId)}/refund`, {
      method: "POST",
      body: JSON.stringify({ description })
    });
  }
}

export function createAsaasPaymentProvider() {
  return new AsaasPaymentProvider(config.ASAAS_API_KEY ?? "", config.ASAAS_ENVIRONMENT);
}

function extractAsaasError(body: unknown) {
  if (typeof body !== "object" || body === null || !("errors" in body) || !Array.isArray(body.errors)) {
    return "resposta invalida do provedor";
  }
  const descriptions = body.errors.flatMap((error) => {
    if (typeof error !== "object" || error === null || !("description" in error)) return [];
    return typeof error.description === "string" ? [error.description] : [];
  });
  return descriptions.join("; ") || "erro nao informado";
}

function redactCpfCnpj(value: string) {
  return value.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf-redacted]").replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[cnpj-redacted]");
}
