#!/usr/bin/env bash
# 一键跑全部自测:bash tests/run_all.sh
set -euo pipefail
cd "$(dirname "$0")/.."
echo "── 游戏:各关加载 / 自动通关 / 战斗"
node --check src/game.js
node --check src/beads.js
node --check src/harbor.js
node tests/smoke.js | tail -1
node tests/playthrough.js
node tests/combat.js
node tests/undo.js
node tests/editing.js
node tests/beads.js
node tests/harbor.js
node tests/jump-feel.js
node tests/journey.js
node tests/challenge.js
node tests/mobile.js
node tests/repair-batch1.js
node tests/input-states.js
node tests/grass.js
node tests/lava.js
node tests/devices.js
node tests/materials.js
node tests/channels.js
node tests/adventure.js
GRAFT_TEST_FPS=30 node tests/adventure.js
GRAFT_TEST_FPS=120 node tests/adventure.js
GRAFT_TEST_TOUCH=1 GRAFT_TEST_FPS=30 node tests/adventure.js
GRAFT_TEST_TOUCH=1 GRAFT_TEST_FPS=60 node tests/adventure.js
echo "── 口令网关"
python3 -I tests/test_gate.py 2>&1 | grep -E "^(Ran|OK|FAILED)|并发"
echo "── nginx 配置静态检查"
python3 tests/lint_nginx.py | tail -1
echo "── 脚本语法"
for f in server/*.sh tests/run_all.sh; do bash -n "$f"; done && echo "  shell 脚本语法 OK"
echo "── 生产构建"
GRAFT_NO_TERSER=${GRAFT_NO_TERSER:-1} python3 tools/build.py | tail -2
node --check dist/static/game.*.js
! grep -q "__game" dist/static/game.*.js && echo "  生产包不含调试钩子 ✓"
echo "全部通过"
