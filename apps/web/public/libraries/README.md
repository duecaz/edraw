# Catálogo educativo

Cada archivo `.excalidrawlib` es una librería estándar de Excalidraw.
Para añadir una nueva:

1. Abrí el editor → librerías → "Save as new library file" para exportar.
2. Copiá el archivo a esta carpeta.
3. Agregá una entrada en `catalog.json`:

```json
{
  "id": "mi-libreria",
  "name": "Mi librería",
  "description": "Qué contiene",
  "category": "matematicas",
  "file": "mi-libreria.excalidrawlib"
}
```

Las categorías se definen también en `catalog.json` bajo `categories`.
