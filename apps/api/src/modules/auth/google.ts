import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { config } from "../../config.js";

const googleTokenSchema = z.object({
  id_token: z.string(),
  access_token: z.string().optional(),
  token_type: z.string().optional(),
  expires_in: z.number().optional()
});

const googleClaimsSchema = z.object({
  sub: z.string(),
  email: z.string().email(),
  email_verified: z.boolean(),
  name: z.string().optional(),
  picture: z.string().url().optional(),
  nonce: z.string().optional()
});

export type GoogleIdentity = {
  googleSubject: string;
  email: string;
  name: string;
  avatarUrl?: string;
};

export type GoogleAuthProvider = {
  exchangeCodeForIdentity(code: string, expectedNonce: string): Promise<GoogleIdentity>;
};

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export function createGoogleAuthProvider(): GoogleAuthProvider {
  return {
    async exchangeCodeForIdentity(code, expectedNonce) {
      if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REDIRECT_URI) {
        throw new Error("Google OAuth is not configured.");
      }

      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: config.GOOGLE_CLIENT_ID,
          client_secret: config.GOOGLE_CLIENT_SECRET,
          redirect_uri: config.GOOGLE_REDIRECT_URI,
          grant_type: "authorization_code"
        })
      });

      if (!response.ok) {
        throw new Error("Google token exchange failed.");
      }

      const tokenPayload = googleTokenSchema.parse(await response.json());
      const verified = await jwtVerify(tokenPayload.id_token, googleJwks, {
        issuer: "https://accounts.google.com",
        audience: config.GOOGLE_CLIENT_ID
      });
      const claims = googleClaimsSchema.parse(verified.payload);

      if (claims.nonce !== expectedNonce) {
        throw new Error("Invalid Google OIDC nonce.");
      }

      if (!claims.email_verified) {
        throw new Error("Google email is not verified.");
      }

      return {
        googleSubject: claims.sub,
        email: claims.email.toLowerCase(),
        name: claims.name ?? claims.email,
        ...(claims.picture ? { avatarUrl: claims.picture } : {})
      };
    }
  };
}
