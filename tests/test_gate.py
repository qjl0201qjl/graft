#!/usr/bin/env python3
"""网关自测:python3 -I tests/test_gate.py   (零依赖,临时目录里跑)"""
import http.client, importlib.util, os, subprocess, sys, tempfile, threading, time, unittest
from concurrent.futures import ThreadPoolExecutor
from http.cookies import SimpleCookie
from urllib.parse import urlencode

HERE = os.path.dirname(os.path.abspath(__file__))
GATE = os.path.join(HERE, '..', 'server', 'gate.py')
spec = importlib.util.spec_from_file_location('gate', GATE); gate = importlib.util.module_from_spec(spec); spec.loader.exec_module(gate)
PORT = 18091
CODE = 'purple-otter-42'


class GateTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conf = tempfile.mkdtemp()
        env = dict(os.environ, GRAFT_CODE=CODE)
        subprocess.run([sys.executable, '-I', GATE, '--conf', cls.conf, 'add-code', '--label', 'classA'], env=env, check=True, capture_output=True)
        subprocess.run([sys.executable, '-I', GATE, '--conf', cls.conf, 'rotate-secret', '--nginx-snippet', os.path.join(cls.conf, 'snippet.conf')], check=True, capture_output=True)
        cls.secret = open(os.path.join(cls.conf, 'secret')).read().strip()
        gate.FAIL_LIMIT = 5                    # 测试里把锁定阈值调小
        gate.STORE, gate.THROTTLE, gate.TTL = gate.Store(cls.conf), gate.Throttle(), 3600
        cls.srv = gate.GateServer(('127.0.0.1', PORT), gate.Handler)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def req(self, method, path, body=None, ip='203.0.113.7', headers=None):
        c = http.client.HTTPConnection('127.0.0.1', PORT, timeout=20)
        h = {'Host': 'game.example.com', 'X-Real-IP': ip, 'X-Forwarded-Proto': 'https'}
        if body is not None:
            body = urlencode(body); h['Content-Type'] = 'application/x-www-form-urlencoded'
        h.update(headers or {})
        c.request(method, path, body=body, headers=h)
        r = c.getresponse(); data = r.read(); c.close()
        return r, data

    def test_01_files_have_no_plaintext(self):
        with open(os.path.join(self.conf, 'codes.json')) as f: raw = f.read()
        self.assertNotIn(CODE, raw); self.assertIn('pbkdf2_sha256$310000$', raw)
        self.assertEqual(oct(os.stat(os.path.join(self.conf, 'snippet.conf')).st_mode & 0o777), '0o600')

    def test_02_login_page(self):
        r, d = self.req('GET', '/__gate/login')
        self.assertEqual(r.status, 200)
        self.assertIn("default-src 'none'", r.getheader('Content-Security-Policy'))
        self.assertEqual(r.getheader('Referrer-Policy'), 'same-origin')
        self.assertNotIn(b'<script', d)

    def test_03_wrong_code(self):
        r, d = self.req('POST', '/__gate/login', {'code': 'nope-nope'}, ip='198.51.100.1')
        self.assertEqual(r.status, 401); self.assertIsNone(r.getheader('Set-Cookie'))

    def test_04_right_code_cookie_matches_nginx(self):
        r, _ = self.req('POST', '/__gate/login', {'code': CODE})
        self.assertEqual(r.status, 303); self.assertEqual(r.getheader('Location'), '/')
        cookies = SimpleCookie()
        for v in r.msg.get_all('Set-Cookie'):
            cookies.load(v)
            self.assertIn('HttpOnly', v); self.assertIn('Secure', v); self.assertIn('SameSite=Lax', v)
        exp, sid, sig = (cookies[k].value for k in ('gt_exp', 'gt_id', 'gt_sig'))
        self.assertEqual(gate.verify_like_nginx(exp, sid, sig, self.secret), '1')
        self.assertEqual(gate.verify_like_nginx(exp, sid, sig, 'wrong'), '')
        self.assertEqual(gate.verify_like_nginx(str(int(exp) + 1), sid, sig, self.secret), '')      # 篡改过期时间
        self.assertEqual(gate.verify_like_nginx(exp, sid + 'x', sig, self.secret), '')              # 篡改会话号
        self.assertEqual(gate.verify_like_nginx(exp, sid, sig, self.secret, now=int(exp) + 1), '0')  # 过期

    def test_05_lockout(self):
        ip = '192.0.2.99'
        for _ in range(5):
            self.req('POST', '/__gate/login', {'code': 'guess'}, ip=ip)
        r, d = self.req('POST', '/__gate/login', {'code': CODE}, ip=ip)   # 锁定后正确口令也拒绝
        self.assertEqual(r.status, 429)
        r, _ = self.req('POST', '/__gate/login', {'code': CODE}, ip='192.0.2.100')  # 别的 IP 不受影响
        self.assertEqual(r.status, 303)

    def test_06_cross_site_and_size(self):
        r, _ = self.req('POST', '/__gate/login', {'code': CODE}, headers={'Origin': 'https://evil.example'})
        self.assertEqual(r.status, 403)
        c = http.client.HTTPConnection('127.0.0.1', PORT, timeout=5)
        c.putrequest('POST', '/__gate/login'); c.putheader('Content-Length', '5000'); c.putheader('X-Real-IP', '203.0.113.9'); c.endheaders()
        self.assertEqual(c.getresponse().status, 413); c.close()
        r, _ = self.req('GET', '/etc/passwd')
        self.assertEqual(r.status, 404)

    def test_07_logout_and_health(self):
        r, _ = self.req('GET', '/__gate/logout')
        self.assertEqual(r.status, 303); self.assertTrue(all('Max-Age=0' in v for v in r.msg.get_all('Set-Cookie')))
        r, _ = self.req('GET', '/__gate/health'); self.assertEqual(r.status, 200)

    def test_10_browser_form_origin(self):
        headers = {'Host': '8.137.175.63:8080', 'X-Forwarded-Proto': 'http',
                   'Origin': 'http://8.137.175.63:8080'}
        r, _ = self.req('POST', '/__gate/login', {'code': CODE}, headers=headers)
        self.assertEqual(r.status, 303)
        for origin in ('null', 'http://evil.example', 'http://8.137.175.63:8081'):
            r, _ = self.req('POST', '/__gate/login', {'code': CODE},
                            headers=dict(headers, Origin=origin))
            self.assertEqual(r.status, 403)

    def test_08_hot_reload_new_code(self):
        env = dict(os.environ, GRAFT_CODE='second-code-77')
        subprocess.run([sys.executable, '-I', GATE, '--conf', self.conf, 'add-code', '--label', 'classB'], env=env, check=True, capture_output=True)
        time.sleep(0.05)
        r, _ = self.req('POST', '/__gate/login', {'code': 'second-code-77'}, ip='203.0.113.50')
        self.assertEqual(r.status, 303)

    def test_09_burst_500_logins(self):
        self.req('POST', '/__gate/login', {'code': CODE}, ip='10.9.9.9')       # 预热:首次走 PBKDF2
        t = time.time()
        with ThreadPoolExecutor(64) as ex:
            res = list(ex.map(lambda i: self.req('POST', '/__gate/login', {'code': CODE}, ip='10.%d.%d.1' % (i // 250, i % 250))[0].status, range(500)))
        dt = time.time() - t
        print('\n      500 次并发登录:%.2f 秒,成功 %d' % (dt, res.count(303)))
        self.assertEqual(res.count(303), 500); self.assertLess(dt, 15)


if __name__ == '__main__':
    unittest.main(verbosity=2)
