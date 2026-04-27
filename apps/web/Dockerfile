# --- build stage ---
FROM node:20-alpine AS build
WORKDIR /app

# Workspace install: copy root manifests + the web workspace
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
RUN npm install --workspace apps/web --include-workspace-root

COPY apps/web apps/web

ARG VITE_ROOM_SERVER
ENV VITE_ROOM_SERVER=$VITE_ROOM_SERVER
RUN npm --workspace apps/web run build

# --- runtime stage ---
FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
