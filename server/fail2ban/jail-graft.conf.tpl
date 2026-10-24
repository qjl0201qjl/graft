# 拾色 GRAFT · fail2ban  →  /etc/fail2ban/jail.d/graft.conf
# __IGNOREIP__ 由 install.sh 填入:本机 + Tailscale 网段 + 你的白名单,这些永远不会被封

[sshd]
enabled  = true
backend  = systemd
maxretry = 5
findtime = 10m
bantime  = 1h
bantime.increment = true
ignoreip = __IGNOREIP__

# 口令网关:10 分钟输错 30 次 → 封 1 小时(多次再犯时间翻倍)
[graft-gate]
enabled  = true
backend  = systemd
filter   = graft-gate
maxretry = 30
findtime = 10m
bantime  = 1h
bantime.increment = true
ignoreip = __IGNOREIP__

# 扫描器:10 分钟内探测 wp-login / .env / .git 等敏感路径 3 次 → 封 1 天
[graft-scan]
enabled  = true
backend  = auto
filter   = graft-scan
logpath  = /var/log/nginx/graft.access.log
maxretry = 3
findtime = 10m
bantime  = 1d
ignoreip = __IGNOREIP__

# 爬虫 UA / 非法方法被拒:10 分钟 20 次 → 封 1 小时
[graft-badua]
enabled  = true
backend  = auto
filter   = graft-badua
logpath  = /var/log/nginx/graft.access.log
maxretry = 20
findtime = 10m
bantime  = 1h
bantime.increment = true
ignoreip = __IGNOREIP__

# 持续触发限流(1 分钟内被限流 200 次)→ 封 10 分钟
[graft-limit]
enabled  = true
backend  = auto
filter   = nginx-limit-req
logpath  = /var/log/nginx/graft.error.log
maxretry = 200
findtime = 1m
bantime  = 10m
ignoreip = __IGNOREIP__
