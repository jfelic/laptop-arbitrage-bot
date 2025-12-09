# Stage 1: Build
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx tsc

# Production Image (Contains both for simplicity)
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/package*.json ./
RUN npm install --production
COPY --from=builder /app/dist ./dist
CMD ["dist/src/scanner/index.handler"]
