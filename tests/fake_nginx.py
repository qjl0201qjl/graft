#!/usr/bin/env python3
"""
本地模拟 server/nginx 的路由与鉴权规则(仅用于开发自测,线上用真正的 nginx)。
  python3 server/gate.py --conf /tmp/g serve --port 8091 &
  python3 tests/fake_nginx.py --root dist --conf /tmp/g --port 8080
然后就可以在本机用 server/check.sh http://127.0.0.1:8080 和 tools/loadtest.py 跑全流程。
爬虫 UA 列表直接从 server/nginx/graft-http.conf 读取,和线上保持一致。
"""
import argparse, http.client, importlib.util, os, re, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
SRV = os.path.join(HERE, '..', 'server')
spec = importlib.util.spec_from_file_location('gate', os.path.join(SRV, 'gate.py')); gate = importlib.util.module_from_spec(spec); spec.loader.exec_module(gate)
conf_http = open(os.path.join(SRV, 'nginx', 'graft-http.conf'), encoding='utf-8').read()
BAD_UA = re.compile(re.search(r'"~\*(\(.*?\))"', conf_http).group(1), re.I)
CSP = re.search(r'Content-Security-Policy "(.*?)"', open(os.path.join(SRV, 'nginx', 'graft-csp.conf')).read()).group(1)
SEC = re.findall(r'add_header ([\w-]+)\s+"(.*?)" always', open(os.path.join(SRV, 'nginx', 'graft-headers.conf')).read())
BLOCK = re.compile(r'\.(map|bak|orig|old|swp|sh|py|md|log|conf|tpl|env|ini|sql|gz|zip|tar)$', re.I)
TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
         '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json'}


class H(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'nginx'; sys_version = ''
    def log_message(self, *a): pass

    def out(self, code, body=b'', headers=(), ctype='text/plain'):
        self.send_response(code)
        self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body)))
        for k, v in headers: self.send_header(k, v)
        self.end_headers()
        if self.command != 'HEAD': self.wfile.write(body)

    def handle_one_request(self):
        try: super().handle_one_request()
        except ConnectionError: self.close_connection = True

    def do_DELETE(self): self.out(405)
    do_PUT = do_PATCH = do_OPTIONS = do_DELETE
    def do_HEAD(self): self.route()
    def do_GET(self): self.route()
    def do_POST(self): self.route()

    def route(self):
        path = self.path.split('?')[0]
        ua = self.headers.get('User-Agent', '')
        if not ua or BAD_UA.search(ua): return self.out(403)
        if path == '/robots.txt': return self.out(200, b'User-agent: *\nDisallow: /\n', SEC)
        if path == '/favicon.ico': return self.out(204)
        if path.startswith('/__gate/'): return self.proxy()
        if self.command == 'POST': return self.out(405)
        if path == '/manifest.webmanifest' or re.match(r'^/static/icon-[a-z0-9-]+\.png$', path):
            return self.file(path, SEC)
        if path == '/static/build.json' or re.search(r'/\.', path) or BLOCK.search(path): return self.out(404)
        c = {}
        for part in (self.headers.get('Cookie') or '').split(';'):
            if '=' in part: k, v = part.strip().split('=', 1); c[k] = v
        secret = open(os.path.join(A.conf, 'secret')).read().strip()
        if not c.get('gt_sig') or not c.get('gt_exp'): return self.out(302, headers=[('Location', '/__gate/login')])
        r = gate.verify_like_nginx(c['gt_exp'], c.get('gt_id', ''), c['gt_sig'], secret)
        if r == '': return self.out(302, headers=[('Location', '/__gate/login')])
        if r == '0': return self.out(302, headers=[('Location', '/__gate/login?expired=1')])
        cache = 'private, max-age=31536000, immutable' if path.startswith('/static/') else 'no-cache'
        self.file(path, SEC + [('Content-Security-Policy', CSP), ('Cache-Control', cache)])

    def file(self, path, headers):
        if path.endswith('/'): path += 'index.html'
        fp = os.path.normpath(os.path.join(A.root, path.lstrip('/')))
        if not fp.startswith(os.path.abspath(A.root)) or not os.path.isfile(fp): return self.out(404)
        ext = os.path.splitext(fp)[1]; hdr = list(headers)
        if 'gzip' in (self.headers.get('Accept-Encoding') or '') and os.path.isfile(fp + '.gz'):
            fp += '.gz'; hdr.append(('Content-Encoding', 'gzip')); hdr.append(('Vary', 'Accept-Encoding'))
        with open(fp, 'rb') as f: body = f.read()
        self.out(200, body, hdr, TYPES.get(ext, 'application/octet-stream'))

    def proxy(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n > 4096: return self.out(413)
        body = self.rfile.read(n) if n else None
        h = {k: v for k, v in self.headers.items() if k.lower() not in ('connection', 'keep-alive')}
        h['X-Real-IP'] = self.client_address[0]; h['X-Forwarded-Proto'] = 'http'
        c = http.client.HTTPConnection('127.0.0.1', A.gate, timeout=20)
        c.request(self.command, self.path, body=body, headers=h)
        r = c.getresponse(); data = r.read(); c.close()
        self.send_response(r.status)
        for k, v in r.getheaders():
            if k.lower() not in ('connection', 'transfer-encoding', 'server', 'date'): self.send_header(k, v)
        self.end_headers()
        if self.command != 'HEAD': self.wfile.write(data)


class S(ThreadingHTTPServer):
    daemon_threads = True; request_queue_size = 1024


ap = argparse.ArgumentParser(); ap.add_argument('--root', default='dist'); ap.add_argument('--conf', required=True)
ap.add_argument('--port', type=int, default=8080); ap.add_argument('--gate', type=int, default=8091)
A = ap.parse_args(); A.root = os.path.abspath(A.root)
print('fake nginx on http://127.0.0.1:%d  →  gate :%d' % (A.port, A.gate), flush=True)
S(('127.0.0.1', A.port), H).serve_forever()
