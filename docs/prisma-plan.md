# Prisma Schema Plan

## Main Enums

```prisma
enum UserRole {
  USER
  ADMIN
}

enum ProductImageType {
  PRODUCT
  SIZE_GUIDE
}

enum PaymentProvider {
  ASAAS
}

enum PaymentMethod {
  PIX
}

enum PaymentStatus {
  PENDING
  CONFIRMED
  FAILED
  REFUNDED
  CANCELLED
  REFUND_PENDING
}

enum OrderFulfillmentStatus {
  WAITING_PAYMENT
  PAID
  WAITING_PRODUCTION
  IN_PRODUCTION
  RECEIVED_FROM_SUPPLIER
  READY_FOR_PICKUP
  PICKED_UP
  CANCELLED
}

enum StatusChangeSource {
  ADMIN
  SYSTEM
  WEBHOOK
}

enum WebhookProcessingStatus {
  RECEIVED
  PROCESSED
  IGNORED
  FAILED
}

enum ProductionBatchStatus {
  DRAFT
  SENT_TO_SUPPLIER
  IN_PRODUCTION
  RECEIVED
  READY_FOR_PICKUP
  CLOSED
  CANCELLED
}
```

## Core Models

The implementation schema should include at least:

- `User`: minimal Google identity, institutional email, optional avatar, role, selected course, timestamps.
- `Session`: server-side session storage with expiration and revocation.
- `Course`: name, slug, `canPurchase`, soft delete.
- `Product`: name, slug, description, cost price, sale price, active state, featured state, sale window, ordering, soft delete.
- `ProductVariant`: product-owned size/variant records with active state, ordering, soft delete.
- `ProductImage`: product images and size guides with ordering and type.
- `Announcement`: configurable banners with active windows and soft delete.
- `Order`: user, public ID, payment status, fulfillment status, subtotal, total, cancellation fields, timestamps.
- `OrderItem`: immutable product/variant/price/quantity snapshots.
- `Payment`: provider, provider payment ID, method, status, amount, PIX metadata, timestamps.
- `WebhookEvent`: provider event identity, event type, minimized payload, processing status, errors.
- `OrderStatusHistory`: previous/new payment and fulfillment states, actor, source, note.
- `ProductionBatch`: code, status, supplier notes, pickup location, pickup notes, timestamps.
- `ProductionBatchOrder`: join table between batches and orders.
- `AppSetting`: persisted settings such as `emailsEnabled`.
- `EmailEvent`: eligible email events and delivery attempts without rolling back business operations.
- `AuditLog`: append-only operational audit entries.

## Seed

Initial seed must be idempotent:

- `Engenharia de Software`, slug `engenharia-de-software`, `canPurchase = true`
- `Ciência da Computação`, slug `ciencia-da-computacao`, `canPurchase = false`

No admin user should be hardcoded in source.
