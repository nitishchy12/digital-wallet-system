# Dependencies stage
FROM node:18-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Runtime stage
FROM node:18-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# curl is required for container healthcheck command in docker-compose
RUN apk add --no-cache curl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Run as non-root user
RUN addgroup -S app && adduser -S -G app app && chown -R app:app /app
USER app

EXPOSE 5000

CMD ["npm", "start"]


