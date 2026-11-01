FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production DATABASE_PATH=/data/factures.sqlite
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
VOLUME /data
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
