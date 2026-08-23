# Implementation Decisions

## Scope Guardrails

This release intentionally excludes credit card payments, installments, interest, card fees, receivable anticipation, definitive margin rules, inventory, shipping, public registration, password login, self-service course changes, UI-based admin creation, XLSX export, support tickets, mobile apps, WebSocket updates, and complex permission systems.

## Security Baseline

- Backend is the authority for identity, authorization, prices, totals, and state transitions.
- Sessions use HttpOnly cookies, `Secure` in production, strict redirect validation, and CSRF protection where needed.
- CORS is restrictive and configured through environment variables.
- Fastify/Pino redaction must cover secrets, OAuth tokens, cookies, API keys, CPF, and sensitive payment data.
- Admin routes always validate `ADMIN` in the API.
- Rate limits apply to login, checkout, payment creation, webhooks, and sensitive admin actions.

## Environment Variables

Required examples for `.env.example`:

```text
DATABASE_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
ASAAS_API_KEY=
ASAAS_ENVIRONMENT=sandbox
ASAAS_WEBHOOK_TOKEN=
RESEND_API_KEY=
SESSION_SECRET=
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:3333
MAX_QUANTITY_PER_ITEM=20
MAX_TOTAL_ITEMS_PER_ORDER=50
EMAILS_ENABLED=false
TRUST_PROXY=false
```

## Reverse Proxy

The API should expose health and application routes normally and allow Nginx or another reverse proxy to route traffic. Proxy trust must be explicit in configuration and aligned with the deployment topology behind Cloudflare and Nginx.

## Docker

Local development should include:

- `postgres`
- `api`
- `web`

Production should allow `DATABASE_URL` to point to an existing PostgreSQL service instead of the Compose database.
