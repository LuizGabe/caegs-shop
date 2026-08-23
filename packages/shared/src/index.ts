export const allowedInstitutionalDomains = ["sou.unijui.edu.br", "unijui.edu.br"] as const;

export function isAllowedInstitutionalEmail(email: string): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  const domain = normalizedEmail.split("@").at(1);

  return Boolean(domain && allowedInstitutionalDomains.includes(domain as (typeof allowedInstitutionalDomains)[number]));
}

export const orderLimits = {
  defaultMaxQuantityPerItem: 20,
  defaultMaxTotalItemsPerOrder: 50
} as const;
