export type EmailNotificationType = "PAYMENT_CONFIRMED" | "ORDER_SENT_TO_PRODUCTION" | "ORDER_READY_FOR_PICKUP" | "ORDER_CANCELLED" | "PAYMENT_REFUNDED";

export type EmailTemplateInput = {
  type: EmailNotificationType;
  name: string;
  orderPublicId: string;
  pickupLocation?: string | null;
  pickupNotes?: string | null;
  pickupDate?: string | null;
  pickupTime?: string | null;
};

export function renderEmail(input: EmailTemplateInput) {
  const name = escapeHtml(input.name);
  const order = escapeHtml(input.orderPublicId);
  const details = pickupDetails(input);
  const templates: Record<EmailNotificationType, { subject: string; message: string }> = {
    PAYMENT_CONFIRMED: { subject: `Pagamento confirmado - pedido ${input.orderPublicId}`, message: `O pagamento do pedido <strong>${order}</strong> foi confirmado.` },
    ORDER_SENT_TO_PRODUCTION: { subject: `Pedido ${input.orderPublicId} enviado para producao`, message: `O pedido <strong>${order}</strong> foi enviado para producao.` },
    ORDER_READY_FOR_PICKUP: { subject: `Pedido ${input.orderPublicId} disponivel para retirada`, message: `O pedido <strong>${order}</strong> esta disponivel para retirada.${details}` },
    ORDER_CANCELLED: { subject: `Pedido ${input.orderPublicId} cancelado`, message: `O pedido <strong>${order}</strong> foi cancelado.` },
    PAYMENT_REFUNDED: { subject: `Reembolso confirmado - pedido ${input.orderPublicId}`, message: `O reembolso do pedido <strong>${order}</strong> foi confirmado.` }
  };
  const template = templates[input.type];
  return {
    subject: template.subject,
    html: `<p>Ola, ${name}.</p><p>${template.message}</p><p>Centro Academico de Engenharia de Software</p>`
  };
}

function pickupDetails(input: EmailTemplateInput) {
  const rows = [
    input.pickupLocation ? `<li>Local: ${escapeHtml(input.pickupLocation)}</li>` : "",
    input.pickupDate ? `<li>Data: ${escapeHtml(input.pickupDate)}</li>` : "",
    input.pickupTime ? `<li>Horario: ${escapeHtml(input.pickupTime)}</li>` : "",
    input.pickupNotes ? `<li>Observacoes: ${escapeHtml(input.pickupNotes)}</li>` : ""
  ].filter(Boolean);
  return rows.length ? `<ul>${rows.join("")}</ul>` : "";
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
