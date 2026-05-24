import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "#/db";
import * as schema from "#/db/schema";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

type IdTokenClaims = {
  sub: string;
  iss?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  "cognito:username"?: string;
};

// id_token (JWT) のペイロードを取り出す。署名検証はしない:
// token エンドポイントから直接受け取ったトークンであり、改ざんの余地がないため。
function decodeIdToken(idToken: string): IdTokenClaims {
  const payload = idToken.split(".")[1];
  if (!payload) {
    throw new Error("id_token is malformed");
  }
  const json = Buffer.from(payload, "base64url").toString("utf-8");
  return JSON.parse(json) as IdTokenClaims;
}

const issuer = requireEnv("OIDC_ISSUER");
const authBase = requireEnv("OIDC_AUTH_BASE");

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "cognito",
          clientId: requireEnv("OIDC_CLIENT_ID"),
          clientSecret: requireEnv("OIDC_CLIENT_SECRET"),
          // cognito-local の discovery は issuer / jwks_uri しか返さず、authorization /
          // token エンドポイントを含まない。Better Auth は discoveryUrl を渡すと
          // discovery の値で authorizationUrl / tokenUrl を上書きするため、ここで
          // discoveryUrl を渡すと両 URL が undefined になり sign-in が失敗する。
          // よって discoveryUrl は渡さず、両エンドポイントを明示するのみとする。
          authorizationUrl: `${authBase}/oauth2/authorize`,
          tokenUrl: `${authBase}/oauth2/token`,
          scopes: ["openid", "email", "profile"],
          // cognito-local の authorize / token は PKCE (S256) を必須とする。
          pkce: true,
          // cognito-local には userinfo エンドポイントが無いため、id_token から補う。
          // id_token に name クレームは含まれないので、email のローカル部で代替する。
          getUserInfo: async (tokens) => {
            const idToken = tokens.idToken;
            if (!idToken) {
              throw new Error("id_token was not returned from the provider");
            }
            const claims = decodeIdToken(idToken);
            // 自前デコードのため最低限 iss だけは検証し、別 IdP のトークンを弾く。
            if (claims.iss !== issuer) {
              throw new Error(
                `id_token issuer mismatch: expected ${issuer}, got ${claims.iss}`,
              );
            }
            const email = claims.email;
            // cognito-local は基本的に email を返すため通常はローカル部が使われる。
            // email 欠落時の保険として cognito:username → sub の順でフォールバックする。
            const name =
              email?.split("@")[0] ?? claims["cognito:username"] ?? claims.sub;
            return {
              id: claims.sub,
              email: email ?? "",
              emailVerified: claims.email_verified ?? false,
              name,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          },
        },
      ],
    }),
    tanstackStartCookies(),
  ],
});
