# Build context: repo root (set via flyctl --dockerfile apps/web/Dockerfile from root).
# We need the workspace root + the @edraw/pen package, not just apps/web.

FROM node:20-alpine AS build
WORKDIR /app

# Workspace manifests first (better cache)
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY packages/edraw-pen/package.json packages/edraw-pen/package.json
RUN npm install --workspace apps/web --include-workspace-root

# Sources
COPY packages/edraw-pen packages/edraw-pen
COPY apps/web apps/web

ARG VITE_ROOM_SERVER
ENV VITE_ROOM_SERVER=$VITE_ROOM_SERVER

WORKDIR /app/apps/web
RUN npm run build

# --- runtime stage ---
FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
