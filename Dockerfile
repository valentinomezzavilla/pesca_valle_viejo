# ---------- 1) Compilar el frontend ----------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY shared shared
COPY client client
RUN npm run build -w client

# ---------- 2) Imagen final: solo el servidor + el frontend compilado ----------
FROM node:24-alpine
RUN apk add --no-cache tzdata
ENV NODE_ENV=production \
    TZ=America/Argentina/Cordoba \
    PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev -w server -w shared && npm cache clean --force
COPY shared shared
COPY server/src server/src
COPY --from=build /app/client/dist client/dist

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/salud || exit 1
CMD ["node", "server/src/server.js"]
