FROM node:24-bookworm-slim
WORKDIR /app
RUN install -d -m 700 -o node -g node /data
COPY start.mjs site-worker.mjs ./
COPY core/ ./core/
COPY hosting/ ./hosting/
ENV NODE_ENV=production \
    PORT=3000 \
    FUNDROOM_DIRECT_BIND=0.0.0.0 \
    FUNDROOM_DIRECT_BUNDLE=/app/site-worker.mjs \
    FUNDROOM_DIRECT_DB=/data/fund-edition.sqlite \
    FUNDROOM_ENABLE_LOCAL_VOICE=false \
    ALPACA_PAPER_TRADING_ENABLED=false \
    ALPACA_LIVE_TRADING_ENABLED=false
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=4s --start-period=8s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>{process.exitCode=r.ok?0:1}).catch(()=>{process.exitCode=1})"
CMD ["node","start.mjs"]
