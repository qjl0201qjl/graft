# 拾色 GRAFT · 纯 HTTP 站点(没有域名时的临时方案;口令会明文传输,不推荐长期使用)

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    include /etc/nginx/snippets/graft-app.conf;
}
