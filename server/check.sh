#!/usr/bin/env bash
# 拾色 GRAFT · 上线自检(在任何能访问服务器的电脑上跑)
#   server/check.sh https://game.example.com
# 会提示输入口令。逐项检查鉴权、反爬、安全头是否生效。
set -uo pipefail
BASE="${1:?用法: server/check.sh https://你的域名}"; BASE="${BASE%/}"
UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
JAR=$(mktemp); trap 'rm -f "$JAR"' EXIT
PASS=0; FAIL=0
ok(){ printf '  \033[32m✓\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
bad(){ printf '  \033[31m✗\033[0m %s   (%s)\n' "$1" "$2"; FAIL=$((FAIL+1)); }
code(){ curl -s -o /dev/null -w '%{http_code}' -A "$UA" "$@"; }
expect(){ local name="$1" want="$2"; shift 2; local got; got=$(code "$@"); [ "$got" = "$want" ] && ok "$name → $got" || bad "$name" "期望 $want,实际 $got"; }

printf '口令: '; read -rs CODE; echo

echo "未登录"
expect "首页跳到口令页"                302 "$BASE/"
expect "游戏脚本拿不到"                302 "$BASE/static/game.0000000000.js"
expect "伪造的 cookie 无效"            302 "$BASE/" --cookie "gt_exp=9999999999; gt_id=x; gt_sig=AAAAAAAAAAAAAAAAAAAAAA"
expect "口令页可访问"                  200 "$BASE/__gate/login"
expect "robots.txt"                    200 "$BASE/robots.txt"

echo "反爬 / 扫描"
expect "curl 默认 UA 被拒"             403 "$BASE/" -A "curl/8.0"
expect "空 UA 被拒"                    403 "$BASE/" -A ""
expect "python-requests 被拒"          403 "$BASE/" -A "python-requests/2.31"
expect "DELETE 方法被拒"               405 -X DELETE "$BASE/"
expect ".git 不暴露"                   404 "$BASE/.git/config"
expect ".env 不暴露"                   404 "$BASE/.env"
expect "源码映射/备份不暴露"           404 "$BASE/static/game.js.map"
expect "错误口令"                      401 -X POST -d "code=definitely-wrong" "$BASE/__gate/login"
expect "跨站提交口令被拒"              403 -X POST -H "Origin: https://evil.example" --data-urlencode "code=$CODE" "$BASE/__gate/login"

echo "登录"
got=$(curl -s -o /dev/null -w '%{http_code}' -A "$UA" -c "$JAR" -X POST --data-urlencode "code=$CODE" "$BASE/__gate/login")
[ "$got" = "303" ] && ok "正确口令 → 303" || { bad "正确口令" "得到 $got(口令错了?或被限流/封禁)"; }
grep -q gt_sig "$JAR" && ok "拿到签名 cookie" || bad "签名 cookie" "没有"
H=$(curl -s -D - -o /dev/null -A "$UA" -b "$JAR" "$BASE/")
echo "$H" | head -1 | grep -q ' 200' && ok "登录后首页 200" || bad "登录后首页" "$(echo "$H" | head -1)"
for h in content-security-policy x-content-type-options x-frame-options referrer-policy x-robots-tag permissions-policy; do
  echo "$H" | grep -qi "^$h:" && ok "响应头 $h" || bad "响应头 $h" "缺失"
done
case "$BASE" in https://*) echo "$H" | grep -qi '^strict-transport-security:' && ok "HSTS" || bad "HSTS" "缺失";; esac
echo "$H" | grep -qi '^server: nginx/' && bad "隐藏版本号" "server 头暴露了版本" || ok "不暴露 nginx 版本"
JS=$(curl -s -A "$UA" -b "$JAR" "$BASE/" | grep -oE 'static/game\.[0-9a-f]+\.js' | head -1)
[ -n "$JS" ] && expect "登录后游戏脚本 200" 200 -b "$JAR" "$BASE/$JS" || bad "游戏脚本路径" "首页里没找到"
[ -n "$JS" ] && { curl -s -A "$UA" -b "$JAR" --compressed "$BASE/$JS" | grep -q '__game' && bad "调试钩子已移除" "生产包里还有 __game" || ok "生产包不含调试钩子"; }
ENC=$(curl -s -D - -o /dev/null -A "$UA" -b "$JAR" -H 'Accept-Encoding: gzip' "$BASE/$JS" | grep -i '^content-encoding' | tr -d '\r')
echo "$ENC" | grep -qi gzip && ok "gzip 压缩传输" || bad "gzip" "没压缩"
expect "manifest 免登录可取"           200 "$BASE/manifest.webmanifest"
expect "退出登录"                      303 -b "$JAR" "$BASE/__gate/logout"

echo
echo "通过 $PASS 项,失败 $FAIL 项"
[ $FAIL -eq 0 ]
