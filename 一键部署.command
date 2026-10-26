#!/bin/bash
# 无人值守部署到 8.137.175.63:8080(要求这台 Mac 已能免密码 SSH 登录 root)。
# 首次安装时自动生成访问口令并显示在屏幕上;不改 80 端口上的消防项目。
cd "$(dirname "$0")"
IP=8.137.175.63; PORT=8080; H="root@$IP"
pause(){ echo; read -r -p "按回车关闭窗口" _; }
clear; echo "拾色 GRAFT · 一键部署到 $IP:$PORT"; echo "──────────────────────────────"
ssh -o BatchMode=yes -o ConnectTimeout=10 "$H" true 2>/dev/null || { echo "✗ 还不能免密码登录,请先运行「部署到服务器.command」"; pause; exit 1; }
echo "▸ 免密码登录 ✓"
if ssh -o BatchMode=yes "$H" 'bash -s' < server/ready.sh; then
  echo "▸ 已安装过,只发布新版本"
  server/deploy.sh "$H" || { echo "✗ 发布失败"; pause; exit 1; }
else
  W=(huo shui shi cao rou feng yun shan he hai xing yue guang ying lan zi hong lv jin yin tie mu tu bing xue lei dian sha lin ye hua guo cha mi tang dou mao gou yu niao long hu)
  CODE="${W[RANDOM % ${#W[@]}]}-${W[RANDOM % ${#W[@]}]}-$((RANDOM % 900 + 100))"
  echo "▸ 安装或修复服务(已有邀请码会保留;没有时自动生成)"
  rsync -az --delete -e "ssh -o BatchMode=yes" server/ "$H:graft-server/" || { echo "✗ 上传失败"; pause; exit 1; }
  printf '%s\n' "$CODE" | ssh -o BatchMode=yes "$H" 'read -r GRAFT_CODE; export GRAFT_CODE; if python3 -c '\''import json; assert json.load(open("/etc/graft/codes.json")).get("codes")'\'' 2>/dev/null; then unset GRAFT_CODE; fi; bash ~/graft-server/install.sh --port 8080 </dev/null' \
    || { echo "✗ 安装失败,把上面的报错截图发给 Claude"; pause; exit 1; }
  if ! printf '%s\n' "$CODE" | ssh -o BatchMode=yes "$H" 'read -r GRAFT_CODE; export GRAFT_CODE; python3 -I -c '\''import os,sys; sys.path.insert(0,"/opt/graft"); import gate; assert gate.Store("/etc/graft").check(os.environ["GRAFT_CODE"]) is not None'\''' >/dev/null 2>&1; then CODE=""; fi
  server/deploy.sh "$H" || { echo "✗ 发布失败"; pause; exit 1; }
fi
echo; echo "▸ 检查"
code=$(curl -s -o /dev/null -m 10 -A "Mozilla/5.0" -w '%{http_code}' "http://$IP:$PORT/")
code80=$(curl -s -o /dev/null -m 10 -A "Mozilla/5.0" -w '%{http_code}' "http://$IP/")
echo "  游戏 http://$IP:$PORT/ → $code   (302 = 正常,会跳到口令页)"
echo "  消防 http://$IP/      → $code80"
echo
echo "══════════════════════════════"
[ -n "$CODE" ] && echo "  访问口令:  $CODE" && echo "  (以后改口令:ssh $H 'graft-code add 新名字')"
echo "  地址:      http://$IP:$PORT/"
echo "══════════════════════════════"
echo "DEPLOY-DONE"
pause
