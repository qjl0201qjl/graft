#!/usr/bin/env python3
"""
没有 nginx 时的配置静态检查(服务器上 install.sh 还会再跑真正的 nginx -t)。
展开 include,检查:括号/引号/分号、指令是否放在允许的上下文、引用的变量是否有定义、
模板占位符是否都已替换。用法: python3 tests/lint_nginx.py
"""
import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
NG = os.path.join(HERE, '..', 'server', 'nginx')

H, S, L, I = 'http', 'server', 'location', 'if'
SLI = {S, L, I}
CTX = {  # 指令 → 允许的上下文(按 nginx 1.18 文档)
 'log_format': {H}, 'limit_req_zone': {H}, 'limit_conn_zone': {H}, 'map': {H}, 'geo': {H},
 'server': {H}, 'listen': {S}, 'server_name': {S}, 'location': {S, L},
 'root': {H, S, L, I}, 'index': {H, S, L}, 'charset': {H, S, L, I}, 'server_tokens': {H, S, L},
 'access_log': {H, S, L, I}, 'error_log': {H, S, L},
 'client_max_body_size': {H, S, L}, 'client_body_timeout': {H, S, L}, 'client_header_timeout': {H, S},
 'send_timeout': {H, S, L}, 'keepalive_timeout': {H, S, L}, 'keepalive_requests': {H, S, L},
 'large_client_header_buffers': {H, S},
 'sendfile': {H, S, L, I}, 'tcp_nopush': {H, S, L}, 'tcp_nodelay': {H, S, L},
 'gzip': {H, S, L, I}, 'gzip_vary': {H, S, L}, 'gzip_comp_level': {H, S, L}, 'gzip_min_length': {H, S, L},
 'gzip_types': {H, S, L}, 'gzip_static': {H, S, L},
 'open_file_cache': {H, S, L}, 'open_file_cache_valid': {H, S, L}, 'open_file_cache_errors': {H, S, L},
 'limit_conn': {H, S, L}, 'limit_req': {H, S, L}, 'limit_req_status': {H, S, L}, 'limit_conn_status': {H, S, L},
 'limit_req_log_level': {H, S, L},
 'add_header': {H, S, L, I}, 'try_files': {S, L}, 'default_type': {H, S, L}, 'log_not_found': {H, S, L},
 'return': {S, L, I}, 'if': {S, L}, 'set': {S, L, I},
 'secure_link': {H, S, L}, 'secure_link_md5': {H, S, L},
 'proxy_pass': {L, I}, 'proxy_http_version': {H, S, L}, 'proxy_set_header': {H, S, L},
 'proxy_connect_timeout': {H, S, L}, 'proxy_send_timeout': {H, S, L}, 'proxy_read_timeout': {H, S, L},
 'ssl_certificate': {H, S}, 'ssl_certificate_key': {H, S}, 'ssl_protocols': {H, S}, 'ssl_ciphers': {H, S},
 'ssl_prefer_server_ciphers': {H, S}, 'ssl_session_cache': {H, S}, 'ssl_session_timeout': {H, S},
 'ssl_session_tickets': {H, S}, 'include': {H, S, L, I, 'map', 'geo'}, 'default': {'map', 'geo'},
}
BUILTIN = {'cookie_', 'http_', 'arg_'}
BUILTIN_VARS = {'secure_link', 'secure_link_expires', 'request_uri', 'host', 'remote_addr', 'binary_remote_addr', 'scheme',
                'request_method', 'uri', 'time_local', 'request', 'status', 'body_bytes_sent', 'request_time'}

def tokenize(text, fname):
    toks, i, n, line = [], 0, len(text), 1
    while i < n:
        c = text[i]
        if c == '\n': line += 1; i += 1; continue
        if c.isspace(): i += 1; continue
        if c == '#':
            while i < n and text[i] != '\n': i += 1
            continue
        if c in '{};': toks.append((c, line, fname, False)); i += 1; continue
        if c in '"\'':
            j = i + 1
            while j < n and text[j] != c:
                if text[j] == '\\': j += 1
                if text[j] == '\n': line += 1
                j += 1
            if j >= n: raise SystemExit('%s:%d 引号没闭合' % (fname, line))
            toks.append((text[i+1:j], line, fname, True)); i = j + 1; continue
        j = i
        while j < n and not text[j].isspace() and text[j] not in '{};':
            if text[j] in '"\'' : break
            j += 1
        toks.append((text[i:j], line, fname, False)); i = j
    return toks

