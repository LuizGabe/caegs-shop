export type EmailNotificationType = "PAYMENT_CONFIRMED" | "PAYMENT_PENDING_REMINDER" | "ORDER_SENT_TO_PRODUCTION" | "ORDER_READY_FOR_PICKUP" | "ORDER_CANCELLED" | "PAYMENT_REFUNDED";

export type EmailTemplateInput = {
  type: EmailNotificationType;
  name: string;
  orderPublicId: string;
  orderHumanReadableId?: string | null;
  pixExpiresAt?: string | Date | null;
  pickupLocation?: string | null;
  pickupNotes?: string | null;
  pickupDate?: string | null;
  pickupTime?: string | null;
};

type TemplateCopy = {
  subject: string;
  eyebrow: string;
  title: string;
  message: string;
  badge: string;
  accent: string;
  badgeBg: string;
  badgeText: string;
};

export function renderEmail(input: EmailTemplateInput) {
  const name = escapeHtml(input.name);
  const orderPublicId = escapeHtml(input.orderPublicId);
  const orderHumanReadableId = escapeHtml(input.orderHumanReadableId ?? input.orderPublicId);
  const displayOrder = `#${orderHumanReadableId}`;
  const copy = templateCopy(input.type, displayOrder);
  const details = input.type === "PAYMENT_PENDING_REMINDER" ? pixDetails(input.pixExpiresAt) : pickupDetails(input);

  return {
    subject: copy.subject,
    html: `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(copy.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;overflow:hidden;box-shadow:0 18px 45px rgba(15,23,42,0.08);">
            <tr>
              <td style="background:#172554;padding:26px 28px;color:#ffffff;">
                <div style="font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#bfdbfe;font-weight:700;">CAES</div>
                <div style="font-size:24px;line-height:1.2;font-weight:800;margin-top:6px;">Centro Acadêmico de Engenharia de Software</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;font-weight:800;">${escapeHtml(copy.eyebrow)}</div>
                <h1 style="margin:10px 0 0;font-size:26px;line-height:1.2;color:#0f172a;">${escapeHtml(copy.title)}</h1>
                <p style="margin:18px 0 0;font-size:15px;line-height:1.7;color:#475569;">Olá, <strong style="color:#0f172a;">${name}</strong>.</p>
                <p style="margin:10px 0 0;font-size:15px;line-height:1.7;color:#475569;">${copy.message}</p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:18px;">
                  <tr>
                    <td style="padding:18px;">
                      <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.12em;color:#64748b;font-weight:800;">Pedido</div>
                      <div style="font-size:28px;line-height:1.2;color:#0f172a;font-weight:900;margin-top:4px;">${displayOrder}</div>
                      <div style="font-size:12px;line-height:1.5;color:#64748b;margin-top:8px;word-break:break-all;">Referência técnica: ${orderPublicId}</div>
                      <div style="display:inline-block;margin-top:14px;padding:7px 12px;border-radius:999px;background:${copy.badgeBg};color:${copy.badgeText};font-size:12px;font-weight:800;">${escapeHtml(copy.badge)}</div>
                    </td>
                  </tr>
                </table>

                ${details}

                <div style="height:1px;background:#e2e8f0;margin:26px 0;"></div>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">Você pode acompanhar o andamento pela plataforma do Centro Acadêmico. Esta mensagem foi enviada automaticamente.</p>
              </td>
            </tr>
            <tr>
              <td style="background:#f1f5f9;padding:18px 28px;color:#64748b;font-size:12px;line-height:1.6;">
                Engenharia de Software UNIJUÍ • Centro Acadêmico
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
  };
}

function templateCopy(type: EmailNotificationType, displayOrder: string): TemplateCopy {
  const templates: Record<EmailNotificationType, TemplateCopy> = {
    PAYMENT_CONFIRMED: {
      subject: `Pagamento confirmado - pedido ${displayOrder}`,
      eyebrow: "Pagamento confirmado",
      title: "Recebemos seu pagamento",
      message: `O pagamento do pedido <strong style="color:#0f172a;">${escapeHtml(displayOrder)}</strong> foi confirmado. Seu pedido já está registrado para as próximas etapas.`,
      badge: "Pago",
      accent: "#2563eb",
      badgeBg: "#dbeafe",
      badgeText: "#1d4ed8"
    },
    PAYMENT_PENDING_REMINDER: {
      subject: `Pagamento pendente - pedido ${displayOrder}`,
      eyebrow: "Pagamento pendente",
      title: "Seu PIX ainda esta aguardando pagamento",
      message: `O pedido <strong style="color:#0f172a;">${escapeHtml(displayOrder)}</strong> ainda nao teve o pagamento PIX confirmado. Para manter seu pedido ativo, realize o pagamento ate a data de vencimento informada abaixo.`,
      badge: "Aguardando PIX",
      accent: "#d97706",
      badgeBg: "#fef3c7",
      badgeText: "#92400e"
    },
    ORDER_SENT_TO_PRODUCTION: {
      subject: `Pedido ${displayOrder} enviado para produção`,
      eyebrow: "Produção iniciada",
      title: "Seu pedido foi enviado para produção",
      message: `O pedido <strong style="color:#0f172a;">${escapeHtml(displayOrder)}</strong> entrou na etapa de produção.`,
      badge: "Em produção",
      accent: "#4f46e5",
      badgeBg: "#e0e7ff",
      badgeText: "#3730a3"
    },
    ORDER_READY_FOR_PICKUP: {
      subject: `Pedido ${displayOrder} disponível para retirada`,
      eyebrow: "Retirada disponível",
      title: "Seu pedido está pronto para retirada",
      message: `O pedido <strong style="color:#0f172a;">${escapeHtml(displayOrder)}</strong> já pode ser retirado. Confira os detalhes abaixo antes de buscar.`,
      badge: "Pronto para retirada",
      accent: "#0f766e",
      badgeBg: "#ccfbf1",
      badgeText: "#0f766e"
    },
    ORDER_CANCELLED: {
      subject: `Pedido ${displayOrder} cancelado`,
      eyebrow: "Pedido cancelado",
      title: "Seu pedido foi cancelado",
      message: `O pedido <strong style="color:#0f172a;">${escapeHtml(displayOrder)}</strong> foi cancelado.`,
      badge: "Cancelado",
      accent: "#e11d48",
      badgeBg: "#ffe4e6",
      badgeText: "#be123c"
    },
    PAYMENT_REFUNDED: {
      subject: `Reembolso confirmado - pedido ${displayOrder}`,
      eyebrow: "Reembolso confirmado",
      title: "Seu reembolso foi confirmado",
      message: `O reembolso do pedido <strong style="color:#0f172a;">${escapeHtml(displayOrder)}</strong> foi confirmado.`,
      badge: "Reembolsado",
      accent: "#475569",
      badgeBg: "#e2e8f0",
      badgeText: "#334155"
    }
  };
  return templates[type];
}

function pixDetails(pixExpiresAt: string | Date | null | undefined) {
  const value = formatPixExpiration(pixExpiresAt);
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;border:1px solid #fde68a;border-radius:18px;background:#fffbeb;">
    <tr><td style="padding:16px 18px;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.12em;color:#b45309;font-weight:900;margin-bottom:8px;">Vencimento do PIX</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${detailRow("Data", value)}</table>
    </td></tr>
  </table>`;
}

function formatPixExpiration(value: string | Date | null | undefined) {
  if (!value) return "Nao informado";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Nao informado";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(date);
}

function pickupDetails(input: EmailTemplateInput) {
  const rows = [
    input.pickupLocation ? detailRow("Local", input.pickupLocation) : "",
    input.pickupDate ? detailRow("Data", input.pickupDate) : "",
    input.pickupTime ? detailRow("Horário", input.pickupTime) : "",
    input.pickupNotes ? detailRow("Observações", input.pickupNotes) : ""
  ].filter(Boolean);

  if (!rows.length) return "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;border:1px solid #dbeafe;border-radius:18px;background:#eff6ff;">
    <tr><td style="padding:16px 18px;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.12em;color:#1d4ed8;font-weight:900;margin-bottom:8px;">Detalhes da retirada</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows.join("")}</table>
    </td></tr>
  </table>`;
}

function detailRow(label: string, value: string) {
  return `<tr><td style="padding:6px 0;font-size:13px;color:#64748b;width:110px;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:700;vertical-align:top;">${escapeHtml(value)}</td></tr>`;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
