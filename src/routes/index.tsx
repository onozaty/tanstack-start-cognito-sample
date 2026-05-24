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
      await authClient.signOut();
    } catch (error) {
      console.error("sign-out failed", error);
    } finally {
      await router.invalidate();
    }
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
