FROM node:24-bookworm-slim

WORKDIR /app
RUN install -d -o node -g node /data
COPY --chown=node:node core/ ./core/
COPY --chown=node:node web/ ./web/
COPY --chown=node:node server.mjs ./server.mjs

ENV NODE_ENV=production \
    FUNDROOM_HOST=0.0.0.0 \
    FUNDROOM_PORT=3000 \
    FUNDROOM_PUBLIC_DEMO=true \
    FUNDROOM_DB_PATH=/data/fundroom-demo.sqlite

USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=4s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.FUNDROOM_PORT + '/api/health').then(r => { if (!r.ok) process.exitCode = 1; }).catch(() => { process.exitCode = 1; })"

CMD ["node", "server.mjs"]
