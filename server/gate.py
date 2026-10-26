#!/usr/bin/env python3
"""
拾色 GRAFT · 访问口令网关(只用 Python 标准库)

工作方式
  1. 玩家第一次访问 → Nginx 发现没有有效 cookie → 302 到 /__gate/login
  2. 玩家输入口令 → 本程序校验 → 签发 3 个 cookie:
       gt_exp = 过期时间戳
       gt_id  = 随机会话号(便于在日志里追踪)
       gt_sig = base64url( md5("{gt_exp} {gt_id} {服务器密钥}") )
  3. 之后每个请求由 Nginx 自带的 secure_link 模块直接校验签名和过期时间,
     不再经过 Python —— 所以 500 人同时在线时热路径上只有 Nginx。

命令
  gate.py serve [--bind 127.0.0.1] [--port 8091] [--conf /etc/graft]
  gate.py add-code   --label 班级A      [--conf /etc/graft]   交互输入口令(可以有多个邀请码)
  gate.py list-codes                     [--conf /etc/graft]
  gate.py remove-code --label 班级A      [--conf /etc/graft]
  gate.py rotate-secret                  [--conf /etc/graft]   换密钥 = 所有人立即下线
  gate.py sign --secret HEX               (测试用:打印一组合法 cookie)

安全设计
  - 口令以 PBKDF2-SHA256(310000 轮, 随机盐)保存,文件里没有明文
  - 校验用 hmac.compare_digest,常数时间比较
  - 每个 IP:10 分钟内失败 30 次 → 锁 15 分钟;全局失败速率过高时额外减速
  - 失败写日志 "graft-gate: login-fail ip=…" 给 fail2ban 封禁
  - 只信任来自 127.0.0.1 的 X-Real-IP(本程序只监听本机,由 Nginx 转发)
  - 登录页不含任何脚本;返回严格的 CSP
"""
import argparse, base64, binascii, getpass, hashlib, hmac, html, json, os, secrets, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

PBKDF2_ITERS = 310000
TTL_DEFAULT = 7 * 24 * 3600
FAIL_WINDOW, FAIL_LIMIT, LOCK_SECONDS = 600, 30, 900
MAX_BODY = 2048
COOKIE_NAMES = ('gt_exp', 'gt_id', 'gt_sig')


def log(msg):
    sys.stderr.write('graft-gate: %s\n' % msg)
    sys.stderr.flush()


# ───────────────────────────────────────── 签名(必须与 nginx secure_link_md5 完全一致)
def sign(exp, sid, secret):
    raw = hashlib.md5(('%d %s %s' % (exp, sid, secret)).encode()).digest()
    return base64.urlsafe_b64encode(raw).decode().rstrip('=')


def verify_like_nginx(exp, sid, sig, secret, now=None):
    """测试用:按 nginx 的规则复核一组 cookie。返回 '1' 有效 / '0' 过期 / '' 签名错误"""
    try:
        exp_i = int(exp)
        got = base64.urlsafe_b64decode(sig + '=' * (-len(sig) % 4))
    except (ValueError, binascii.Error):
        return ''
    want = hashlib.md5(('%d %s %s' % (exp_i, sid, secret)).encode()).digest()
    if not hmac.compare_digest(got, want):
        return ''
    return '1' if exp_i > (now or time.time()) else '0'


# ───────────────────────────────────────── 口令存储
def hash_code(code, salt=None, iters=PBKDF2_ITERS):
    salt = salt or secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac('sha256', code.encode('utf-8'), salt, iters)
    return 'pbkdf2_sha256$%d$%s$%s' % (iters, salt.hex(), dk.hex())


def check_hash(code, stored):
    try:
        algo, iters, salt, want = stored.split('$')
        assert algo == 'pbkdf2_sha256'
        dk = hashlib.pbkdf2_hmac('sha256', code.encode('utf-8'), bytes.fromhex(salt), int(iters))
        return hmac.compare_digest(dk.hex(), want)
    except Exception:
        return False


