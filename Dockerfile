# Build the React frontend and run it with the Node API in one production
# container. Keeping both on one origin makes /api and /ws work over HTTPS
# without exposing a second service or configuring browser-side secrets.
FROM node:22-alpine AS frontend-build
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/src ./src
COPY --from=frontend-build /build/frontend/dist ./public

RUN mkdir -p /app/data && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=8080
ENV STORAGE=sqlite

USER node
EXPOSE 8080

CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]

