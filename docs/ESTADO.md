# Estado del proyecto

- 2026-11-04 — Tarea 00 implementada: base técnica con Vite, TypeScript y Phaser.
- 2026-11-04 — Tarea 01 implementada: mapa verde con cuadrícula de 20 × 20 casillas.
- 2026-11-04 — Tarea 02 implementada: selección persistente con clic izquierdo y cambio de casilla.
- Panel inferior: coordenadas X/Y (0–19, origen arriba a la izquierda), terreno césped y estado disponible.
- Botón para cancelar la selección; deshabilitado cuando no hay ninguna casilla seleccionada.
- Se conserva el resaltado temporal, el título, la cámara fija y el mapa completo con casillas cuadradas.
- Estado de selección separado del dibujo del mapa y del panel; se conserva al redimensionar.
- Sin nuevas dependencias ni funcionalidades de etapas 03–11; no se implementó economía.
- Verificación: `npm run build` y comprobaciones locales de límites, selección, redimensionado, panel y cancelación correctos.
- Continúa la advertencia de paquete superior a 500 kB por Phaser; no impide compilar.
- Pendiente: comprobación visual y aprobación del usuario; proyecto sin publicar.
