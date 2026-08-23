# Architecture Plan

## Directory Structure

```text
apps/
  api/
    src/
      modules/
        admin/
        announcements/
        asaas/
        audit/
        auth/
        checkout/
        courses/
        emails/
        orders/
        payments/
        production-batches/
        products/
        reports/
        users/
        webhooks/
      plugins/
      server.ts
      config.ts
  web/
    src/
      app/
      components/
      features/
        admin/
        auth/
        cart/
        checkout/
        orders/
        products/
        profile/
      lib/
      routes/
packages/
  shared/
    src/
      constants/
      enums/
      schemas/
      types/
prisma/
  schema.prisma
  seed.ts
```

## Main Backend Boundaries

- `auth`: Google OIDC, session handling, institutional domain validation, current-user context.
- `users`: profile completion, course lock, role checks, user reads for admin.
- `courses`: course catalog and `canPurchase` administration.
- `products`: products, variants, images, soft delete, upload/storage boundary.
- `checkout`: validates checkout requests, recalculates totals, creates orders and payment intents.
- `orders`: user order reads, admin order filtering, status transitions, status history.
- `payments`: payment abstraction and payment lifecycle.
- `asaas`: Asaas client and PIX-specific provider implementation.
- `webhooks`: external webhook validation, idempotent processing, raw event tracking.
- `production-batches`: paid order grouping, supplier CSV, pickup states.
- `emails`: Resend adapter behind a globally disabled-by-default email service.
- `audit`: append-only audit log helpers.
- `reports`: aggregate sales, product, size, batch, and financial views.

## Key Flows

### Authentication

1. User starts Google sign-in from the web app.
2. API creates an OAuth state and nonce and redirects to Google.
3. API validates the callback, token claims, nonce, issuer, audience, and verified email.
4. API extracts the domain from the verified email and allows only `sou.unijui.edu.br` and `unijui.edu.br`.
5. API upserts the user with minimal personal data and starts an HttpOnly session.
6. If the course is missing, the web app sends the user to profile completion.

### Course Selection

1. User chooses a course from the database-backed course list.
2. API rejects free text and validates the course exists and is not deleted.
3. Once stored, the user cannot change the course through self-service endpoints.
4. Admin-only endpoints can change a user's course and must write `AuditLog`.

### Checkout

1. Frontend submits only variant IDs and quantities.
2. API validates quantity limits and authenticated identity.
3. API verifies the user's course has `canPurchase = true`.
4. API fetches active products, variants, sale prices, and sale-window state.
5. API recalculates totals in a transaction and snapshots product names, variant names, unit prices, quantities, and totals.
6. API creates an order, payment row, and Asaas PIX charge through the payment provider.
7. API returns only the public order data needed to render the PIX QR code and copy-paste code.

### Asaas Webhook

1. Asaas posts to `POST /webhooks/asaas`.
2. API validates the provider secret/signature strategy configured for Asaas.
3. API stores a `WebhookEvent` with idempotency data.
4. Duplicate events return success without replaying state transitions.
5. Confirmed payment events update `Payment`, `Order`, fulfillment status, status history, and audit data.

### Admin Cancellation

1. Admin submits cancellation with a required reason.
2. API verifies role and order/payment state.
3. If payment is confirmed, API requests refund through the payment provider.
4. API records local intermediate or final states depending on provider response.
5. API writes status history and `AuditLog`.

### Production Batch

1. Admin filters paid orders not already assigned to a batch.
2. Admin creates a batch and optionally selects all matching orders.
3. API adds eligible paid orders transactionally.
4. API exports supplier CSV with product, size, and quantity only.
5. Admin moves the batch through production and pickup statuses.

## Technical Risks

- Asaas PIX charge/customer fields may require CPF/CNPJ depending on the selected endpoint and account rules. The implementation must verify this against the real sandbox before finalizing the checkout form.
- Payment provider calls cannot be fully wrapped inside SQL transactions. The API needs intermediate states and idempotency keys to recover from partial failures.
- OAuth security depends on strict callback URL, state, nonce, cookie, and proxy configuration.
- Cloudflare/Nginx proxy headers must be trusted only from the expected deployment path.
- Raw webhook payloads can contain personal data; storage must be minimized and redacted where possible.

## Decisions

- Store money as Prisma `Decimal` mapped to PostgreSQL `Decimal(12, 2)`.
- Use database-backed variants and image types, not enums for sizes.
- Use soft delete for administrative catalog entities and preserve historical order references.
- Use separate payment and fulfillment statuses.
- Use public order identifiers for URLs and user-visible order references.
- Keep email sending disabled by default through persisted application settings plus environment safeguards.
- Promote initial admins directly in the database, as requested.
