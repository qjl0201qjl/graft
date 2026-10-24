#!/usr/bin/env bash
# 拾色 GRAFT · 服务器加固(Ubuntu 20.04+/Debian 11+)
#   sudo bash harden.sh [--ssh-port 22] [--allow-ports 8888,6006] [--force-ssh-keys] [--skip-firewall]
# 做的事:
#   1. SSH:只允许密钥登录,禁止密码 / root 密码登录,限制尝试次数
#      —— 会先检查你已经有可用的公钥,没有就跳过这一步,绝不把你锁在门外
#   2. 防火墙 ufw:只开 SSH、80、443(+ Tailscale 网卡)
#   3. 自动安装安全更新
#   4. 内核网络参数:抗 SYN 洪水、提高连接队列
set -euo pipefail
SSH_PORT=22; ALLOW_PORTS=""; FORCE_KEYS=0; SKIP_FW=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ssh-port) SSH_PORT="$2"; shift 2;;
    --allow-ports) ALLOW_PORTS="$2"; shift 2;;
    --force-ssh-keys) FORCE_KEYS=1; shift;;
    --skip-firewall) SKIP_FW=1; shift;;
    *) echo "未知参数 $1"; exit 1;;
  esac
done
[[ $EUID -eq 0 ]] || { echo "请用 sudo 运行"; exit 1; }
say(){ printf '\033[1;35m▸ %s\033[0m\n' "$*"; }
warn(){ printf '\033[1;33m! %s\033[0m\n' "$*"; }

# ───────────────────────── 1. SSH
say "检查 SSH 公钥"
ADMIN="${SUDO_USER:-root}"
ADMIN_HOME=$(getent passwd "$ADMIN" | cut -d: -f6)
KEYS="$ADMIN_HOME/.ssh/authorized_keys"
# 这台机器上还有别的登录用户吗?(共用的实验室服务器上,关密码登录会把别人锁在外面)
OTHERS=$(awk -F: -v me="$ADMIN" '$3>=1000 && $3<65000 && $1!=me && $7 !~ /(nologin|false)$/ {print $1}' /etc/passwd | xargs)
if [[ -n "$OTHERS" && $FORCE_KEYS -eq 0 ]]; then
  warn "这台服务器上还有其他用户:$OTHERS"
  warn "全局关闭密码登录会影响他们,本次【跳过】SSH 修改。"
  warn "确认他们都用密钥登录后,加 --force-ssh-keys 重新运行。"
elif [[ -s "$KEYS" ]] && grep -qE '^(ssh-(ed25519|rsa)|ecdsa-sha2|sk-)' "$KEYS"; then
  say "发现 $ADMIN 的公钥 ($(grep -cE '^(ssh-|ecdsa|sk-)' "$KEYS") 个),关闭密码登录"
  install -d -m 755 /etc/ssh/sshd_config.d
  # 01- 开头:sshd 取"第一次出现"的值,必须排在云厂商的 50-cloud-init.conf 之前
  cat > /etc/ssh/sshd_config.d/01-graft-hardening.conf <<CONF
# 由 graft harden.sh 生成
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PermitRootLogin prohibit-password
PermitEmptyPasswords no
PubkeyAuthentication yes
MaxAuthTries 3
MaxSessions 10
LoginGraceTime 20
X11Forwarding no
AllowAgentForwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
CONF
  if grep -qE '^\s*Include\s+/etc/ssh/sshd_config.d' /etc/ssh/sshd_config; then
    sshd -t
    systemctl reload ssh 2>/dev/null || systemctl reload sshd
    if sshd -T 2>/dev/null | grep -qi '^passwordauthentication no'; then
      say "SSH 已改为仅密钥登录(当前会话不受影响)"
    else
      warn "sshd 生效值仍不是 passwordauthentication no,请检查 /etc/ssh/sshd_config 里的冲突设置"
    fi
  else
    warn "/etc/ssh/sshd_config 没有 Include sshd_config.d,未自动修改。请手动把上面的设置写进 sshd_config"
  fi
else
  warn "没有找到 $ADMIN 的 SSH 公钥 ($KEYS)。"
  warn "为了不把你锁在服务器外面,本次【没有】关闭密码登录。"
  warn "请在你自己电脑上执行:  ssh-copy-id $ADMIN@<服务器地址>   然后重新运行本脚本。"
fi

# ───────────────────────── 2. 防火墙
say "配置防火墙 ufw"
# 先看看机器上还有哪些服务在对外监听,避免把别的服务挡掉
EXTRA=$(ss -Htln 2>/dev/null | awk '{print $4}' | grep -vE '^(127\.|\[::1\]|::1|localhost|100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.|\[fd7a:115c)' | sed -E 's/.*:([0-9]+)$/\1/' \
        | sort -un | grep -vxE "${SSH_PORT}|80|443" | xargs || true)
for p in ${ALLOW_PORTS//,/ }; do EXTRA=$(echo "$EXTRA" | tr ' ' '\n' | grep -vx "$p" | xargs); done
if [[ $SKIP_FW -eq 1 ]]; then
  warn "按要求跳过防火墙"
elif [[ -n "$EXTRA" ]] && ! ufw status | grep -q 'Status: active'; then
  warn "这些端口还有服务在对外监听:$EXTRA"
  warn "直接开防火墙会把它们挡掉,本次【跳过】。确认要保留哪些后这样运行:"
  warn "   sudo bash harden.sh --allow-ports ${EXTRA// /,}      (全部保留)"
else
  # 不 reset:保留你原有的规则,只追加
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  ufw limit "${SSH_PORT}/tcp" comment 'ssh (rate-limited)' >/dev/null
  ufw allow 80/tcp  comment 'http'  >/dev/null
  ufw allow 443/tcp comment 'https' >/dev/null
  for p in ${ALLOW_PORTS//,/ }; do ufw allow "${p}/tcp" comment 'kept by --allow-ports' >/dev/null; done
  if ip link show tailscale0 >/dev/null 2>&1; then
    ufw allow in on tailscale0 comment 'tailscale' >/dev/null
    say "检测到 Tailscale,已放行 tailscale0 网卡(经 Tailscale 的访问不受影响)"
  fi
  ufw --force enable >/dev/null
  ufw status verbose | sed 's/^/   /'
fi

# ───────────────────────── 3. 自动安全更新
say "开启自动安全更新"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<CONF
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
CONF
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true

# ───────────────────────── 4. 内核参数
say "调整内核网络参数"
cat > /etc/sysctl.d/90-graft.conf <<CONF
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 8192
net.core.somaxconn = 8192
net.core.netdev_max_backlog = 8192
net.ipv4.ip_local_port_range = 10240 65000
net.ipv4.tcp_fin_timeout = 15
net.ipv4.conf.all.rp_filter = 2
net.ipv4.conf.default.rp_filter = 2
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
fs.file-max = 1048576
kernel.kptr_restrict = 2
kernel.dmesg_restrict = 1
CONF
sysctl --system >/dev/null
say "加固完成"
