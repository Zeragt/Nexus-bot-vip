# Nexus bot — Node 22 on Debian slim (glibc, required by @napi-rs/canvas prebuilt binaries)
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
USER node
CMD ["node", "index.js"]
