# tanstack-start-cognito-sample

[TanStack Start](https://tanstack.com/start) + [Better Auth](https://better-auth.com/) で Amazon Cognito (OIDC) ログインを行うサンプルアプリ。普段は [cognito-local](https://github.com/jagregory/cognito-local) (Cognito エミュレータ) で動かし、env を差し替えるだけで本物の Amazon Cognito でも動作確認できる ([実際の Amazon Cognito で試す](#実際の-amazon-cognito-で試す) を参照)。

ローカル開発専用のサンプルとして作っており、cognito-local 用のシークレットを含む `.env` もリポジトリにコミットしている。本番運用は想定していない。

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

- **discovery が `issuer` と `jwks_uri` しか返さない。** `authorization_endpoint` / `token_endpoint` を含まないため、[src/lib/auth.ts](src/lib/auth.ts) で `authorizationUrl` / `tokenUrl` を明示している。なお `discoveryUrl` は渡していない。Better Auth は `discoveryUrl` があると discovery レスポンスで `authorizationUrl` / `tokenUrl` を上書きするため、両エンドポイントを返さない cognito-local では sign-in が失敗してしまうのが理由。
- **userinfo エンドポイントが無い。** `getUserInfo` で id_token (JWT) をデコードしてユーザー情報を取り出している。自前デコードのため `iss` だけは `OIDC_ISSUER` と突き合わせて検証している。
- **id_token に `name` クレームが無い。** email のローカル部 (`@` の前) で代替している。
- **authorize / token は PKCE (S256) 必須。** `pkce: true` を指定している。
- **`/logout` エンドポイントが無い。** IdP ログアウト (後述) は本物の Cognito でのみ有効。cognito-local ではローカルセッションの破棄のみ行う。
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
| `pnpm dev` | 開発サーバ (port 3000, `--host` で DevContainer 外からも見える)。cognito-local を使う |
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

- [src/lib/auth.ts](src/lib/auth.ts) — Better Auth のサーバ側インスタンス。`genericOAuth` に `authorizationUrl` / `tokenUrl` を渡し、`pkce` と `getUserInfo` (id_token デコード + `iss` 検証) を設定。最後に `tanstackStartCookies()` を置く
- [src/lib/auth-client.ts](src/lib/auth-client.ts) — クライアント側 `authClient`
- [src/routes/api/auth/$.ts](src/routes/api/auth/$.ts) — Better Auth のスプラットルート (`/api/auth/*`)
- [src/routes/index.tsx](src/routes/index.tsx) — ログイン UI。`createServerFn` でセッションを取得して描画分岐。ログアウト時は IdP ログアウト URL があれば Cognito の `/logout` へ遷移
- [src/db/index.ts](src/db/index.ts) — `pg.Pool` + Drizzle。HMR で接続が増えないよう `globalThis` キャッシュ
- [src/db/schema.ts](src/db/schema.ts) — Better Auth CLI が生成した Drizzle スキーマ
- [.devcontainer/compose.yaml](.devcontainer/compose.yaml) — `app`, `db`, `pgadmin4`, `cognito` の構成
- [.devcontainer/cognito/](.devcontainer/cognito/) — cognito-local のシード (config / User Pool / Client / User)
- [infra/cognito.yaml](infra/cognito.yaml) — 本物の Cognito を作る CloudFormation テンプレート (User Pool / Hosted UI ドメイン / App Client)
- [scripts/cognito-up.sh](scripts/cognito-up.sh) / [scripts/cognito-down.sh](scripts/cognito-down.sh) — 上記スタックの作成・削除と `.env.aws` 生成 (後述)
- [.env](.env) — cognito-local 用のシークレット (ローカル前提でコミット済み)
- `.env.aws` — 本物 Cognito 用の OIDC 設定。`cognito-up.sh` が生成。client secret を含むため gitignore 済み

## ハマりどころ

- **`tanstackStartCookies()` は plugins 配列の最後に置く。** 順序を間違えると Cookie が正しくセットされない
- **issuer URL は `app` と `Browser` の双方から同じ URL で到達できないと OIDC の `iss` 検証で失敗する。** 本構成では `network_mode: service:db` でこれを担保
- **`OIDC_ISSUER` には User Pool ID が含まれる。** シード済み Pool の固定 ID (`local_cognitosample`) と一致させる必要がある
- **シードを変更した場合は cognito-local のボリュームを作り直す。** 初回起動時のみシードがコピーされる仕組みのため、`docker compose -f .devcontainer/compose.yaml down -v` でボリュームごと作り直す
- **`pnpm db:push` の前に DevContainer 内で PostgreSQL の `sample` DB が立っていること。** 既存 compose で自動起動される
- **`.env` の値はリポジトリにコミットしている。** ローカル開発専用の固定値であり、本番では絶対に流用しない

## 実際の Amazon Cognito で試す

本サンプルは `.env` を書き換えずに、本物の Amazon Cognito でも動作確認できる。CloudFormation で検証用の User Pool を作成し、Vite の mode 機能で `.env.aws` を読み込む。

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

`cognito-up.sh` は [infra/cognito.yaml](infra/cognito.yaml) を `cloudformation deploy` し、生成した値で [.env.aws](.env.aws) を書き出す。`pnpm dev:aws` (`vite dev --mode aws`) は `.env` (共通設定) に `.env.aws` (OIDC 設定) を上書きマージして読み込むため、cognito-local 用の `.env` と並行して使える。

### コードは cognito-local とそのまま共有できる

本物の Cognito は discovery に authorization / token エンドポイントを含み、userinfo エンドポイントも持つが、本サンプルの [src/lib/auth.ts](src/lib/auth.ts) は discovery に依存せず `authorizationUrl` / `tokenUrl` を明示し、`getUserInfo` を自前実装している。本物の Cognito でもエンドポイントのパスは同じ (`/oauth2/authorize`, `/oauth2/token`) で、id_token も標準 JWT のため、**コード変更なしで env の差し替えだけで両対応できる**。

### ログアウト

Better Auth の `signOut` はアプリのセッション cookie を消すだけで、Cognito 側の Hosted UI セッションは残る。本サンプルは `OIDC_LOGOUT_URI` が設定されているとき (= `.env.aws` 使用時) に Cognito の `/logout` へリダイレクトし、IdP セッションも破棄する。cognito-local には `/logout` が無いため、`.env` には設定せずローカルログアウトのみとしている。

## 参考リンク

- [Better Auth: TanStack Start Integration](https://better-auth.com/docs/integrations/tanstack)
- [Better Auth: Generic OAuth Plugin](https://better-auth.com/docs/plugins/generic-oauth)
- [cognito-local](https://github.com/jagregory/cognito-local)
- [Amazon Cognito: Using OIDC identity providers with a user pool](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-oidc-idp.html)
