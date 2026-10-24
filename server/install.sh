#!/usr/bin/env bash
# 拾色 GRAFT · 服务器一键安装(Ubuntu 20.04+/Debian 11+,需要 sudo)
#
#   有域名(推荐):sudo bash install.sh --domain game.example.com --email you@example.com
#   只有公网 IP:  sudo bash install.sh --http-only
#
# 可选参数:
#   --trusted "1.2.3.0/24 5.6.7.8"   不限流、不封禁的 IP(校园网出口、你压测用的机器)
#   --ssh-port 22                    SSH 端口
#   --allow-ports 8888,6006          机器上其它要保留对外的端口(传给 harden.sh)
#   --force-ssh-keys                 机器上有其他用户时也强制改为仅密钥登录
#   --no-harden                      不做 SSH / 防火墙 / 内核加固
#
# 重复运行是安全的:已有的口令、密钥、证书都会保留。
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOMAIN=""; EMAIL=""; HTTP_ONLY=0; TRUSTED=""; SSH_PORT=22; HARDEN=1; HARDEN_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2;;
    --email) EMAIL="$2"; shift 2;;
    --http-only) HTTP_ONLY=1; shift;;
    --trusted) TRUSTED="$2"; shift 2;;
    --ssh-port) SSH_PORT="$2"; HARDEN_ARGS+=(--ssh-port "$2"); shift 2;;
    --allow-ports) HARDEN_ARGS+=(--allow-ports "$2"); shift 2;;
    --force-ssh-keys) HARDEN_ARGS+=(--force-ssh-keys); shift;;
    --no-harden) HARDEN=0; shift;;
    -h|--help) sed -n '2,17p' "$0"; exit 0;;
    *) echo "未知参数 $1(--help 查看用法)"; exit 1;;
  esac
done
say(){ printf '\n\033[1;35m▸ %s\033[0m\n' "$*"; }
warn(){ printf '\033[1;33m! %s\033[0m\n' "$*"; }
die(){ printf '\033[1;31m✗ %s\033[0m\n' "$*"; exit 1; }

[[ $EUID -eq 0 ]] || die "请用 sudo 运行"
command -v apt-get >/dev/null || die "目前只支持 Ubuntu / Debian"
if [[ $HTTP_ONLY -eq 0 ]]; then
  [[ -n "$DOMAIN" ]] || die "需要 --domain(或者用 --http-only)"
  [[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "域名格式不对:$DOMAIN"
  [[ -n "$EMAIL" ]] || die "申请 HTTPS 证书需要 --email(证书快过期时 Let's Encrypt 会发邮件提醒)"
fi
DEPLOY_USER="${SUDO_USER:-root}"
for f in gate.py graft-gate.service harden.sh nginx/graft-http.conf nginx/graft-app.conf; do
  [[ -f "$HERE/$f" ]] || die "缺少文件 $HERE/$f,请把整个 server 目录传上来"
done

# ───────────────────────── 1. 软件包
say "安装软件包"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
PKGS=(nginx python3 fail2ban python3-systemd ufw unattended-upgrades rsync curl)
[[ $HTTP_ONLY -eq 0 ]] && PKGS+=(certbot)
apt-get install -y -qq "${PKGS[@]}" >/dev/null
NGV=$(nginx -V 2>&1)
grep -q http_secure_link_module <<<"$NGV" || die "当前 nginx 没有 secure_link 模块。请安装 nginx-core 或 nginx-full: apt-get install nginx-core"
grep -q http_gzip_static_module <<<"$NGV" || die "当前 nginx 没有 gzip_static 模块。请安装 nginx-core"
say "nginx $(nginx -v 2>&1 | sed 's/.*\///') ✓ secure_link ✓ gzip_static"

# ───────────────────────── 2. 账号与目录
say "创建网关账号与目录"
id graftgate >/dev/null 2>&1 || useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin graftgate
install -d -o root -g graftgate -m 750 /etc/graft
install -d -o root -g root -m 755 /opt/graft
install -o root -g root -m 644 "$HERE/gate.py" /opt/graft/gate.py
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 755 /srv/graft /srv/graft/releases
install -d -m 755 /var/www/letsencrypt
if [[ ! -e /srv/graft/current ]]; then
  install -d -o "$DEPLOY_USER" -m 755 /srv/graft/releases/0-placeholder
  echo '<!doctype html><meta charset="utf-8"><title>拾色</title><p style="font:16px sans-serif;text-align:center;margin-top:30vh">游戏还没部署,稍后再来</p>' \
    > /srv/graft/releases/0-placeholder/index.html
  ln -sfn /srv/graft/releases/0-placeholder /srv/graft/current
  chown -h "$DEPLOY_USER:$DEPLOY_USER" /srv/graft/current
fi
# 管理口令的快捷命令
cat > /usr/local/sbin/graft-code <<'SH'
#!/bin/sh
# 用法: sudo graft-code add 班级A | list | remove 班级A | logout-all
set -e
G="python3 -I /opt/graft/gate.py --conf /etc/graft"
case "$1" in
  add)        $G add-code --label "${2:?需要一个名字,例如 sudo graft-code add 班级A}";;
  list)       $G list-codes;;
  remove)     $G remove-code --label "${2:?需要名字}";;
  logout-all) $G rotate-secret && nginx -t -q && systemctl reload nginx;;
  *) echo "用法: sudo graft-code add <名字> | list | remove <名字> | logout-all"; exit 1;;
