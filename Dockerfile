FROM node:22-bookworm

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN corepack enable
COPY pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=8501
EXPOSE 8501

CMD ["npm", "run", "start"]
