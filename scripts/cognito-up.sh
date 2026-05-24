#!/usr/bin/env bash
#
# 本物の Amazon Cognito を CloudFormation で作成し、検証用テストユーザーを投入する。
# 末尾で .env.aws を生成するので、cp .env.aws .env で本物 Cognito に切り替えられる。
#
# 作成されるもの (infra/cognito.yaml):
#   - User Pool / Hosted UI ドメイン / App Client (secret あり)
#   - テストユーザー (このスクリプトが admin API で作成・パスワード確定)
#
# 前提: aws CLI v2 が認証済み (aws sts get-caller-identity が通ること)。
# 使い方: ./scripts/cognito-up.sh
# 後片付け: ./scripts/cognito-down.sh
#
set -euo pipefail

# ---- 設定 (環境変数で上書き可) ----------------------------------------------
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-northeast-1}}"
STACK_NAME="${COGNITO_STACK_NAME:-tanstack-start-cognito-sample}"
POOL_NAME="${COGNITO_POOL_NAME:-tanstack-start-sample}"
# Hosted UI ドメインはグローバルで一意である必要があるため suffix を足す。
DOMAIN_PREFIX="${COGNITO_DOMAIN_PREFIX:-tss-$(date +%s)}"
CALLBACK_URL="${COGNITO_CALLBACK_URL:-http://localhost:3000/api/auth/oauth2/callback/cognito}"
LOGOUT_URL="${COGNITO_LOGOUT_URL:-http://localhost:3000/}"
TEST_EMAIL="${COGNITO_TEST_EMAIL:-admin@example.com}"
TEST_PASSWORD="${COGNITO_TEST_PASSWORD:-Password1!}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEMPLATE="${ROOT_DIR}/infra/cognito.yaml"
ENV_FILE="${ROOT_DIR}/.env.aws"

aws() { command aws --region "${REGION}" "$@"; }
output() { aws cloudformation describe-stacks --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }

echo "==> AWS 認証確認"
command aws sts get-caller-identity >/dev/null
echo "    region: ${REGION} / stack: ${STACK_NAME}"

# 既存スタックがあればドメインを再利用 (deploy が冪等に更新するため作り直し不要)
EXISTING_DOMAIN="$(output AuthBase 2>/dev/null | sed -E 's#https://([^.]+)\..*#\1#' || true)"
if [[ -n "${EXISTING_DOMAIN}" && "${EXISTING_DOMAIN}" != "None" ]]; then
  DOMAIN_PREFIX="${EXISTING_DOMAIN}"
  echo "    既存ドメインを再利用: ${DOMAIN_PREFIX}"
fi

echo "==> CloudFormation deploy"
aws cloudformation deploy \
  --stack-name "${STACK_NAME}" \
  --template-file "${TEMPLATE}" \
  --parameter-overrides \
    "PoolName=${POOL_NAME}" \
    "DomainPrefix=${DOMAIN_PREFIX}" \
    "CallbackUrl=${CALLBACK_URL}" \
    "LogoutUrl=${LOGOUT_URL}" \
  --no-fail-on-empty-changeset

# ---- Output 取得 -------------------------------------------------------------
POOL_ID="$(output UserPoolId)"
CLIENT_ID="$(output ClientId)"
ISSUER="$(output Issuer)"
AUTH_BASE="$(output AuthBase)"
echo "    UserPoolId: ${POOL_ID}"
echo "    ClientId:   ${CLIENT_ID}"

# client secret は CFn Output に出せないため API で取得する。
CLIENT_SECRET="$(aws cognito-idp describe-user-pool-client \
  --user-pool-id "${POOL_ID}" --client-id "${CLIENT_ID}" \
  --query 'UserPoolClient.ClientSecret' --output text)"

# ---- テストユーザー (冪等: 既にいれば作成をスキップ) ------------------------
echo "==> テストユーザー: ${TEST_EMAIL}"
if aws cognito-idp admin-get-user \
     --user-pool-id "${POOL_ID}" --username "${TEST_EMAIL}" >/dev/null 2>&1; then
  echo "    既存ユーザーを再利用"
else
  aws cognito-idp admin-create-user \
    --user-pool-id "${POOL_ID}" \
    --username "${TEST_EMAIL}" \
    --user-attributes "Name=email,Value=${TEST_EMAIL}" "Name=email_verified,Value=true" \
    --message-action SUPPRESS >/dev/null
fi
aws cognito-idp admin-set-user-password \
  --user-pool-id "${POOL_ID}" \
  --username "${TEST_EMAIL}" \
  --password "${TEST_PASSWORD}" \
  --permanent >/dev/null

# ---- .env.aws 生成 -----------------------------------------------------------
# Vite の mode 機能で .env (共通) に上書きマージされるため、OIDC 4 項目のみ書く。
# 起動は pnpm dev:aws (= vite dev --mode aws)。.env は触らないので cognito-local と
# 並行して使える。BETTER_AUTH_* / DATABASE_URL は .env からそのまま継承される。
cat > "${ENV_FILE}" <<ENV
# scripts/cognito-up.sh が生成。本物の Amazon Cognito 向けの OIDC 設定。
# 起動: pnpm dev:aws  (.env の共通設定にこのファイルがマージされる)

# OIDC_ISSUER は id_token の iss 検証に使う。Pool ID を含む。
OIDC_ISSUER=${ISSUER}
# OIDC_AUTH_BASE は Hosted UI ドメイン。authorize / token / logout はこの配下にある。
OIDC_AUTH_BASE=${AUTH_BASE}
OIDC_CLIENT_ID=${CLIENT_ID}
OIDC_CLIENT_SECRET=${CLIENT_SECRET}
# IdP ログアウト後の戻り先。Cognito の logout_uri に渡す (App Client の LogoutURLs に登録済み)。
OIDC_LOGOUT_URI=${LOGOUT_URL}
ENV

echo ""
echo "==> 完了"
echo "    生成: ${ENV_FILE}"
echo ""
echo "  本物 Cognito で起動 (.env は触らない):"
echo "    pnpm dev:aws"
echo "    ログイン: ${TEST_EMAIL} / ${TEST_PASSWORD}"
echo ""
echo "  後片付け:"
echo "    ./scripts/cognito-down.sh"
