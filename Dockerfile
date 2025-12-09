# Stage 1: Build
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx tsc

# Production Image (AWS Lambda Base Image)
FROM public.ecr.aws/lambda/nodejs:18

# Copy dependencies
COPY --from=builder /app/package*.json ${LAMBDA_TASK_ROOT}/
RUN npm install --production

# Copy built code
COPY --from=builder /app/dist ${LAMBDA_TASK_ROOT}/dist

# Default CMD (Overridden by Terraform)
CMD ["dist/src/scanner/index.handler"]
