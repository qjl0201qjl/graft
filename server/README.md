# 上线部署与安全

> 一句话:Nginx 发静态文件 + 一个很小的 Python 口令网关。玩家输对口令拿到签名 cookie,之后每个请求由 Nginx 自己验签,不经过 Python。

```
玩家手机 ──HTTPS──▶ Nginx ──┬─ 有有效签名 cookie ─▶ 游戏文件(/srv/graft/current)
                            └─ 没有 ─▶ 302 → /__gate/login ─▶ gate.py(127.0.0.1:8091)
                                                              输对口令 → 签发 cookie
```

## 上线前先做的事

1. **改掉服务器密码**。之前的截图里密码是明文的,当作已经泄露处理。
2. **在你电脑上配好 SSH 密钥**:`ssh-copy-id user@服务器`,确认 `ssh user@服务器` 不用输密码就能进。
3. 云服务器**安全组放行 80**(有域名后再加 443)。
4. 截图里的 `100.84.194.18` 是 Tailscale 组网地址(100.64.0.0/10 网段),**外网玩家访问不到**。对外要用服务器的公网 IP 或域名。

## 三步上线

### 你的服务器:`8.137.175.63`(80 端口已经在跑消防项目)

游戏用**独立的 8080 端口**,和消防项目共存:不改 80 端口、不动已有的 nginx 站点、不改 SSH 和防火墙设置。

**最简单:双击项目里的 `部署到服务器.command`**,按提示输入用户名、(第一次)服务器密码、访问口令即可。
它会先只读检查服务器(系统、80 端口、8080/8091 是否空闲),确认后才安装。以后更新游戏也是双击它。

等价的命令行:

部署前会检查网关、邀请码和 Nginx 是否实际可用。安装中断后重新运行安装会保留已有邀请码并补齐缺失步骤,不会仅凭 `graft-code` 命令存在就跳过安装。共存模式会备份并停用未修改的系统 Nginx 默认欢迎页,避免重试安装时占用现有网站的 80 端口。

```bash
ssh-copy-id root@8.137.175.63                                   # 配好密钥登录(只需一次)
server/deploy.sh root@8.137.175.63 --install --port 8080        # 首次安装
server/deploy.sh root@8.137.175.63                              # 以后发布新版本
server/check.sh http://8.137.175.63:8080                        # 上线自检
```

装好后玩家打开 **http://8.137.175.63:8080/** 输口令即可。

- 阿里云控制台 → 安全组 → 入方向,放行 **TCP 8080**。
- 共存模式默认不做 SSH / 防火墙加固(怕影响消防项目)。确认没影响后,可以单独运行 `sudo bash ~/graft-server/harden.sh` 加固。
- 用的是 HTTP:口令和 cookie 在网络上是明文的,课堂小范围用可以接受。

### 以后有了域名(推荐)

域名解析到 `8.137.175.63` 后重新跑一次安装(口令、密钥都会保留):

```bash
server/deploy.sh root@8.137.175.63 --install --domain game.example.com --email 你的邮箱
server/check.sh https://game.example.com
```

服务器在中国大陆的话,域名要先完成 **ICP 备案**,否则用域名访问 80/443 会被云厂商拦截(直接用 IP 访问不受影响)。

出问题想回退:`server/deploy.sh root@8.137.175.63 --rollback`。

### 安装参数

| 参数 | 作用 |
|---|---|
| `--trusted "1.2.3.0/24"` | 白名单 IP,不限流、不封禁。**全班在同一个校园网出口时建议把出口 IP 加进来** |
| `--allow-ports 8888,6006` | 这台机器上还有别的对外服务(Jupyter、TensorBoard 等)时,列出要保留的端口 |
| `--force-ssh-keys` | 机器上有其他用户时,默认**不会**关闭密码登录(怕把同学锁在外面);确认大家都用密钥后再加这个 |
| `--port 8080` | 共存模式:只用这个端口,不碰 80 端口上已有的网站;默认不做系统加固 |
| `--no-harden` | 不动 SSH / 防火墙 / 内核参数(共用服务器、没有管理权限时用) |
| `--ssh-port 2222` | SSH 不是 22 端口时 |

## 口令(邀请码)管理

可以同时有多个口令,比如每个班一个,泄露了只删那一个:

```bash
sudo graft-code add 班级B          # 新增(交互输入,至少 8 位,建议几个随机词拼起来)
sudo graft-code list
sudo graft-code remove 班级B       # 删除:新登录立即失效
sudo graft-code logout-all         # 换签名密钥:所有人立刻下线,需要重新输口令
```

登录有效期 7 天。日志里能看到每次登录用的是哪个口令:`journalctl -u graft-gate -f`。

## 500 人并发

