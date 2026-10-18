# WOD Timer

Temporizador de entreno (AMRAP, FOR TIME, EMOM, TABATA) como app web instalable (PWA). Sin anuncios, sin dependencias, funciona sin conexión.

## Probar en el PC
Hace falta servirlo por HTTP (no abrir el `index.html` con doble clic):

```
npx serve .
```

## Instalar en el móvil (Android)
1. Sube esta carpeta a un repositorio de GitHub (por ejemplo, `wod-timer`).
2. En el repositorio: **Settings → Pages → Branch: main / (root) → Save**.
3. Abre en Chrome del móvil `https://<tu-usuario>.github.io/wod-timer/`.
4. Menú ⋮ → **Instalar app** (o "Añadir a pantalla de inicio").

Alternativa sin Git: arrastra la carpeta a https://app.netlify.com/drop.

## Al cambiar algo
Sube la versión en `sw.js` (`wodtimer-v1` → `wodtimer-v2`) para que el móvil descargue los archivos nuevos.
