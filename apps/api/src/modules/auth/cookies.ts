export function getCookieOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/"
  };
}

export const sessionCookieName = "ca_session";
export const oauthStateCookieName = "ca_oauth_state";
export const oauthNonceCookieName = "ca_oauth_nonce";