- 游戏加载完就完全在手机上运行,**不再请求服务器**。所以"500 人在线"对服务器的压力只在**打开那一下**。
- 每个玩家首次打开约 **40 KB**(gzip 后);之后再打开只请求一个 3 KB 的首页,其余走浏览器缓存。
- Nginx 已调到 4096 连接/进程、零拷贝发送、预压缩文件,500 人同时打开对 CPU 几乎没有压力。
- **真正的瓶颈是带宽**:500 人同一秒打开 ≈ 20 MB。
  | 服务器带宽 | 500 人同时打开全部加载完 |
  |---|---|
  | 5 Mbps | 约 32 秒 |
  | 20 Mbps | 约 8 秒 |
  | 100 Mbps | 约 2 秒 |
  不是同一秒涌入的话完全没压力。如果要在课堂上让全班同时扫码打开,建议带宽 ≥ 20 Mbps。
- 压测(从另一台电脑跑,先把这台电脑的 IP 加进白名单,否则会被按 IP 限流):
  ```bash
  python3 tools/loadtest.py https://game.example.com --users 500 --rounds 3
  ```

## 做了哪些防护

| 层 | 措施 |
|---|---|
| 访问控制 | 口令网关;口令 PBKDF2-SHA256 31 万轮加盐存储;cookie 带签名和过期时间,Nginx 原生验签;HttpOnly + Secure + SameSite |
| 防爆破 | 同一 IP 10 分钟错 30 次锁 15 分钟;fail2ban 封 IP 1 小时(再犯翻倍);全局失败过多时统一减速;登录接口单独限流 |
| 反爬 | 未登录拿不到任何游戏文件;常见爬虫 / 下载器 / 扫描器 UA 直接 403;`robots.txt` 全站禁止 + `X-Robots-Tag: noindex`;探测 `.env` `.git` `wp-login` 等路径 3 次封 1 天 |
| 限流 | 每 IP 60 请求/秒(突发 300)、256 并发连接;数值是按"校园网几百人共用一个出口 IP"定的 |
| 浏览器安全头 | 严格 CSP(只允许本站脚本,禁内联脚本)、禁止被嵌入 iframe、nosniff、HSTS、Referrer-Policy、Permissions-Policy |
| 隐藏信息 | 不暴露 Nginx 版本;生产包删掉调试后门(`?lv=` 跳关、N 键、`window.__game`);源码映射 / 备份 / 隐藏文件一律 404 |
| 抗慢速攻击 | 请求头/体 10 秒超时,请求体上限 4 KB |
| 网关沙箱 | 独立无登录权限账号运行;systemd 沙箱:只读文件系统、只能连本机网络、禁止提权、内存上限 256 MB |
| 服务器 | SSH 仅密钥登录、限制尝试次数;ufw 只开 SSH/80/443(+Tailscale);fail2ban 保护 SSH;自动安全更新;SYN cookies |
| 发布 | 原子切换版本、保留 5 个历史版本可回滚;每次发布前自动跑测试 |

### 需要知道的边界

- **口令挡的是"谁能进来"**。拿到口令进来的人,浏览器里一定有完整的前端代码——网页游戏都是这样,没有办法做到"能玩但拿不到代码"。生产包做了压缩(装了 Node 时还会混淆变量名),只是提高门槛。
- 这个项目原本就是 MIT 开源、挂在 GitHub Pages 上的。如果不想让别人看到代码,需要把 GitHub 仓库设为私有并关闭 Pages。
- 按 IP 的限流和 UA 拦截都能被有心人绕过(换 IP、伪造 UA),它们挡的是自动化的扫描和批量抓取;真正的门是口令。

## 文件说明

| 文件 | 去哪 | 作用 |
|---|---|---|
| `install.sh` | 服务器上运行 | 一键安装,可重复运行 |
| `harden.sh` | 被 install.sh 调用 | SSH / 防火墙 / 自动更新 / 内核参数 |
| `deploy.sh` | 你电脑上运行 | 安装、发布、回滚 |
| `check.sh` | 任何电脑 | 上线自检 |
| `gate.py` | `/opt/graft/` | 口令网关(仅 Python 标准库) |
| `graft-gate.service` | `/etc/systemd/system/` | 网关服务 + 沙箱 |
| `nginx/graft-http.conf` | `/etc/nginx/conf.d/` | 限流区、爬虫 UA 列表、日志格式 |
| `nginx/graft-*.conf` | `/etc/nginx/snippets/` | 站点规则、鉴权、安全头、CSP、反代 |
| `nginx/site-*.conf.tpl` | `/etc/nginx/sites-available/graft` | HTTPS / HTTP 站点模板 |
| `fail2ban/*` | `/etc/fail2ban/` | 封禁规则 |

服务器上的数据:`/etc/graft/`(口令哈希、签名密钥、白名单),`/srv/graft/releases/`(各版本),`/srv/graft/current`(当前版本)。

## 常用排查

```bash
sudo nginx -t && sudo systemctl reload nginx     # 改了配置
sudo systemctl status graft-gate                 # 网关状态
sudo fail2ban-client status graft-gate           # 被封的 IP
sudo fail2ban-client set graft-gate unbanip 1.2.3.4
sudo tail -f /var/log/nginx/graft.access.log     # 访问日志(sid= 是会话号)
```