esac
chgrp graftgate /etc/graft/* 2>/dev/null || true
SH
chmod 750 /usr/local/sbin/graft-code

# ───────────────────────── 3. 密钥、口令、白名单
say "配置签名密钥与访问口令"
install -d -m 755 /etc/nginx/snippets
if [[ ! -s /etc/graft/secret || ! -s /etc/nginx/snippets/graft-secret.conf ]]; then
  python3 -I /opt/graft/gate.py --conf /etc/graft rotate-secret >/dev/null
  say "已生成新的签名密钥"
fi
chown root:graftgate /etc/graft/secret; chmod 640 /etc/graft/secret
chown root:root /etc/nginx/snippets/graft-secret.conf; chmod 600 /etc/nginx/snippets/graft-secret.conf
if [[ ! -s /etc/graft/codes.json ]] || ! grep -q pbkdf2 /etc/graft/codes.json; then
  echo "现在设置第一个访问口令(之后可以用 sudo graft-code add <名字> 增加更多邀请码)"
  python3 -I /opt/graft/gate.py --conf /etc/graft add-code --label default
fi
chown root:graftgate /etc/graft/codes.json; chmod 640 /etc/graft/codes.json
{
  echo "# 不限流、不封禁的 IP。格式:每行 \"1.2.3.0/24 1;\"。改完执行 sudo systemctl reload nginx"
  for ip in $TRUSTED; do echo "$ip 1;"; done
  [[ -f /etc/graft/trusted-ips.conf ]] && grep -E '^[0-9a-fA-F:.]+(/[0-9]+)? 1;' /etc/graft/trusted-ips.conf || true
} | awk '!seen[$0]++' > /etc/graft/trusted-ips.conf.new
mv /etc/graft/trusted-ips.conf.new /etc/graft/trusted-ips.conf
chmod 644 /etc/graft/trusted-ips.conf

# ───────────────────────── 4. 口令网关服务
say "启动口令网关"
install -m 644 "$HERE/graft-gate.service" /etc/systemd/system/graft-gate.service
systemctl daemon-reload
systemctl enable graft-gate >/dev/null 2>&1
systemctl restart graft-gate
for i in 1 2 3 4 5 6 7 8 9 10; do curl -fsS -o /dev/null http://127.0.0.1:8091/__gate/health && break; sleep 0.5; done
curl -fsS -o /dev/null http://127.0.0.1:8091/__gate/health || { journalctl -u graft-gate -n 20 --no-pager; die "网关没起来"; }
say "网关运行中 (127.0.0.1:8091)"

# ───────────────────────── 5. nginx
say "配置 nginx"
BK=/root/graft-nginx-backup-$(date +%Y%m%d-%H%M%S)
mkdir -p "$BK"; cp -a /etc/nginx "$BK/"
rollback(){ warn "nginx 配置检查失败,恢复备份 $BK"; rm -rf /etc/nginx; cp -a "$BK/nginx" /etc/nginx; nginx -t && systemctl reload nginx; exit 1; }

# 全局调优:worker 连接数(默认 768 太小)、文件句柄
sed -i -E 's/^(\s*worker_connections)\s+[0-9]+;/\1 4096;/' /etc/nginx/nginx.conf
grep -q '^worker_rlimit_nofile' /etc/nginx/nginx.conf || sed -i -E 's/^(worker_processes[^;]*;)/\1\nworker_rlimit_nofile 65535;/' /etc/nginx/nginx.conf
grep -qE '^\s*server_tokens\s+off;' /etc/nginx/nginx.conf || sed -i -E 's/^(\s*)#?\s*server_tokens\s+o(n|ff);/\1server_tokens off;/' /etc/nginx/nginx.conf

install -m 644 "$HERE/nginx/graft-http.conf" /etc/nginx/conf.d/graft-http.conf
for f in graft-app graft-auth graft-headers graft-csp graft-proxy; do
  install -m 644 "$HERE/nginx/$f.conf" "/etc/nginx/snippets/$f.conf"
done
rm -f /etc/nginx/sites-enabled/default
touch /var/log/nginx/graft.access.log /var/log/nginx/graft.error.log

render(){ # $1=模板
  local out; out=$(sed "s/__DOMAIN__/${DOMAIN}/g" "$HERE/nginx/$1")
  [[ -f /proc/net/if_inet6 ]] || out=$(grep -v 'listen \[::\]' <<<"$out")   # 机器没开 IPv6
  printf '%s\n' "$out" > /etc/nginx/sites-available/graft
  ln -sfn /etc/nginx/sites-available/graft /etc/nginx/sites-enabled/graft
}

if [[ $HTTP_ONLY -eq 1 ]]; then
  render site-http.conf.tpl
  warn "HTTP 模式:口令和 cookie 会明文传输。有域名后请用 --domain 重新运行。"
else
  if [[ ! -s /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]]; then
    say "申请 HTTPS 证书($DOMAIN)"
    render site-acme.conf.tpl
    nginx -t -q || rollback
    systemctl reload nginx || systemctl restart nginx
    certbot certonly --webroot -w /var/www/letsencrypt -d "$DOMAIN" --email "$EMAIL" \
      --agree-tos --no-eff-email --non-interactive \
      || die "证书申请失败。请确认:1) 域名已解析到本机公网 IP  2) 云服务器安全组放行 80/443  3) 大陆服务器需完成 ICP 备案"
  fi
  install -d /etc/letsencrypt/renewal-hooks/deploy
  printf '#!/bin/sh\nnginx -t -q && systemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/graft-reload-nginx.sh
  chmod 755 /etc/letsencrypt/renewal-hooks/deploy/graft-reload-nginx.sh
  render site-https.conf.tpl
fi
nginx -t -q 2>/dev/null || { nginx -t; rollback; }
systemctl enable nginx >/dev/null 2>&1
systemctl reload nginx || systemctl restart nginx
say "nginx 已加载新配置(旧配置备份在 $BK)"

# ───────────────────────── 6. fail2ban
say "配置 fail2ban"
IGN="127.0.0.1/8 ::1 100.64.0.0/10 fd7a:115c:a1e0::/48 $TRUSTED"
install -m 644 "$HERE/fail2ban/filter-graft-gate.conf" /etc/fail2ban/filter.d/graft-gate.conf
install -m 644 "$HERE/fail2ban/filter-graft-scan.conf" /etc/fail2ban/filter.d/graft-scan.conf
install -m 644 "$HERE/fail2ban/filter-graft-badua.conf" /etc/fail2ban/filter.d/graft-badua.conf
sed "s#__IGNOREIP__#${IGN}#g" "$HERE/fail2ban/jail-graft.conf.tpl" > /etc/fail2ban/jail.d/graft.conf
sed -i -E "s/^(\[sshd\])$/\1\nport = ${SSH_PORT}/" /etc/fail2ban/jail.d/graft.conf
fail2ban-client -t >/dev/null || die "fail2ban 配置检查失败"
systemctl enable fail2ban >/dev/null 2>&1
systemctl restart fail2ban
sleep 1; fail2ban-client status | sed 's/^/   /'

# ───────────────────────── 7. 系统加固
if [[ $HARDEN -eq 1 ]]; then
  say "系统加固"
  bash "$HERE/harden.sh" "${HARDEN_ARGS[@]}"
fi

# ───────────────────────── 完成
URL=$([[ $HTTP_ONLY -eq 1 ]] && echo "http://<服务器公网IP>/" || echo "https://$DOMAIN/")
cat <<DONE

$(printf '\033[1;32m')✓ 安装完成$(printf '\033[0m')

  地址:        $URL
  发布游戏:    在你自己电脑上的项目目录执行  server/deploy.sh $DEPLOY_USER@<服务器>
  管理口令:    sudo graft-code add 班级B   /  list  /  remove 班级B  /  logout-all
  白名单:      /etc/graft/trusted-ips.conf
  查看封禁:    sudo fail2ban-client status graft-gate
  网关日志:    journalctl -u graft-gate -f
DONE
