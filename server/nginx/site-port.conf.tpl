# 拾色 GRAFT · 独立端口站点(和服务器上已有的网站共存,不占 80 端口)
server {
    listen __PORT__;
    listen [::]:__PORT__;
    server_name _;
    include /etc/nginx/snippets/graft-app.conf;
}
