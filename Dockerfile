FROM node:20-slim AS builder

WORKDIR app
COPY package* tsconfig* .
COPY src/ src/
RUN npm install && npm run build

FROM node:20-slim

RUN mkdir -p /app/dist /data && chown -R node:node /app /data
WORKDIR /app

COPY --from=builder --chown=node:node /app/dist/ ./dist/
COPY package* ./

USER node
RUN npm ci --omit=dev

WORKDIR /data
ENTRYPOINT ["node", "/app"]
