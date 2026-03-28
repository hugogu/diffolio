#!/bin/sh
# Substitute environment variables in nginx config and start nginx

# Replace ICP record in HTML (supports both env var and empty string)
ICP_RECORD="${ICP_RECORD:-}"
sed -i "s/{{ICP_RECORD}}/$ICP_RECORD/g" /usr/share/nginx/html/index.html

envsubst '$UPLOAD_MAX_SIZE_MB' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
nginx -g 'daemon off;'
