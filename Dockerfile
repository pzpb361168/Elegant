FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* bun.lock* ./
RUN npm install
COPY tsconfig.json server.ts ./
COPY src/shared ./src/shared
RUN npx esbuild server.ts --bundle --platform=node --format=esm --packages=external --outfile=server.mjs

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/server.mjs ./server.mjs
EXPOSE 3000
CMD ["node", "server.mjs"]
