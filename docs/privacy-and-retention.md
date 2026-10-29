**English** · [Português](privacy-and-retention.pt-BR.md)

# Privacy, retention and secrets

This project minimizes personal data in administrative screens by default and separates operational exports from exports containing personal data.

## Data processed

- Google: OIDC authentication, name, verified email, Google identifier and avatar URL while the account is active.
- Asaas: PIX customer / charge creation using the name, email and CPF/CNPJ supplied at checkout. CPF/CNPJ is not persisted in the platform.
- Resend: email notifications when enabled in the administrative panel.
- Nginx/Cloudflare: HTTP traffic proxying; IP addresses, user agents and request metadata may be processed according to infrastructure configuration.

No analytics or APM is configured in the current code.

## Initial technical retention

- Expired or revoked sessions: delete after 30 days.
- Asaas webhooks: keep the row, but clear `payload` and `errorMessage` after 180 days.
- EmailEvent: clear `errorMessage` after 90 days and minimize personal associations after 180 days.
- AuditLog: keep history; clear `ipAddress` and `userAgent` after 90 days.
- PIX data (`pixQrCodeImage`, `pixCopyPasteCode`): clear 30 days after reaching a terminal state.
- Orders, items, payments, statuses and snapshots: retain for historical integrity, support and reconciliation.

Periods are configurable through `PRIVACY_*` variables in the environment files.

## Cleanup

Use a dry run before actual execution:

```bash
pnpm privacy:cleanup --dry-run
pnpm privacy:cleanup
```

Output contains aggregate counts only, without names, emails, IP addresses, CPF/CNPJ or payloads.

Deployment does not run `pnpm privacy:cleanup` automatically. To run it manually on the VPS:

```bash
cd /srv/docker/apps/caegs-shop
docker compose -f docker-compose.prod.yml run --rm --no-deps api pnpm privacy:cleanup --dry-run
docker compose -f docker-compose.prod.yml run --rm --no-deps api pnpm privacy:cleanup
```

To schedule a daily run with cron on the `services` host:

```cron
17 3 * * * cd /srv/docker/apps/caegs-shop && docker compose -f docker-compose.prod.yml run --rm --no-deps api pnpm privacy:cleanup >> /var/log/caegs-shop-privacy-cleanup.log 2>&1
```

## Anonymization

The internal `anonymizeUser` routine removes the account's personal identity, revokes sessions and preserves orders / payments. It does not record the previous email, name, Google subject or avatar in AuditLog.

## Secrets on a small VPS

Do not commit `.env` or `.env.production`. They are already covered by `.gitignore`.

On a Linux VPS, the recommended permissions are:

```bash
chown <app-user>:<app-group> .env.production
chmod 600 .env.production
```

Remove any secret from the production environment that is not part of the runtime. In particular, keep `GEMINI_API_KEY` out of production if it is used only for seeding, image analysis or development.

The current deployment injects environment variables through `env_file: .env.production` in the production Docker Compose file.
