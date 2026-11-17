# Kayron Zeiterfassung – Container für Railway, Render, Fly.io oder eigenen Server
FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
# Datenbank und Fotos liegen in /data -> dort ein dauerhaftes Volume einhängen!
ENV DATA_DIR=/data NODE_ENV=production
RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "--no-warnings", "server.js"]
