# tanstack-start-cognito-sample

[TanStack Start](https://tanstack.com/start) + [Better Auth](https://better-auth.com/) で OIDC ログインを行うサンプルアプリ。本番の IdP として Amazon Cognito を想定している。

ローカル開発では IdP として [Dex](https://dexidp.io/) を使い (AWS 不要・オフラインで動く)、本物の Amazon Cognito でも env を差し替えるだけで動作確認できる ([本物の Amazon Cognito で試す](#本物の-amazon-cognito-で試す) を参照)。アプリのコードは標準 OIDC クレームしか使わないため、Dex と Cognito で同一コードのまま動く。

ローカル開発専用のサンプルとして作っており、Dex 用のシークレットを含む `.env` もリポジトリにコミットしている。本番運用は想定していない。

## スタック

| レイヤ | 採用 |
|---|---|
| フレームワーク | TanStack Start (React, Vite 8) |
| 認証 | Better Auth + `genericOAuth` プラグイン (`tanstackStartCookies` 連携) |
| IdP (ローカル) | Dex (OIDC プロバイダ) |
| IdP (本番想定) | Amazon Cognito |
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
   └─http://localhost:5556──▶ Dex (OIDC IdP)
```

`app` `db` `dex` は DevContainer で `network_mode: service:db` により同じネットワーク名前空間にあり、ブラウザ・サーバの双方から `localhost:5556` で Dex に到達できる。これにより OIDC の issuer URL を 1 つに揃えている。

## 認証の仕組み

[src/lib/auth.ts](src/lib/auth.ts) は IdP 非依存の最小構成で、`genericOAuth` に `discoveryUrl` を渡すだけ。Dex も Amazon Cognito も OIDC discovery が `authorization_endpoint` / `token_endpoint` / `userinfo_endpoint` を返すため、エンドポイントを個別に指定する必要がない。providerId は IdP 中立の `oidc` に統一し、env の差し替えだけで Dex / Cognito を切り替える。

- **`name` の補完。** Amazon Cognito は id_token / userinfo に `name` を含めないことがあるため、`mapProfileToUser` で `name` が空なら email のローカル部 (`@` の前) で補完している。Dex はサンプルユーザーに `name` を持たせているのでそのまま使われる。

## 起動方法 (ローカル / Dex)

DevContainer (VS Code Dev Containers) を前提とする。

```bash
# 初回 / 依存追加時
pnpm install

# Better Auth のスキーマを DB に反映 (初回のみ)
pnpm db:push

# 開発サーバ起動 (Dex を使う)
pnpm dev
```

`http://localhost:3000/` を開く。ログインボタンを押すと Dex のログイン画面に遷移する。

### ログイン用クレデンシャル (Dex)

| 項目 | 値 |
|---|---|
| Email | `admin@example.com` |
| Password | `password` |

ユーザーは [.devcontainer/dex/config.yaml](.devcontainer/dex/config.yaml) の `staticPasswords` にシードしている。

## スクリプト

| コマンド | 内容 |
|---|---|
| `pnpm dev` | 開発サーバ (port 3000, `--host` で DevContainer 外からも見える)。ローカルの Dex を使う |
| `pnpm dev:aws` | 本物の Amazon Cognito を使う開発サーバ (`--mode aws`、`.env.aws` を読む。後述) |
| `pnpm build` | 本番ビルド |
| `pnpm check` | Biome (lint + format) + TypeScript の型チェックをまとめて実行 |
| `pnpm typecheck` | 型チェックのみ |
| `pnpm lint` | Biome の lint のみ |
| `pnpm format` | Biome の format のみ |
| `pnpm db:push` | Drizzle スキーマを DB に直接プッシュ |
| `pnpm db:generate` | マイグレーション SQL を生成 |
| `pnpm db:migrate` | マイグレーションを適用 |

## 主要ファイル

- [src/lib/auth.ts](src/lib/auth.ts) — Better Auth のサーバ側インスタンス。`genericOAuth` に `discoveryUrl` を渡し、`mapProfileToUser` で `name` を補完。最後に `tanstackStartCookies()` を置く
- [src/lib/auth-client.ts](src/lib/auth-client.ts) — クライアント側 `authClient`
- [src/routes/api/auth/$.ts](src/routes/api/auth/$.ts) — Better Auth のスプラットルート (`/api/auth/*`)
- [src/routes/index.tsx](src/routes/index.tsx) — ログイン UI。`createServerFn` でセッションを取得して描画分岐。ログアウト時は IdP ログアウト URL があれば IdP の `/logout` へ遷移 (Cognito 利用時のみ)
- [src/db/index.ts](src/db/index.ts) — `pg.Pool` + Drizzle。HMR で接続が増えないよう `globalThis` キャッシュ
- [src/db/schema.ts](src/db/schema.ts) — Better Auth CLI が生成した Drizzle スキーマ
- [.devcontainer/compose.yaml](.devcontainer/compose.yaml) — `app`, `db`, `pgadmin4`, `dex` の構成
- [.devcontainer/dex/config.yaml](.devcontainer/dex/config.yaml) — Dex の設定 (issuer / staticClient / staticPassword)
- [infra/cognito.yaml](infra/cognito.yaml) — 本物の Cognito を作る CloudFormation テンプレート (User Pool / Hosted UI ドメイン / App Client)
- [scripts/cognito-up.sh](scripts/cognito-up.sh) / [scripts/cognito-down.sh](scripts/cognito-down.sh) — 上記スタックの作成・削除と `.env.aws` 生成 (後述)
- [.env](.env) — Dex 用のシークレット (ローカル前提でコミット済み)
- `.env.aws` — 本物 Cognito 用の OIDC 設定。`cognito-up.sh` が生成。client secret を含むため gitignore 済み

## ハマりどころ

- **`tanstackStartCookies()` は plugins 配列の最後に置く。** 順序を間違えると Cookie が正しくセットされない
- **issuer URL は `app` と `Browser` の双方から同じ URL で到達できないと OIDC の `iss` 検証で失敗する。** 本構成では `network_mode: service:db` でこれを担保
- **`pnpm db:push` の前に DevContainer 内で PostgreSQL の `sample` DB が立っていること。** 既存 compose で自動起動される
- **`.env` の値はリポジトリにコミットしている。** ローカル開発専用の固定値であり、本番では絶対に流用しない
- **provider のコールバック URL は providerId に対応する。** 本サンプルは providerId が `oidc` なので `/api/auth/oauth2/callback/oidc`。Dex の `redirectURIs` と Cognito App Client の `CallbackURLs` をこれに合わせている

## 本物の Amazon Cognito で試す

`.env` を書き換えずに、本物の Amazon Cognito でも動作確認できる。CloudFormation で検証用の User Pool を作成し、Vite の mode 機能で `.env.aws` を読み込む。

```bash
# 1. AWS 認証 (aws sts get-caller-identity が通る状態にする)
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
# リージョンのデフォルトは ap-northeast-1 (東京)

# 2. Cognito 一式を作成 (User Pool / Hosted UI ドメイン / App Client / テストユーザー)
#    完了すると .env.aws が生成される
./scripts/cognito-up.sh

# 3. 本物 Cognito で起動 (.env は触らず、.env.aws がマージされる)
pnpm dev:aws
#    → admin@example.com / Password1! でログイン

# 4. 後片付け (スタックごと削除)
./scripts/cognito-down.sh
```

`cognito-up.sh` は [infra/cognito.yaml](infra/cognito.yaml) を `cloudformation deploy` し、生成した値で `.env.aws` を書き出す。`pnpm dev:aws` (`vite dev --mode aws`) は `.env` (共通設定) に `.env.aws` (OIDC 設定) を上書きマージして読み込むため、ローカルの Dex 用の `.env` と並行して使える。

> Cognito のテストユーザーのパスワードは `Password1!` (Cognito のパスワードポリシーを満たす値)。Dex のサンプルユーザーの `password` とは別。

### ログアウト (IdP セッションの破棄)

Better Auth の `signOut` はアプリのセッション cookie を消すだけで、IdP 側のセッションは残る。本サンプルは `OIDC_LOGOUT_URI` 等が設定されているとき (= `.env.aws` 使用時) に Cognito の `/logout` へリダイレクトし、Hosted UI セッションも破棄する。ローカルの Dex では設定せず、ローカルセッションの破棄のみとしている。

## 参考リンク

- [Better Auth: TanStack Start Integration](https://better-auth.com/docs/integrations/tanstack)
- [Better Auth: Generic OAuth Plugin](https://better-auth.com/docs/plugins/generic-oauth)
- [Dex](https://dexidp.io/)
- [Amazon Cognito: Using OIDC identity providers with a user pool](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-oidc-idp.html)
