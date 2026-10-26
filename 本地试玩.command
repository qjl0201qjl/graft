#!/bin/bash
# 双击启动本地试玩:自动找空闲端口、打开浏览器,并显示手机访问地址。关掉这个窗口就停止。
cd "$(dirname "$0")"
PORT=8000
while lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; do PORT=$((PORT+1)); done
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
clear
echo "拾色 GRAFT · 本地试玩"
echo
echo "  电脑浏览器:  http://localhost:$PORT"
[ -n "$IP" ] && echo "  手机(连同一个 Wi-Fi):  http://$IP:$PORT"
echo "  跳关:地址后加 ?lv=3(第 4 关),游戏里按 N 跳下一关"
echo
echo "  关掉这个窗口(或按 Ctrl+C)就停止"
echo
(sleep 1; open "http://localhost:$PORT/") &
exec python3 -m http.server "$PORT" --bind 0.0.0.0