class Store:
    """codes.json 改动后自动重载,不用重启服务"""
    def __init__(self, conf):
        self.conf = conf
        self.codes_path = os.path.join(conf, 'codes.json')
        self.secret_path = os.path.join(conf, 'secret')
        self._mtime = None
        self._codes = []
        self._secret = ''
        self._fast = {}          # hmac(运行期随机键, 口令) → label,首次 PBKDF2 通过后缓存,后续登录很快
        self._run_key = secrets.token_bytes(32)
        self._lock = threading.Lock()
        self._pbkdf2 = threading.Semaphore(4)   # 限制同时进行的慢哈希,防止 CPU 被打满

    def _reload(self):
        try:
            st = (os.stat(self.codes_path).st_mtime_ns, os.stat(self.secret_path).st_mtime_ns)
        except FileNotFoundError:
            st = None
        if st == self._mtime:
            return
        with self._lock:
            codes, secret = [], ''
            try:
                with open(self.codes_path, encoding='utf-8') as f:
                    codes = json.load(f).get('codes', [])
            except FileNotFoundError:
                pass
            try:
                with open(self.secret_path) as f:
                    secret = f.read().strip()
            except FileNotFoundError:
                pass
            self._codes, self._secret, self._mtime = codes, secret, st
            self._fast = {}
            log('loaded %d code(s)%s' % (len(codes), '' if secret else ', NO SECRET'))

    @property
    def secret(self):
        self._reload()
        return self._secret

    def check(self, code):
        """返回匹配的 label,或 None"""
        self._reload()
        if not code or len(code) > 128:
            return None
        key = hmac.new(self._run_key, code.encode('utf-8'), 'sha256').digest()
        hit = None
        for k, label in list(self._fast.items()):
            if hmac.compare_digest(k, key):
                hit = label
        if hit is not None:
            return hit
        with self._pbkdf2:
            for c in self._codes:
                if check_hash(code, c.get('hash', '')):
                    self._fast[key] = c.get('label', '?')
                    return c.get('label', '?')
        return None


# ───────────────────────────────────────── 防爆破
class Throttle:
    def __init__(self):
        self.fails = {}       # ip → [时间戳…]
        self.locked = {}      # ip → 解锁时间
        self.recent = []      # 全局失败时间戳
        self.lock = threading.Lock()

    def blocked(self, ip):
        with self.lock:
            until = self.locked.get(ip, 0)
            if until > time.time():
                return int(until - time.time())
            self.locked.pop(ip, None)
            return 0

    def fail(self, ip):
        now = time.time()
        with self.lock:
            lst = [t for t in self.fails.get(ip, []) if now - t < FAIL_WINDOW]
            lst.append(now)
            self.fails[ip] = lst
            if len(lst) >= FAIL_LIMIT:
                self.locked[ip] = now + LOCK_SECONDS
                self.fails.pop(ip, None)
                log('lockout ip=%s for %ds' % (ip, LOCK_SECONDS))
            self.recent = [t for t in self.recent if now - t < 60][-5000:]
            self.recent.append(now)
            if len(self.fails) > 50000:                     # 防内存被撑爆
                self.fails = dict(list(self.fails.items())[-20000:])
            global_rate = len(self.recent)
        # 全局每分钟失败超过 300 次:说明有人在大规模试,统一放慢
        time.sleep(0.4 + (1.5 if global_rate > 300 else 0))

    def ok(self, ip):
        with self.lock:
            self.fails.pop(ip, None)


# ───────────────────────────────────────── 页面
PAGE = '''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#0b0a10">
<title>拾色 · 输入口令</title><style>
*{box-sizing:border-box}html,body{height:100%%;margin:0}
body{display:flex;align-items:center;justify-content:center;padding:20px;background:radial-gradient(120%% 90%% at 50%% 30%%,#16141f 0%%,#08070c 70%%);
color:#e9e4f2;font-family:"PingFang SC","Microsoft YaHei",monospace}
form{width:min(340px,100%%);text-align:center}
.logo{font-size:44px;letter-spacing:.42em;text-indent:.42em;color:#fff;text-shadow:0 0 30px #8e6bff,0 4px 0 #2a1f45}
.sub{letter-spacing:.6em;text-indent:.6em;color:#7e7396;font-size:11px;margin:6px 0 30px}
input{width:100%%;padding:14px 16px;font-size:18px;letter-spacing:.12em;text-align:center;color:#fff;background:#14121c;border:1px solid #3a3352;border-radius:6px;outline:none}
input:focus{border-color:#7d66c2;box-shadow:0 0 0 3px rgba(125,102,194,.25)}
button{margin-top:14px;width:100%%;padding:13px;font-size:16px;letter-spacing:.4em;text-indent:.4em;color:#fff;background:#2a2142;border:1px solid #7d66c2;border-radius:6px;cursor:pointer}
button:active{transform:translateY(1px)}
.msg{min-height:1.6em;margin-top:14px;font-size:13px;color:%(color)s}
.foot{margin-top:28px;font-size:11px;color:#5d5672;letter-spacing:.1em}
</style></head><body><form method="post" action="/__gate/login" autocomplete="off">
<div class="logo">拾色</div><div class="sub">G R A F T</div>
<input name="code" type="password" inputmode="text" placeholder="输入口令" required maxlength="128" autofocus aria-label="口令">
<button type="submit">进　入</button><div class="msg">%(msg)s</div>
<div class="foot">口令找发给你链接的人要</div></form></body></html>'''

