import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { Button } from "#/components/ui/button";
import { auth } from "#/lib/auth";
import { authClient } from "#/lib/auth-client";

const getSessionFn = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  return await auth.api.getSession({ headers: request.headers });
});

// IdP (Cognito) 側のセッションも破棄するための logout URL を組み立てる。
// Better Auth の signOut はアプリのセッション cookie を消すだけで Cognito の
// Hosted UI セッションは残るため、ここで /logout へリダイレクトして破棄する。
// cognito-local には /logout が無いので、env が揃っているときだけ URL を返す
// (揃っていなければ null = ローカルログアウトのみ)。
const getIdpLogoutUrlFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const authBase = process.env.OIDC_AUTH_BASE;
    const clientId = process.env.OIDC_CLIENT_ID;
    const logoutUri = process.env.OIDC_LOGOUT_URI;
    if (!authBase || !clientId || !logoutUri) {
      return null;
    }
    const url = new URL(`${authBase}/logout`);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("logout_uri", logoutUri);
    return url.toString();
  },
);

export const Route = createFileRoute("/")({
  component: Home,
  loader: () => getSessionFn(),
});

function Home() {
  const session = Route.useLoaderData();
  const router = useRouter();

  const handleSignIn = async () => {
    const { error } = await authClient.signIn.oauth2({
      providerId: "cognito",
      callbackURL: "/",
    });
    if (error) {
      console.error("sign-in failed", error);
    }
  };

  const handleSignOut = async () => {
    try {
      // 先にアプリ側のセッション cookie を破棄する。
      await authClient.signOut();
      // IdP 側のセッションも破棄する。logout URL があれば Cognito の /logout へ
      // 遷移し、Hosted UI セッションを破棄して logout_uri に戻ってくる。
      const idpLogoutUrl = await getIdpLogoutUrlFn();
      if (idpLogoutUrl) {
        window.location.href = idpLogoutUrl;
        return;
      }
    } catch (error) {
      console.error("sign-out failed", error);
    }
    // logout URL が無い (cognito-local 等) 場合はローカルログアウトのみ。
    await router.invalidate();
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-8">
      {session ? (
        <>
          <h1 className="text-3xl font-bold">ログイン済み</h1>
          <dl className="grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Name</dt>
            <dd>{session.user.name}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd>{session.user.email}</dd>
            <dt className="text-muted-foreground">User ID</dt>
            <dd className="font-mono text-xs">{session.user.id}</dd>
          </dl>
          <Button variant="outline" onClick={handleSignOut}>
            ログアウト
          </Button>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold">
            TanStack Start × Better Auth × Cognito
          </h1>
          <p className="text-muted-foreground text-center">
            Cognito を使った OIDC ログインのサンプルです。
          </p>
          <Button size="lg" onClick={handleSignIn}>
            Cognito でログイン
          </Button>
        </>
      )}
    </main>
  );
}
