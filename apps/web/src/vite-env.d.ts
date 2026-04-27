/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ROOM_SERVER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
