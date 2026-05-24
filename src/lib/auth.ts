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

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
  plugins: [
    genericOAuth({
      config: [
        {
          // ローカルは Dex、本番は Amazon Cognito を想定。どちらも OIDC discovery が
          // authorization / token / userinfo を返すため discoveryUrl だけで動く。
          // IdP に依存しない中立な providerId にし、env 差し替えのみで両対応する。
          providerId: "oidc",
          clientId: requireEnv("OIDC_CLIENT_ID"),
          clientSecret: requireEnv("OIDC_CLIENT_SECRET"),
          discoveryUrl: `${requireEnv("OIDC_ISSUER")}/.well-known/openid-configuration`,
          scopes: ["openid", "email", "profile"],
          // Cognito は id_token / userinfo に name を含めないことがあるため、
          // name が空なら email のローカル部で補完して表示名を安定させる。
          mapProfileToUser: (profile) => ({
            name: profile.name ?? profile.email?.split("@")[0] ?? profile.sub,
          }),
        },
      ],
    }),
    tanstackStartCookies(),
  ],
});
