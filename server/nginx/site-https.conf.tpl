# 拾色 GRAFT · HTTPS 站点(install.sh 生成,域名 __DOMAIN__)  →  /etc/nginx/sites-available/graft

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    server_tokens off;
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
        default_type text/plain;
    }
    location / {
        return 301 https://__DOMAIN__$request_uri;
    }
}

server {
    listen 443 ssl http2 default_server;
    listen [::]:443 ssl http2 default_server;
    server_name __DOMAIN__;

    ssl_certificate     /etc/letsencrypt/live/__DOMAIN__/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/__DOMAIN__/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:graft_ssl:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # 用 IP 或别的域名直接访问 443 的扫描器:直接断开
    if ($host != "__DOMAIN__") { return 444; }

    include /etc/nginx/snippets/graft-app.conf;
}
