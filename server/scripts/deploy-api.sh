#!/usr/bin/env bash
# 将本地 server/ 同步到阿里云并重启 petmaster-api
# 用法：
#   DEPLOY_HOST=root@116.62.185.48 ./scripts/deploy-api.sh
#   DEPLOY_HOST=root@116.62.185.48 DEPLOY_KEY=~/.ssh/your_key ./scripts/deploy-api.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${DEPLOY_HOST:-}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-/opt/petmaster/server}"
KEY="${DEPLOY_KEY:-}"

if [[ -z "$HOST" ]]; then
  echo "请设置 DEPLOY_HOST，例如：DEPLOY_HOST=root@116.62.185.48 $0" >&2
  exit 1
fi

SSH_OPTS=(-o IdentitiesOnly=yes -o BatchMode=yes)
if [[ -n "$KEY" ]]; then
  SSH_OPTS+=(-i "$KEY")
fi

echo "==> rsync $ROOT/ -> $HOST:$REMOTE_DIR/"
rsync -az --delete \
  --exclude node_modules \
  --exclude .env \
  --exclude '.git' \
  -e "ssh ${SSH_OPTS[*]}" \
  "$ROOT/" "$HOST:$REMOTE_DIR/"

echo "==> npm install + pm2 restart"
ssh "${SSH_OPTS[@]}" "$HOST" "bash -lc '
  set -e
  cd \"$REMOTE_DIR\"
  npm install --production
  pm2 restart petmaster-api || pm2 start src/app.js --name petmaster-api
  pm2 save
  curl -sS http://127.0.0.1:3000/health
  echo
  pm2 logs petmaster-api --lines 20 --nostream | tail -30
'"

echo "==> done"
