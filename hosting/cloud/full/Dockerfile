FROM node:24-bookworm-slim
WORKDIR /app
RUN install -d -o node -g node -m 700 /data
COPY --chown=node:node server.mjs start.mjs ./
COPY --chown=node:node core/ ./core/
COPY --chown=node:node web/ ./web/
ENV NODE_ENV=production PORT=3000
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=4s --start-period=8s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>{process.exitCode=r.ok?0:1}).catch(()=>{process.exitCode=1})"
CMD ["node","start.mjs"]
