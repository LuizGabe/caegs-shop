# Privacidade, retencao e secrets

Este projeto minimiza dados pessoais por padrao nas telas administrativas e separa exportacoes operacionais de exportacoes com dados pessoais.

## Dados tratados

- Google: autenticacao OIDC, nome, e-mail verificado, identificador Google e URL de avatar enquanto a conta esta ativa.
- Asaas: criacao de cliente/cobranca PIX com nome, e-mail e CPF/CNPJ informado no checkout. O CPF/CNPJ nao e persistido na plataforma.
- Resend: envio de notificacoes por e-mail quando habilitado no painel administrativo.
- Nginx/Cloudflare: proxy de trafego HTTP; podem processar IP, user-agent e metadados de requisicao conforme a configuracao de infraestrutura.

Nao ha analytics ou APM configurados no codigo atual.

## Retencao tecnica inicial

- Sessoes expiradas ou revogadas: apagar depois de 30 dias.
- Webhooks Asaas: manter a linha, mas limpar `payload` e `errorMessage` depois de 180 dias.
- EmailEvent: limpar `errorMessage` depois de 90 dias e minimizar vinculos pessoais depois de 180 dias.
- AuditLog: manter historico; limpar `ipAddress` e `userAgent` depois de 90 dias.
- Dados PIX (`pixQrCodeImage`, `pixCopyPasteCode`): limpar 30 dias depois de estado terminal.
- Pedidos, itens, pagamentos, status e snapshots: manter para integridade historica, suporte e conciliacao.

Os prazos sao configuraveis por variaveis `PRIVACY_*` nos arquivos de ambiente.

## Cleanup

Use dry-run antes da execucao real:

```bash
pnpm privacy:cleanup --dry-run
pnpm privacy:cleanup
```

A saida mostra apenas contagens agregadas, sem nomes, e-mails, IPs, CPF/CNPJ ou payloads.

O deploy nao executa `pnpm privacy:cleanup` automaticamente. Para executar manualmente na VPS:

```bash
cd /srv/docker/apps/caegs-shop
docker compose -f docker-compose.prod.yml run --rm --no-deps api pnpm privacy:cleanup --dry-run
docker compose -f docker-compose.prod.yml run --rm --no-deps api pnpm privacy:cleanup
```

Para agendar uma execucao diaria com cron no host `services`, use:

```cron
17 3 * * * cd /srv/docker/apps/caegs-shop && docker compose -f docker-compose.prod.yml run --rm --no-deps api pnpm privacy:cleanup >> /var/log/caegs-shop-privacy-cleanup.log 2>&1
```

## Anonimizacao

A rotina interna `anonymizeUser` remove a identidade pessoal da conta, revoga sessoes e preserva pedidos/pagamentos. Ela nao registra e-mail, nome, Google subject ou avatar antigos no AuditLog.

## Secrets em VPS pequena

Nao versionar `.env` ou `.env.production`. Eles ja estao cobertos pelo `.gitignore`.

Na VPS Linux, recomenda-se:

```bash
chown <usuario-da-app>:<grupo-da-app> .env.production
chmod 600 .env.production
```

Remova do ambiente de producao qualquer secret que nao faca parte do runtime. Em especial, `GEMINI_API_KEY` deve ficar fora de producao se for usada apenas para seed, analise de imagem ou desenvolvimento.

O deploy atual injeta variaveis via `env_file: .env.production` no Docker Compose de producao.
