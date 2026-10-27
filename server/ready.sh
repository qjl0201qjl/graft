#!/usr/bin/env bash
# 通过 SSH 运行: ssh host 'bash -s' < server/ready.sh
# 管理命令存在不代表安装完成;必须确认配置、邀请码和服务都可用。
set -euo pipefail
# 网关健康检查会验证邀请码与密钥,发布账号无需读取这些私有文件。
test -s /etc/nginx/snippets/graft-secret.conf
test -s /etc/nginx/sites-enabled/graft
systemctl is-active --quiet nginx graft-gate
curl --noproxy '*' -fsS --max-time 5 http://127.0.0.1:8091/__gate/health >/dev/null