CSP = ("default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'; "
       "frame-ancestors 'none'; base-uri 'none'")


class Handler(BaseHTTPRequestHandler):
    server_version = 'gate'
    sys_version = ''
    protocol_version = 'HTTP/1.1'
    timeout = 10

    def log_message(self, fmt, *args):      # 正常请求不刷日志,失败另记
        pass

    def client_ip(self):
        peer = self.client_address[0]
        if peer in ('127.0.0.1', '::1'):
            return (self.headers.get('X-Real-IP') or peer).strip()[:64]
        return peer

    def is_https(self):
        return self.headers.get('X-Forwarded-Proto', '') == 'https'

    def send(self, code, body=b'', ctype='text/html; charset=utf-8', headers=()):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Security-Policy', CSP)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        # no-referrer 会让浏览器表单 POST 带 Origin: null,误触发同源校验。
        # same-origin 保留站内来源,同时不向站外泄露 Referer。
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('X-Robots-Tag', 'noindex, nofollow')
        for k, v in headers:
            self.send_header(k, v)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def page(self, code, msg='', err=False):
        body = PAGE % {'msg': html.escape(msg), 'color': '#ff8a9a' if err else '#8a80a5'}
        self.send(code, body.encode('utf-8'))

    def cookie(self, name, value, max_age):
        attrs = ['%s=%s' % (name, value), 'Path=/', 'Max-Age=%d' % max_age, 'HttpOnly', 'SameSite=Lax']
        if self.is_https():
            attrs.append('Secure')
        return ('Set-Cookie', '; '.join(attrs))

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = urlsplit(self.path)
        if path.path == '/__gate/health':
            ok = bool(STORE.secret) and bool(STORE._codes)
            return self.send(200 if ok else 503, b'ok\n' if ok else b'not configured\n', 'text/plain')
        if path.path == '/__gate/logout':
            hdrs = [self.cookie(n, '', 0) for n in COOKIE_NAMES] + [('Location', '/__gate/login')]
            return self.send(303, b'', headers=hdrs)
        if path.path == '/__gate/login':
            q = parse_qs(path.query)
            return self.page(200, '登录已过期,请重新输入' if 'expired' in q else '')
        self.send(404, b'not found\n', 'text/plain')

    def do_POST(self):
        if urlsplit(self.path).path != '/__gate/login':
            return self.send(404, b'not found\n', 'text/plain')
        ip = self.client_ip()
        # 同源检查:浏览器会带 Origin,和 Host 不一致就拒绝(防跨站代登录)
        origin, host = self.headers.get('Origin'), self.headers.get('Host', '')
        if origin and urlsplit(origin).netloc != host:
            return self.send(403, b'bad origin\n', 'text/plain')
        wait = THROTTLE.blocked(ip)
        if wait:
            return self.page(429, '尝试太多次了,%d 分钟后再试' % max(1, wait // 60), err=True)
        try:
            n = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            n = -1
        if n < 0 or n > MAX_BODY:
            self.close_connection = True
            return self.send(413, b'too large\n', 'text/plain', headers=[('Connection', 'close')])
        form = parse_qs(self.rfile.read(n).decode('utf-8', 'replace'))
        code = (form.get('code') or [''])[0].strip()
        label = STORE.check(code)
        secret = STORE.secret
        if label is None or not secret:
            THROTTLE.fail(ip)
            log('login-fail ip=%s' % ip)
            return self.page(401, '口令不对' if secret else '服务器还没配置好', err=True)
        THROTTLE.ok(ip)
        exp = int(time.time()) + TTL
        sid = secrets.token_urlsafe(12)
        sig = sign(exp, sid, secret)
        log('login-ok ip=%s code=%s sid=%s' % (ip, label, sid))
        hdrs = [self.cookie('gt_exp', str(exp), TTL), self.cookie('gt_id', sid, TTL),
                self.cookie('gt_sig', sig, TTL), ('Location', '/')]
        self.send(303, b'', headers=hdrs)


class GateServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 512        # listen() 积压队列:登录高峰不丢连接(必须在类上设,构造时就生效)
    allow_reuse_address = True


# ───────────────────────────────────────── 管理命令
def write_private(path, data, mode=0o640):
    tmp = path + '.tmp'
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(data)
    try:
        st = os.stat(path)                                   # 已存在:保留原属主属组
        os.chown(tmp, st.st_uid, st.st_gid)
    except FileNotFoundError:
        try:                                                 # 新文件:属组跟随目录(/etc/graft 属于 graftgate 组)
            os.chown(tmp, -1, os.stat(os.path.dirname(path) or '.').st_gid)
        except PermissionError:
            pass
    except PermissionError:
        pass
    os.replace(tmp, path)


def load_codes(conf):
    try:
        with open(os.path.join(conf, 'codes.json'), encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return {'codes': []}


def cmd_add(a):
    code = os.environ.get('GRAFT_CODE')
    if not code:
        code = getpass.getpass('新口令(至少 8 位,建议用几个随机词拼起来): ')
        if code != getpass.getpass('再输一次: '):
            sys.exit('两次不一致')
    code = code.strip()
    if len(code) < 8:
        sys.exit('口令太短:至少 8 位')
    data = load_codes(a.conf)
    data['codes'] = [c for c in data['codes'] if c.get('label') != a.label]
    data['codes'].append({'label': a.label, 'hash': hash_code(code), 'created': int(time.time())})
    write_private(os.path.join(a.conf, 'codes.json'), json.dumps(data, ensure_ascii=False, indent=1))
    print('已保存口令 [%s],共 %d 个。网关会自动生效。' % (a.label, len(data['codes'])))


def cmd_list(a):
    for c in load_codes(a.conf)['codes']:
        print('%-20s 创建于 %s' % (c.get('label'), time.strftime('%Y-%m-%d %H:%M', time.localtime(c.get('created', 0)))))


def cmd_remove(a):
    data = load_codes(a.conf)
    before = len(data['codes'])
    data['codes'] = [c for c in data['codes'] if c.get('label') != a.label]
    write_private(os.path.join(a.conf, 'codes.json'), json.dumps(data, ensure_ascii=False, indent=1))
    print('删除 %d 个。注意:已登录的人在 cookie 过期前仍能玩;要立刻踢下线请再执行 rotate-secret' % (before - len(data['codes'])))


def cmd_rotate(a):
    s = secrets.token_hex(32)
    write_private(os.path.join(a.conf, 'secret'), s + '\n')
    if a.nginx_snippet:
        write_private(a.nginx_snippet, '# 由 gate.py rotate-secret 生成,勿手改,勿外传\nset $graft_secret "%s";\n' % s, 0o600)
    print('密钥已更换。执行 systemctl reload nginx 后,所有已登录的人需要重新输入口令。')


def cmd_sign(a):
    exp = int(time.time()) + 3600
    sid = 'test' + secrets.token_hex(4)
    print('gt_exp=%d; gt_id=%s; gt_sig=%s' % (exp, sid, sign(exp, sid, a.secret)))


def main():
    p = argparse.ArgumentParser(description='拾色 GRAFT 访问口令网关')
    p.add_argument('--conf', default='/etc/graft')
    sub = p.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('serve'); s.add_argument('--bind', default='127.0.0.1'); s.add_argument('--port', type=int, default=8091)
    s.add_argument('--ttl', type=int, default=TTL_DEFAULT)
    s = sub.add_parser('add-code'); s.add_argument('--label', required=True)
    sub.add_parser('list-codes')
    s = sub.add_parser('remove-code'); s.add_argument('--label', required=True)
    s = sub.add_parser('rotate-secret'); s.add_argument('--nginx-snippet', default='/etc/nginx/snippets/graft-secret.conf')
    s = sub.add_parser('sign'); s.add_argument('--secret', required=True)
    a = p.parse_args()
    if a.cmd == 'serve':
        global STORE, THROTTLE, TTL
        if a.bind not in ('127.0.0.1', '::1', 'localhost'):
            log('WARNING: 网关应只监听本机,由 Nginx 转发')
        STORE, THROTTLE, TTL = Store(a.conf), Throttle(), a.ttl
        STORE._reload()
        srv = GateServer((a.bind, a.port), Handler)
        log('listening on %s:%d' % (a.bind, a.port))
        srv.serve_forever()
    else:
        {'add-code': cmd_add, 'list-codes': cmd_list, 'remove-code': cmd_remove,
         'rotate-secret': cmd_rotate, 'sign': cmd_sign}[a.cmd](a)


STORE = THROTTLE = None
TTL = TTL_DEFAULT
if __name__ == '__main__':
    main()
