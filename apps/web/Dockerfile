# --- build stage ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY index.html vite.config.ts tsconfig.json ./
COPY src ./src
ARG VITE_ROOM_SERVER
ENV VITE_ROOM_SERVER=$VITE_ROOM_SERVER
RUN npm run build

# --- runtime stage ---
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
