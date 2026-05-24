# tanstack-start-cognito-sample

[TanStack Start](https://tanstack.com/start) + [Better Auth](https://better-auth.com/) + [cognito-local](https://github.com/jagregory/cognito-local) で、Amazon Cognito (OIDC) ログインを行うサンプルアプリ。

ローカル開発専用のサンプルとして作っており、シークレットを含む `.env` もリポジトリにコミットしている。本番運用は想定していない。

## スタック

| レイヤ | 採用 |
|---|---|
| フレームワーク | TanStack Start (React, Vite 8) |
| 認証 | Better Auth + `genericOAuth` プラグイン (`tanstackStartCookies` 連携) |
| IdP | cognito-local (Amazon Cognito エミュレータ) |
| DB | PostgreSQL 18 (DevContainer の `db` サービス、`sample` データベースを共用) |
| ORM | Drizzle ORM (`drizzle-adapter` provider: `pg`) |
| UI | shadcn/ui (Tailwind v4) |
| Lint / Format | Biome |

## 構成

```
[Browser] ─http://localhost:3000──▶ TanStack Start
   │                                  │
   │                                  ├─ /api/auth/*           (Better Auth ハンドラ)
   │                                  ▼
   │                              PostgreSQL (db:5432, DB: sample)
   │
   └─http://localhost:9229──▶ cognito-local (OIDC IdP)
```

`app` `db` `cognito` は DevContainer で `network_mode: service:db` により同じネットワーク名前空間にあり、ブラウザ・サーバの双方から `localhost:9229` で cognito-local に到達できる。これにより OIDC の issuer URL を 1 つに揃えている。

## なぜ cognito-local + genericOAuth なのか

cognito-local は Amazon Cognito の主要 API をローカルで再現するが、OIDC の挙動には本物の Cognito と異なる点がいくつかあり、Better Auth 側で吸収している。

- **discovery が `issuer` と `jwks_uri` しか返さない。** `authorization_endpoint` / `token_endpoint` を含まないため、[src/lib/auth.ts](src/lib/auth.ts) で `authorizationUrl` / `tokenUrl` を明示している。
- **userinfo エンドポイントが無い。** `getUserInfo` で id_token (JWT) をデコードしてユーザー情報を取り出している。
- **id_token に `name` クレームが無い。** email のローカル部 (`@` の前) で代替している。
- **authorize / token は PKCE (S256) 必須。** `pkce: true` を指定している。
- **User Pool ID は issuer URL に含まれる。** cognito-local の `create-user-pool` は ID を自動採番するため、本サンプルでは固定 ID (`local_cognitosample`) でシードした User Pool を [.devcontainer/cognito/](.devcontainer/cognito/) にコミットしている。

## 起動方法

DevContainer (VS Code Dev Containers) を前提とする。

```bash
# 初回 / 依存追加時
pnpm install

# Better Auth のスキーマを DB に反映 (初回のみ)
pnpm db:push

# 開発サーバ起動
pnpm dev
```

`http://localhost:3000/` を開く。「Cognito でログイン」ボタンを押すと cognito-local のログイン画面に遷移する。

### ログイン用クレデンシャル

| 項目 | 値 |
|---|---|
| Email | `admin@example.com` |
| Password | `Password1!` |

ユーザーは [.devcontainer/cognito/.cognito/db/local_cognitosample.json](.devcontainer/cognito/.cognito/db/local_cognitosample.json) にシードしている。パスワードは Cognito のパスワードポリシー (大文字・小文字・数字・記号・8 文字以上) を満たす値にしている。

## スクリプト

| コマンド | 内容 |
|---|---|
| `pnpm dev` | 開発サーバ (port 3000, `--host` で DevContainer 外からも見える) |
| `pnpm build` | 本番ビルド |
| `pnpm check` | Biome (lint + format) + TypeScript の型チェックをまとめて実行 |
| `pnpm typecheck` | 型チェックのみ |
| `pnpm lint` | Biome の lint のみ |
| `pnpm format` | Biome の format のみ |
| `pnpm db:push` | Drizzle スキーマを DB に直接プッシュ |
| `pnpm db:generate` | マイグレーション SQL を生成 |
| `pnpm db:migrate` | マイグレーションを適用 |

## 主要ファイル

- [src/lib/auth.ts](src/lib/auth.ts) — Better Auth のサーバ側インスタンス。`genericOAuth` に cognito-local の `authorizationUrl` / `tokenUrl` / `discoveryUrl` を渡し、`pkce` と `getUserInfo` を設定。最後に `tanstackStartCookies()` を置く
- [src/lib/auth-client.ts](src/lib/auth-client.ts) — クライアント側 `authClient`
- [src/routes/api/auth/$.ts](src/routes/api/auth/$.ts) — Better Auth のスプラットルート (`/api/auth/*`)
- [src/routes/index.tsx](src/routes/index.tsx) — ログイン UI。`createServerFn` でセッションを取得して描画分岐
- [src/db/index.ts](src/db/index.ts) — `pg.Pool` + Drizzle。HMR で接続が増えないよう `globalThis` キャッシュ
- [src/db/schema.ts](src/db/schema.ts) — Better Auth CLI が生成した Drizzle スキーマ
- [.devcontainer/compose.yaml](.devcontainer/compose.yaml) — `app`, `db`, `pgadmin4`, `cognito` の構成
- [.devcontainer/cognito/](.devcontainer/cognito/) — cognito-local のシード (config / User Pool / Client / User)
- [.env](.env) — ローカル開発用のシークレット (ローカル前提でコミット済み)

## ハマりどころ

- **`tanstackStartCookies()` は plugins 配列の最後に置く。** 順序を間違えると Cookie が正しくセットされない
- **issuer URL は `app` と `Browser` の双方から同じ URL で到達できないと OIDC の `iss` 検証で失敗する。** 本構成では `network_mode: service:db` でこれを担保
- **`OIDC_ISSUER` には User Pool ID が含まれる。** シード済み Pool の固定 ID (`local_cognitosample`) と一致させる必要がある
- **シードを変更した場合は cognito-local のボリュームを作り直す。** 初回起動時のみシードがコピーされる仕組みのため、`docker compose -f .devcontainer/compose.yaml down -v` でボリュームごと作り直す
- **`pnpm db:push` の前に DevContainer 内で PostgreSQL の `sample` DB が立っていること。** 既存 compose で自動起動される
- **`.env` の値はリポジトリにコミットしている。** ローカル開発専用の固定値であり、本番では絶対に流用しない

## 実際の Amazon Cognito につなぐ場合

本サンプルは cognito-local 向けの設定だが、実際の Cognito User Pool に向ける場合は [.env](.env) を以下のように変える。

- `OIDC_ISSUER` → `https://cognito-idp.<region>.amazonaws.com/<userPoolId>`
- `OIDC_AUTH_BASE` → User Pool ドメイン (例 `https://<your-domain>.auth.<region>.amazoncognito.com`)
- `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` → App Client の値

本物の Cognito は discovery に authorization / token エンドポイントを含み、userinfo エンドポイントも持つ。そのため [src/lib/auth.ts](src/lib/auth.ts) の `authorizationUrl` / `tokenUrl` / `getUserInfo` は不要になり、`discoveryUrl` だけで動かせる可能性が高い (App Client のドメイン設定に依存)。

## 参考リンク

- [Better Auth: TanStack Start Integration](https://better-auth.com/docs/integrations/tanstack)
- [Better Auth: Generic OAuth Plugin](https://better-auth.com/docs/plugins/generic-oauth)
- [cognito-local](https://github.com/jagregory/cognito-local)
- [Amazon Cognito: Using OIDC identity providers with a user pool](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-oidc-idp.html)
