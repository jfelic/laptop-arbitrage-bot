# Stage 1: Build
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx tsc

# Stage 2: Scanner Image
FROM node:18-alpine AS scanner
WORKDIR /app
COPY --from=builder /app/package*.json ./
RUN npm install --production
COPY --from=builder /app/dist/src/scanner ./dist/src/scanner
# Copy shared/valuator if needed? Scanner logic is self contained in dist/src/scanner/index.js (if compiled correctly)
# However, tsc compiles everything to dist/.
# We should copy the dist folder structure.
COPY --from=builder /app/dist ./dist
CMD ["dist/src/scanner/index.handler"]

# Stage 3: Valuator Image
FROM node:18-alpine AS valuator
WORKDIR /app
COPY --from=builder /app/package*.json ./
RUN npm install --production
COPY --from=builder /app/dist ./dist
CMD ["dist/src/valuator/index.handler"]
