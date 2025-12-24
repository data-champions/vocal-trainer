FROM node:22-bookworm

WORKDIR /app

RUN corepack enable
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile

COPY . .
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=8501
EXPOSE 8501

CMD ["pnpm", "start"]