def expand(path, domain='game.example.com'):
    real = path
    m = re.match(r'/etc/(?:nginx/snippets|nginx/conf\.d)/(.+)$', path)
    if m:
        if m.group(1) == 'graft-secret.conf':
            return tokenize('set $graft_secret "0123abcd";', 'graft-secret.conf')
        real = os.path.join(NG, m.group(1))
    elif path == '/etc/graft/trusted-ips.conf':
        return tokenize('203.0.113.0/24 1;', 'trusted-ips.conf')
    text = open(real, encoding='utf-8').read().replace('__DOMAIN__', domain)
    if '__' in re.sub(r'#.*', '', text) and re.search(r'__[A-Z]+__', text):
        raise SystemExit('%s 里有未替换的占位符' % real)
    out, toks, k = [], tokenize(text, os.path.basename(real)), 0
    while k < len(toks):
        t = toks[k]
        if t[0] == 'include' and not t[3]:
            target = toks[k+1][0]
            if toks[k+2][0] != ';': raise SystemExit('%s:%d include 缺分号' % (t[2], t[1]))
            out += expand(target); k += 3; continue
        out.append(t); k += 1
    return out

def check(toks, top_ctx, report):
    defined, used, errs = set(), [], []
    stack, stmt, lines = [top_ctx], [], []
    for tok, line, f, quoted in toks:
        if not quoted and tok in ('{', ';', '}'):
            if tok == '}':
                if stmt: errs.append('%s:%d 指令缺分号: %s' % (f, line, ' '.join(stmt)))
                stmt, lines = [], []
                if len(stack) == 1: errs.append('%s:%d 多余的 }' % (f, line)); continue
                stack.pop(); continue
            if not stmt: errs.append('%s:%d 空语句' % (f, line)); continue
            name, ctx = stmt[0], stack[-1]
            # 一条语句跨行、且后面某行以已知指令开头 → 几乎一定是上一行漏了分号
            for k in range(1, len(stmt)):
                if lines[k][0] != lines[k-1][0] and stmt[k] in CTX and not lines[k][1]:
                    errs.append('%s:%d 上一行可能漏了分号(%s … %s)' % (f, lines[k-1][0], name, stmt[k]))
                    break
            if ctx in ('map', 'geo'):
                if name not in ('default', 'include') and len(stmt) != 2:
                    errs.append('%s:%d %s 块里每行应是 "键 值;"' % (f, line, ctx))
            else:
                allowed = CTX.get(name)
                if allowed is None: errs.append('%s:%d 未知指令 %s' % (f, line, name))
                elif ctx not in allowed: errs.append('%s:%d %s 不能放在 %s 里' % (f, line, name, ctx))
            if name == 'set': defined.add(stmt[1].lstrip('$'))
            if name in ('map', 'geo'): defined.add(stmt[-1].lstrip('$'))
            if tok == '{':
                stack.append({'server': S, 'location': L, 'if': I, 'map': 'map', 'geo': 'geo'}.get(name, name))
                if name == 'if' and not (stmt[1].startswith('(') and stmt[-1].endswith(')')):
                    errs.append('%s:%d if 条件要用括号' % (f, line))
            stmt, lines = [], []
            continue
        stmt.append(tok); lines.append((line, quoted))
        for v in re.findall(r'\$([a-z_][a-z0-9_]*)', tok):
            used.append((v, f, line))
    if len(stack) != 1: errs.append('括号没闭合(还剩 %d 层)' % (len(stack) - 1))
    return defined, used, errs

def main():
    all_err = []
    httpdef, httpused, e = check(expand('/etc/nginx/conf.d/graft-http.conf'), H, None); all_err += e
    for tpl in ('site-https.conf.tpl', 'site-http.conf.tpl', 'site-acme.conf.tpl'):
        d, u, e = check(expand(os.path.join(NG, tpl)), H, None)
        all_err += ['[%s] %s' % (tpl, x) for x in e]
        known = httpdef | d | BUILTIN_VARS
        for v, f, line in u + httpused:
            if v not in known and not any(v.startswith(p) for p in BUILTIN):
                all_err.append('[%s] %s:%d 变量 $%s 没有定义' % (tpl, f, line, v))
        print('  %-20s %4d 个词元' % (tpl, len(expand(os.path.join(NG, tpl)))))
    # 关键安全设置必须存在
    app = open(os.path.join(NG, 'graft-app.conf'), encoding='utf-8').read()
    for must in ('include /etc/nginx/snippets/graft-auth.conf', 'client_max_body_size', 'limit_req ', 'server_tokens off', 'graft_bad_ua'):
        if must not in app: all_err.append('graft-app.conf 缺少 %s' % must)
    if app.count('graft-auth.conf') < 2: all_err.append('游戏页面和 /static/ 都必须经过鉴权')
    # 每个会产生内容的 location 都要带安全头(add_header 不继承)
    for m in re.finditer(r'location ([^{]+)\{(.*?)\n\}', app, re.S):
        body = m.group(2)
        if 'return 404' in body or 'return 204' in body or 'graft-proxy.conf' in body: continue
        if 'graft-headers.conf' not in body: all_err.append('location %s 没有 include 安全头' % m.group(1).strip())
    print('\n'.join(all_err) if all_err else '  nginx 配置静态检查通过')
    sys.exit(1 if all_err else 0)

main()
