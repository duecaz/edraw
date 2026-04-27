# edraw

Versión personalizable de Excalidraw con colaboración en tiempo real.
Pensada para ser ligera y barata: dos apps en Fly.io que cuestan céntimos al
mes para pocos usuarios.

```
edraw/
├── apps/
│   ├── web/    # Vite + React + @excalidraw/excalidraw (frontend)
│   └── room/   # Servidor Socket.IO mínimo para realtime
└── .github/workflows/fly-deploy.yml
```

## Desarrollo local

```bash
# 1. instalar dependencias (workspaces)
npm install

# 2. arrancar el servidor de salas
npm run dev:room        # http://localhost:3002

# 3. arrancar la web (otra terminal)
npm run dev:web         # http://localhost:5173
```

Abre dos pestañas con la misma URL (incluido el `#room=...` que se genera) y
verás la colaboración funcionando: los cambios y los punteros se sincronizan.

Variables de entorno:

| Variable               | Dónde         | Para qué                                                                 |
| ---------------------- | ------------- | ------------------------------------------------------------------------ |
| `VITE_ROOM_SERVER`     | apps/web      | URL del servidor de salas. Se "hornea" en el bundle al hacer build.      |
| `PORT`                 | apps/room     | Puerto. Por defecto `3002`.                                              |
| `CORS_ORIGIN`          | apps/room     | Origen permitido. Por defecto `*` (déjalo así o pon tu dominio web).     |

## Despliegue en Fly.io

Vas a tener **dos apps** Fly: `edraw-room` (websockets) y `edraw-web` (estático
servido por nginx).

### 1. Instalar flyctl y loguearse

```bash
curl -L https://fly.io/install.sh | sh
flyctl auth login
```

### 2. Crear las apps en Fly (una sola vez)

Desde la raíz del repo:

```bash
# Servidor realtime
flyctl apps create edraw-room

# Frontend
flyctl apps create edraw-web
```

> Si los nombres están ocupados elige otros y actualiza `app = "..."` en cada
> `fly.toml`.

### 3. Primer deploy manual

```bash
flyctl deploy --config apps/room/fly.toml --dockerfile apps/room/Dockerfile
flyctl deploy --config apps/web/fly.toml  --dockerfile apps/web/Dockerfile \
  --build-arg VITE_ROOM_SERVER=https://edraw-room.fly.dev
```

Ojo: la URL del room se hornea en el bundle del frontend; si cambias el nombre
de la app del room, hay que volver a desplegar la web con el `--build-arg`
nuevo.

### 4. Conectar GitHub → Fly (deploys automáticos)

a. Genera un token de deploy:

```bash
flyctl tokens create deploy -x 999999h
```

b. En GitHub, **Settings → Secrets and variables → Actions**:

- Secret nuevo: `FLY_API_TOKEN` con el token de arriba.
- (Opcional) Variable `VITE_ROOM_SERVER` si tu room no se llama
  `edraw-room.fly.dev`.

c. Push a `main` y el workflow `.github/workflows/fly-deploy.yml` despliega
   primero el room y luego la web.

## ¿Por qué este stack?

- **Frontend = paquete `@excalidraw/excalidraw`** (no fork del monorepo). Tu
  app es un `<Excalidraw />` envuelto en tu UI: añade botones, atajos, QR,
  exportadores, lo que quieras, sin pelearte con merges del upstream.
- **Realtime = Socket.IO propio** en una VM `shared-cpu-1x` de 256 MB. Para
  pocos usuarios sobra y cuesta literalmente céntimos. Sin lock-in.
- **Fly.io** mantiene WebSockets abiertos (a diferencia de Vercel/Netlify),
  da TLS, healthchecks y autoscale gratis.

## Personalización

- `apps/web/src/App.tsx` — punto de entrada, instanciación de `<Excalidraw>`,
  hooks de colaboración.
- `apps/web/src/CustomToolbar.tsx` — ejemplo de panel propio (botón de
  compartir). Añade aquí QR, atajos, herramientas extras, etc.
- `apps/room/src/index.js` — protocolo de mensajes. Eventos:
  `join-room`, `scene-update`, `pointer-update`. Añade autenticación o
  cifrado aquí si lo necesitas.

## Limitaciones conocidas (y cómo crecer)

1. **Sin cifrado E2E.** Excalidraw oficial cifra cada mensaje con AES-GCM en
   el cliente. Si lo necesitas, copia su `Collab` y `encryption.ts` del
   monorepo `excalidraw/excalidraw`.
2. **Sincronización ingenua** (envía el array de elementos completo). Para
   pocos usuarios y pizarras pequeñas funciona. Si crece, migra a Yjs +
   `y-excalidraw` (CRDT con diffs eficientes).
3. **Sin persistencia.** Si todos cierran la pestaña, el dibujo se pierde.
   Para guardar, persiste el último `scene-update` por sala en Redis/SQLite y
   re-emítelo en `join-room`.
