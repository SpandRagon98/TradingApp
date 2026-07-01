# Backend image — Node 22 (built-in node:sqlite, no native build needed).
FROM node:22-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public

ENV NODE_ENV=production
ENV PORT=8080
ENV STORAGE=sqlite
EXPOSE 8080

# SQLite data persists in /app/data — mount a volume there (see docker-compose.yml).
# Config comes from container env (no --env-file in the image).
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
