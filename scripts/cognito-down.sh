#!/usr/bin/env bash
#
# cognito-up.sh が作成した CloudFormation スタックを削除する。
# User Pool / ドメイン / App Client / テストユーザーはスタック削除でまとめて消える。
#
# 使い方: ./scripts/cognito-down.sh
#
set -euo pipefail

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-northeast-1}}"
STACK_NAME="${COGNITO_STACK_NAME:-tanstack-start-cognito-sample}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.aws"

aws() { command aws --region "${REGION}" "$@"; }

echo "==> スタック削除: ${STACK_NAME} (region: ${REGION})"
if ! aws cloudformation describe-stacks --stack-name "${STACK_NAME}" >/dev/null 2>&1; then
  echo "    スタックが存在しません (既に削除済み)"
  rm -f "${ENV_FILE}"
  exit 0
fi

aws cloudformation delete-stack --stack-name "${STACK_NAME}"
echo "==> 削除完了を待機中..."
aws cloudformation wait stack-delete-complete --stack-name "${STACK_NAME}"

rm -f "${ENV_FILE}"
echo "==> 完了 (.env.aws を削除)"
