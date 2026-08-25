import { config } from "../../config.js";

export function buildGoogleAuthorizationUrl(state: string, nonce: string) {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_REDIRECT_URI) {
    throw new Error("Google OAuth is not configured.");
  }

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", config.GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("prompt", "select_account");

  return url.toString();
}
