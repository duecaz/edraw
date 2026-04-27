FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/room/package.json apps/room/package.json
RUN npm install --workspace apps/room --include-workspace-root --omit=dev

COPY apps/room apps/room

ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002
CMD ["node", "apps/room/src/index.js"]
