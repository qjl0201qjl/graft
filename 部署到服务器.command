#!/bin/bash
# 双击:把游戏部署到 8.137.175.63 的独立端口(默认 8080)。
# 不碰 80 端口上已有的网站(消防项目),不改服务器的 SSH / 防火墙设置。
cd "$(dirname "$0")"
IP=8.137.175.63
PORT=8080
pause(){ echo; read -r -p "按回车关闭窗口" _; }
clear
echo "拾色 GRAFT · 部署到 $IP:$PORT"
echo "(80 端口上的已有网站不受影响)"
echo "──────────────────────────────"
read -r -p "登录服务器用的用户名 [root]: " U; U=${U:-root}
H="$U@$IP"

echo; echo "▸ 1/4 配置免密码登录(SSH 密钥)"
if [ ! -f ~/.ssh/id_ed25519.pub ] && [ ! -f ~/.ssh/id_rsa.pub ]; then
  ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 -C "graft-deploy" >/dev/null && echo "  已为这台 Mac 生成 SSH 密钥"
fi
if ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$H" true 2>/dev/null; then
  echo "  已经可以免密码登录 ✓"
else
  echo "  第一次需要输入一次【服务器密码】,把这台 Mac 的公钥放上去:"
  ssh-copy-id -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "$H" || {
    echo; echo "✗ 连不上或密码不对。请确认 IP、用户名、密码,以及安全组放行了 22 端口。"; pause; exit 1; }
fi

echo; echo "▸ 2/4 检查服务器(只读,不做任何修改)"
ssh -o ConnectTimeout=10 "$H" "PORT=$PORT bash -s" <<'REMOTE'
. /etc/os-release 2>/dev/null; echo "  系统:${PRETTY_NAME:-未知}"
command -v apt-get >/dev/null 2>&1 || exit 3
L=$( (sudo -n ss -tlnp 2>/dev/null || ss -tln) )
echo "  80 端口(消防项目,不会动它):"
echo "$L" | awk '/:80 / {print "    " $0; f=1} END {if (!f) print "    (没有)"}'
[ -d /www/server/panel ] && echo "  检测到宝塔面板:游戏会用系统自带的 nginx 跑在独立端口上,和宝塔的网站互不影响"
if [ -x /usr/local/sbin/graft-code ]; then echo "  检测到拾色安装记录,后续会检查服务是否完整并修复"; exit 0; fi
busy=0
for p in $PORT 8091; do
  if echo "$L" | grep -qE "[:.]$p\s"; then echo "  ✗ 端口 $p 已经被占用:"; echo "$L" | grep -E "[:.]$p\s" | sed 's/^/    /'; busy=1; fi
done
[ $busy -eq 0 ] && echo "  端口 $PORT 和 8091 空闲 ✓"
exit $((busy*4))
REMOTE
rc=$?
case $rc in
  0) ;;
  3) echo; echo "✗ 这台服务器不是 Ubuntu / Debian,安装脚本暂不支持。把上面「系统」那一行告诉 Claude。"; pause; exit 1;;
  4) echo; echo "✗ 需要的端口被占用了,把上面的信息告诉 Claude 换一个端口。"; pause; exit 1;;
  *) echo; echo "✗ 检查失败(代码 $rc)"; pause; exit 1;;
esac
echo
read -r -p "  在 $PORT 端口部署游戏?(y/N) " ok
case "$ok" in y|Y|yes) ;; *) echo "已取消"; pause; exit 0;; esac

echo; echo "▸ 3/4 安装 / 更新"
if ssh "$H" 'bash -s' < server/ready.sh; then
  server/deploy.sh "$H" || { echo "✗ 发布失败"; pause; exit 1; }
else
  echo "  首次安装:中途会让你【设置访问口令】(至少 8 位),玩家扫码后要输入它"
  server/deploy.sh "$H" --install --port "$PORT" || { echo "✗ 安装失败,把上面的报错发给 Claude"; pause; exit 1; }
fi

echo; echo "▸ 4/4 检查"
code=$(curl -s -o /dev/null -m 10 -A "Mozilla/5.0" -w '%{http_code}' "http://$IP:$PORT/")
if [ "$code" = "302" ] || [ "$code" = "200" ]; then
  echo "  ✓ http://$IP:$PORT/ 已经可以访问"
else
  echo "  ! 访问 http://$IP:$PORT/ 没有响应(代码 $code)"
  echo "    去阿里云控制台 → 安全组 → 入方向,放行 TCP $PORT 端口,再刷新"
fi
code80=$(curl -s -o /dev/null -m 10 -A "Mozilla/5.0" -w '%{http_code}' "http://$IP/")
echo "  80 端口(消防项目)状态码:$code80"
echo
echo "  手机扫码,或打开 http://$IP:$PORT/ ,输入你设置的口令"
open "http://$IP:$PORT/"
pause
