import QRCode from "qrcode";
import { config } from "../../config.js";

const asaasStatusUrl = "https://status.asaas.com/api/v2/components.json";
const targetComponents = new Set(["h5rxq5d4xpgn", "3y7g4j6xf9ss"]);
const statusCacheTtlMs = 60_000;

type AsaasStatusComponent = {
  id: string;
  name: string;
  status: string;
};

type AsaasStatusResponse = {
  components?: AsaasStatusComponent[];
};

type CachedStatus = {
  expiresAt: number;
  degraded: boolean;
  components: Array<{ id: string; name: string; status: string }>;
};

let cachedStatus: CachedStatus | null = null;

export type StaticPixFallback = {
  active: true;
  reason: "ASAAS_PIX_DEGRADED";
  copyPasteCode: string;
  qrCodeImage: string;
  manualConfirmationNotice: string;
};

export async function staticPixFallbackForPayment(input: {
  orderNumber: number;
  orderYear: number;
  amount: number;
}): Promise<StaticPixFallback | null> {
  if (!config.STATIC_PIX_FALLBACK_KEY) return null;
  const status = await getAsaasPixStatus();
  if (!status.degraded) return null;

  const copyPasteCode = createStaticPixPayload({
    key: config.STATIC_PIX_FALLBACK_KEY,
    amount: input.amount,
    txid: `CAES${input.orderNumber}${input.orderYear}`,
    merchantName: config.STATIC_PIX_FALLBACK_MERCHANT_NAME,
    merchantCity: config.STATIC_PIX_FALLBACK_MERCHANT_CITY
  });
  const qrCodeImage = await QRCode.toDataURL(copyPasteCode, { errorCorrectionLevel: "M", margin: 1, width: 360 });

  return {
    active: true,
    reason: "ASAAS_PIX_DEGRADED",
    copyPasteCode,
    qrCodeImage,
    manualConfirmationNotice: "A verificacao deste PIX sera feita manualmente e pode demorar mais que o normal. Voce sera notificado por email quando o pagamento for confirmado."
  };
}

export async function getAsaasPixStatus() {
  const now = Date.now();
  if (cachedStatus && cachedStatus.expiresAt > now) {
    return cachedStatus;
  }

  try {
    const response = await fetch(asaasStatusUrl, { signal: AbortSignal.timeout(5_000), headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("Asaas status unavailable");
    const body = await response.json() as AsaasStatusResponse;
    const components = (body.components ?? []).filter((component) => targetComponents.has(component.id));
    const degraded = isAsaasPixDegraded(components);
    cachedStatus = { expiresAt: now + statusCacheTtlMs, degraded, components };
  } catch {
    cachedStatus = { expiresAt: now + statusCacheTtlMs, degraded: false, components: [] };
  }

  return cachedStatus;
}

export function isAsaasPixDegraded(components: AsaasStatusComponent[]) {
  return components.some((component) => targetComponents.has(component.id) && component.status !== "operational");
}

export function createStaticPixPayload(input: {
  key: string;
  amount: number;
  txid: string;
  merchantName: string;
  merchantCity: string;
}) {
  const merchantAccount = tlv("00", "br.gov.bcb.pix") + tlv("01", input.key);
  const additionalData = tlv("05", sanitizeTxid(input.txid));
  const payloadWithoutCrc = [
    tlv("00", "01"),
    tlv("26", merchantAccount),
    tlv("52", "0000"),
    tlv("53", "986"),
    tlv("54", formatAmount(input.amount)),
    tlv("58", "BR"),
    tlv("59", sanitizeText(input.merchantName, 25)),
    tlv("60", sanitizeText(input.merchantCity, 15)),
    tlv("62", additionalData),
    "6304"
  ].join("");

  return `${payloadWithoutCrc}${crc16(payloadWithoutCrc)}`;
}

function tlv(id: string, value: string) {
  return `${id}${value.length.toString().padStart(2, "0")}${value}`;
}

function formatAmount(amount: number) {
  return amount.toFixed(2);
}

function sanitizeText(value: string, maxLength: number) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .toUpperCase()
    .slice(0, maxLength);
}

function sanitizeTxid(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
}

function crc16(value: string) {
  let crc = 0xffff;
  for (let index = 0; index < value.length; index += 1) {
    crc ^= value.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
