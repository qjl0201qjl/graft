#!/usr/bin/env python3
"""
拾色 GRAFT · 压测(零依赖)。模拟 N 个玩家同时打开游戏:登录 → 首页 → CSS/JS → 清单/图标。

  python3 tools/loadtest.py https://game.example.com --users 500
  (会提示输入口令;也可以用环境变量 GRAFT_CODE)

注意:
  - 从一台电脑发起 500 个"玩家",在服务器看来都是同一个 IP,会撞上按 IP 的限流。
    压测前把这台电脑的公网 IP 加进服务器的白名单:
      sudo sh -c 'echo "你的IP 1;" >> /etc/graft/trusted-ips.conf' && sudo systemctl reload nginx
  - 游戏加载完后完全在手机上运行、不再请求服务器,所以"同时在线"对服务器的压力
    其实就是"同时打开"那一下。这个脚本测的就是最坏情况:所有人同一秒打开。
"""
import argparse, getpass, gzip, http.client, os, re, ssl, statistics, sys, threading, time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit, urlencode

UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'


class Client:
    def __init__(self, base, cookie=''):
        u = urlsplit(base)
        self.https = u.scheme == 'https'
        self.host, self.port = u.hostname, u.port or (443 if self.https else 80)
        self.cookie, self.conn = cookie, None

    def _conn(self):
        if self.conn is None:
            if self.https:
                self.conn = http.client.HTTPSConnection(self.host, self.port, timeout=30, context=ssl.create_default_context())
            else:
                self.conn = http.client.HTTPConnection(self.host, self.port, timeout=30)
        return self.conn

    def req(self, method, path, body=None, headers=None):
        h = {'User-Agent': UA, 'Accept-Encoding': 'gzip', 'Host': self.host if self.port in (80, 443) else '%s:%d' % (self.host, self.port)}
        if self.cookie: h['Cookie'] = self.cookie
        h.update(headers or {})
        for attempt in (0, 1):
            try:
                c = self._conn(); t = time.perf_counter()
                c.request(method, path, body=body, headers=h)
                r = c.getresponse(); data = r.read()
                if r.getheader('Connection', '').lower() == 'close': self.close()
                return r, data, time.perf_counter() - t
            except (http.client.HTTPException, OSError):
                self.close()
                if attempt: raise

    def close(self):
        if self.conn: self.conn.close(); self.conn = None


def login(base, code):
    c = Client(base)
    r, _, _ = c.req('POST', '/__gate/login', urlencode({'code': code}), {'Content-Type': 'application/x-www-form-urlencoded'})
    if r.status != 303: sys.exit('登录失败:HTTP %d(口令错了?被限流了?)' % r.status)
    jar = [v.split(';')[0] for v in r.msg.get_all('Set-Cookie')]
    return '; '.join(jar)


def player(base, cookie, stats, lock, barrier):
    c = Client(base, cookie)
    try: barrier.wait(timeout=60)                      # 所有人同一刻开始
    except threading.BrokenBarrierError: pass
    t0 = time.perf_counter(); n = 0; size = 0
    try:
        r, html, dt = c.req('GET', '/'); record(stats, lock, '/', r.status, dt); n += 1; size += len(html)
        if r.getheader('Content-Encoding') == 'gzip': html = gzip.decompress(html)
        paths = re.findall(rb'(?:src|href)="(static/[^"]+|manifest\.webmanifest)"', html)
        for p in paths:
            r, d, dt = c.req('GET', '/' + p.decode()); record(stats, lock, 'static', r.status, dt); n += 1; size += len(d)
        if len(paths) < 2: raise RuntimeError('首页里没找到 JS/CSS(状态码 %d)' % r.status)
        with lock: stats['page'].append(time.perf_counter() - t0); stats['bytes'] += size
    except Exception as e:
        with lock: stats['errors'].append(type(e).__name__ + ': ' + str(e)[:80])
    finally:
        c.close()


def record(stats, lock, kind, status, dt):
    with lock:
        stats['codes'][status] = stats['codes'].get(status, 0) + 1
        stats['lat'].append(dt)


def pct(xs, p):
    xs = sorted(xs); return xs[min(len(xs) - 1, int(len(xs) * p))] if xs else 0


def main():
    ap = argparse.ArgumentParser(description='模拟 N 个玩家同时打开游戏')
    ap.add_argument('base'); ap.add_argument('--users', type=int, default=500)
    ap.add_argument('--rounds', type=int, default=1, help='重复几轮')
    a = ap.parse_args(); base = a.base.rstrip('/')
    code = os.environ.get('GRAFT_CODE') or getpass.getpass('口令: ')
    cookie = login(base, code)
    print('已登录,开始:%d 个玩家同时打开游戏 × %d 轮' % (a.users, a.rounds))
    for rnd in range(a.rounds):
        stats = {'codes': {}, 'lat': [], 'page': [], 'errors': [], 'bytes': 0}
        lock = threading.Lock(); barrier = threading.Barrier(a.users)
        t = time.perf_counter()
        with ThreadPoolExecutor(a.users) as ex:
            for _ in range(a.users): ex.submit(player, base, cookie, stats, lock, barrier)
        wall = time.perf_counter() - t
        ok = len(stats['page']); reqs = sum(stats['codes'].values())
        print('\n第 %d 轮  用时 %.2fs  成功打开 %d/%d  请求 %d (%.0f/s)  传输 %.1f MB' %
              (rnd + 1, wall, ok, a.users, reqs, reqs / wall, stats['bytes'] / 1e6))
        print('  状态码:', ', '.join('%s×%d' % kv for kv in sorted(stats['codes'].items())))
        print('  单个请求  p50 %.0fms  p95 %.0fms  p99 %.0fms' % (pct(stats['lat'], .5) * 1e3, pct(stats['lat'], .95) * 1e3, pct(stats['lat'], .99) * 1e3))
        if stats['page']:
            print('  整页加载  p50 %.0fms  p95 %.0fms  最慢 %.0fms' % (pct(stats['page'], .5) * 1e3, pct(stats['page'], .95) * 1e3, max(stats['page']) * 1e3))
        if stats['errors']: print('  错误 %d 个,例如:%s' % (len(stats['errors']), stats['errors'][0]))
        if stats['codes'].get(429): print('  ⚠ 出现 429 = 撞到按 IP 限流。把压测机 IP 加进 /etc/graft/trusted-ips.conf 再测')
        if stats['codes'].get(302): print('  ⚠ 出现 302 = cookie 没被接受(密钥刚换过?)')


if __name__ == '__main__':
    main()
