#!/usr/bin/env bash
# 拾色 GRAFT · 在你自己电脑上运行(macOS / Linux),把游戏发布到服务器
#
#   首次安装服务器:  server/deploy.sh user@host --install --domain game.example.com --email you@example.com
#                    (没有域名就把 --domain/--email 换成 --http-only;其它参数原样传给 install.sh)
#   发布新版本:      server/deploy.sh user@host
#   回滚到上一版:    server/deploy.sh user@host --rollback
#
# 前提:能用 SSH 密钥登录服务器(ssh-copy-id user@host),该用户有 sudo 权限。
# 兼容 macOS 自带的 bash 3.2。
set -euo pipefail
cd "$(dirname "$0")/.."
[ $# -ge 1 ] || { sed -n '2,10p' "$0"; exit 1; }
HOST="$1"; shift
MODE=deploy
if [ "${1:-}" = "--install" ]; then MODE=install; shift; fi
if [ "${1:-}" = "--rollback" ]; then MODE=rollback; shift; fi
say(){ printf '\n\033[1;35m▸ %s\033[0m\n' "$*"; }
SSH_OPTS="-o ConnectTimeout=10 -o ServerAliveInterval=15"

case "$MODE" in
install)
  say "上传服务端文件到 $HOST:~/graft-server/"
  rsync -az --delete -e "ssh $SSH_OPTS" server/ "$HOST:graft-server/"
  say "在服务器上运行安装(会要求输入 sudo 密码和第一个访问口令)"
  ssh -t $SSH_OPTS "$HOST" "sudo bash ~/graft-server/install.sh $*"
  say "安装完成,接着发布游戏"
  exec "$0" "$HOST"
  ;;
rollback)
  ssh $SSH_OPTS "$HOST" 'set -e; cd /srv/graft/releases
    cur=$(basename "$(readlink -f /srv/graft/current)")
    prev=$(ls -1 | grep -v placeholder | sort | grep -B1 -x "$cur" | head -1)
    [ -n "$prev" ] && [ "$prev" != "$cur" ] || { echo "没有更早的版本"; exit 1; }
    ln -sfn "/srv/graft/releases/$prev" /srv/graft/current.tmp && mv -Tf /srv/graft/current.tmp /srv/graft/current
    echo "已回滚: $cur → $prev"'
  ;;
deploy)
  say "检查服务器安装状态"
  ssh $SSH_OPTS "$HOST" 'bash -s' < server/ready.sh || {
    echo "服务安装不完整或未启动。请运行安装模式修复: server/deploy.sh $HOST --install --port 8080"
    exit 1
  }
  if command -v node >/dev/null 2>&1; then
    say "跑自动化测试"
    node tests/smoke.js >/dev/null
    node tests/playthrough.js
    node tests/combat.js
    node tests/adventure.js
    node tests/devices.js
    node tests/materials.js
    node tests/channels.js
    node tests/input-states.js
    node tests/lava.js
  else
    echo "(没装 node,跳过游戏测试)"
  fi
  say "生产构建"
  python3 tools/build.py
  REL=$(date +%Y%m%d-%H%M%S)
  say "上传 → /srv/graft/releases/$REL"
  # 只用最基本的 rsync 参数:兼容 macOS 自带的 openrsync / 老版 rsync
  rsync -rz -e "ssh $SSH_OPTS" dist/ "$HOST:/srv/graft/releases/$REL/"
  say "切换版本(原子操作,玩家无感)"
  ssh $SSH_OPTS "$HOST" "set -e
    test -s /srv/graft/releases/$REL/index.html
    chmod -R u=rwX,go=rX /srv/graft/releases/$REL
    ln -sfn /srv/graft/releases/$REL /srv/graft/current.tmp && mv -Tf /srv/graft/current.tmp /srv/graft/current
    cd /srv/graft/releases && ls -1 | grep -v placeholder | sort | head -n -5 | xargs -r rm -rf
    echo \"当前版本: \$(basename \$(readlink -f /srv/graft/current)),保留最近 5 个版本\""
  say "完成。玩家刷新页面即可拿到新版本"
  ;;
esac
