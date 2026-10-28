#!/usr/bin/env python3
"""
生产构建:python3 tools/build.py  →  dist/

  - 删除 /* @debug-start */ … /* @debug-end */ 之间的调试代码(跳关键、?lv= 参数、window.__game 钩子)
  - 压缩 JS / CSS / HTML(有 node 时用 terser 混淆变量名;没有就用内置的安全压缩)
  - 文件名带内容哈希:static/game.<hash>.js,浏览器可以永久缓存,发新版自动失效
  - 预生成 .gz,Nginx 直接发压缩好的文件,不占 CPU
零依赖:只用 Python 标准库。
"""
import gzip, hashlib, json, os, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')


def read(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return f.read()


def strip_debug(js):
    out, n = re.subn(r'/\* @debug-start \*/.*?/\* @debug-end \*/', '', js, flags=re.S)
    if '@debug' in out or n == 0:
        sys.exit('调试块标记不成对,停止构建')
    return out


# ───────────────── 内置 JS 压缩:按词法扫描,去注释与缩进,保留换行(不碰 ASI)
REGEX_PREV = set('(,=:[!&|?{};+-*%<>~^')
REGEX_KW = {'return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await'}


def minify_js_builtin(src):
    out, i, n = [], 0, len(src)
    last_sig = ''          # 上一个有意义的字符/单词,用于判断 / 是除号还是正则
    while i < n:
        c = src[i]
        if c in '"\'':
            j = i + 1
            while j < n and src[j] != c:
                j += 2 if src[j] == '\\' else 1
            out.append(src[i:j + 1]); last_sig = 'str'; i = j + 1; continue
        if c == '`':
            sys.exit('内置压缩器不支持模板字符串,请安装 node 以使用 terser')
        if src.startswith('//', i):
            while i < n and src[i] != '\n':
                i += 1
            continue
        if src.startswith('/*', i):
            j = src.index('*/', i + 2)
            out.append(' ' if '\n' not in src[i:j] else '\n'); i = j + 2; continue
        if c == '/':
            if last_sig in REGEX_PREV or last_sig in REGEX_KW or last_sig == '':
                j, cls = i + 1, False
                while j < n:
                    if src[j] == '\\': j += 2; continue
                    if src[j] == '[': cls = True
                    elif src[j] == ']': cls = False
                    elif src[j] == '/' and not cls: break
                    elif src[j] == '\n': sys.exit('正则解析失败 @%d' % i)
                    j += 1
                j += 1
                while j < n and src[j].isalpha(): j += 1
                out.append(src[i:j]); last_sig = 'regex'; i = j; continue
        if c.isalnum() or c in '_$':
            j = i
            while j < n and (src[j].isalnum() or src[j] in '_$'):
                j += 1
            last_sig = src[i:j]; out.append(last_sig); i = j; continue
        if not c.isspace():
            last_sig = c
        out.append(c); i += 1
    text = ''.join(out)
    lines = [l.strip() for l in text.split('\n')]
    return '\n'.join(l for l in lines if l) + '\n'


def minify_js(src):
    npx = shutil.which('npx')
    if npx and os.environ.get('GRAFT_NO_TERSER') != '1':
        try:
            r = subprocess.run([npx, '--yes', 'terser@5.31.6', '--compress', 'passes=2', '--mangle', '--comments', 'false'],
                               input=src.encode(), capture_output=True, timeout=180)
            if r.returncode == 0 and r.stdout:
                print('  JS: terser 压缩 + 变量名混淆')
                return r.stdout.decode()
            print('  terser 失败,改用内置压缩:', r.stderr.decode()[:200])
        except Exception as e:
            print('  terser 不可用,改用内置压缩:', e)
    print('  JS: 内置压缩(去注释/缩进)')
    return minify_js_builtin(src)


def minify_css(src):
    src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
    src = re.sub(r'\s+', ' ', src)
    src = re.sub(r'\s*([{}:;,>])\s*', r'\1', src)
    return src.replace(';}', '}').strip() + '\n'


def minify_html(src):
    src = re.sub(r'<!--.*?-->', '', src, flags=re.S)
    return '\n'.join(l.strip() for l in src.split('\n') if l.strip()) + '\n'


def h8(data):
    return hashlib.sha256(data.encode() if isinstance(data, str) else data).hexdigest()[:10]


def write(rel, data, gz=True):
    path = os.path.join(DIST, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    mode = 'w' if isinstance(data, str) else 'wb'
    with open(path, mode, **({'encoding': 'utf-8'} if mode == 'w' else {})) as f:
        f.write(data)
    if gz:
        raw = data.encode() if isinstance(data, str) else data
        with open(path + '.gz', 'wb') as f:
            with gzip.GzipFile(filename='', mode='wb', fileobj=f, compresslevel=9, mtime=0) as g:
                g.write(raw)
    return path


def main():
    print('构建 →', DIST)
    shutil.rmtree(DIST, ignore_errors=True)
    os.makedirs(os.path.join(DIST, 'static'))

    js = minify_js(strip_debug(read('src/beads.js') + '\n' + read('src/harbor.js') + '\n' + read('src/game.js')))
    css = minify_css(read('src/style.css'))
    js_name, css_name = 'static/game.%s.js' % h8(js), 'static/style.%s.css' % h8(css)
    write(js_name, js); write(css_name, css)

    icons = {}
    for f in sorted(os.listdir(os.path.join(ROOT, 'assets'))):
        if f.endswith('.png'):
            shutil.copy(os.path.join(ROOT, 'assets', f), os.path.join(DIST, 'static', f))
            icons['assets/' + f] = 'static/' + f

    man = json.loads(read('manifest.webmanifest'))
    for ic in man['icons']:
        ic['src'] = icons.get(ic['src'], ic['src'])
    write('manifest.webmanifest', json.dumps(man, ensure_ascii=False, separators=(',', ':')))

    html = read('index.html').replace('<script src="src/beads.js"></script>', '').replace('<script src="src/harbor.js"></script>', '').replace('src/game.js', js_name).replace('src/style.css', css_name)
    for a, b in icons.items():
        html = html.replace(a, b)
    if 'src/' in html or 'assets/' in html:
        sys.exit('index.html 里还有未替换的路径')
    write('index.html', minify_html(html))

    info = {'js': js_name, 'css': css_name, 'built': __import__('time').strftime('%Y-%m-%d %H:%M:%S')}
    try:
        info['commit'] = subprocess.run(['git', '-C', ROOT, 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True).stdout.strip()
    except Exception:
        pass
    write('static/build.json', json.dumps(info), gz=False)

    total = gz_total = 0
    for dp, _, fs in os.walk(DIST):
        for f in fs:
            p = os.path.join(dp, f); s = os.path.getsize(p)
            if f.endswith('.gz'): gz_total += s
            elif not os.path.exists(p + '.gz'): gz_total += s; total += s
            else: total += s
    print('  原始 %.1f KB → 传输(gzip) %.1f KB' % (total / 1024, gz_total / 1024))
    print('  完成:', js_name, css_name)


if __name__ == '__main__':
    main()
