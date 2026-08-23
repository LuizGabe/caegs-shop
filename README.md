# Centro Academico de Engenharia de Software Platform

Production-oriented commerce and operations platform for the Software Engineering Academic Center.

The first release focuses on institutional Google sign-in, course eligibility, product sales, PIX checkout through Asaas, order tracking, production batches, pickup management, auditing, and operational reporting.

## Stack

- Monorepo with pnpm workspaces
- Web: Vite, React, TypeScript, React Router, TanStack Query, Tailwind CSS, shadcn/ui
- API: Node.js, TypeScript, Fastify, Zod
- Database: PostgreSQL with Prisma ORM
- Auth: Google OAuth 2.0 / OpenID Connect
- Payments: Asaas PIX only in this release
- Email: Resend integration prepared, globally disabled by default
- Runtime: Docker and Docker Compose, reverse-proxy ready for Nginx and Cloudflare

## Project Structure

```text
/
  apps/
    web/
    api/
  packages/
    shared/
  prisma/
  docs/
  docker-compose.yml
  pnpm-workspace.yaml
  package.json
```

## Development Roadmap

The project is implemented in functional stages. Each stage should compile and receive an English semantic commit.

1. Repository, monorepo, Docker, PostgreSQL, Prisma, configuration, and health checks.
2. Google OIDC, sessions, users, courses, purchase authorization, and admin role enforcement.
3. Products, variants, images, announcements, and product administration.
4. Cart, orders, snapshots, and checkout.
5. Asaas PIX integration, webhooks, idempotency, and payment status transitions.
6. User order area, admin dashboard, filters, pagination, and metrics.
7. Production batches, pickup flow, and CSV exports.
8. Resend service, email toggle, audit coverage, and security hardening.
9. Critical tests, production Docker review, and documentation completion.

## Current Status

Initial repository and architecture documentation are being established before implementation, as required by the product specification.
