# Estado del proyecto

- 2026-11-04 — Tarea 00 implementada: base técnica con Vite, TypeScript y Phaser.
- 2026-11-04 — Tarea 01 implementada: mapa verde con cuadrícula de 20 × 20 casillas.
- 2026-11-04 — Tarea 02 implementada: selección persistente con clic izquierdo y cambio de casilla.
- 2026-11-04 — Tarea 03 implementada: menú Casa, Camino y Cancelar construcción; herramienta activa hasta cancelarla.
- Modelo de ocupación independiente de Phaser: una construcción por casilla; se rechazan solapamientos y posiciones inválidas.
- Gráficos por código y vista previa semitransparente; indicador rojo en casillas ocupadas.
- Se conservan selección, resaltado temporal y panel X/Y (0–19); el estado distingue disponible u ocupada con el nombre de la construcción.
- Mapa y construcciones se ajustan al redimensionar; datos en memoria, sin guardado ni nuevas dependencias o etapas 04–11.
- Verificación: `npm run build` correcto; pruebas locales de las 400 casillas, solapamientos, límites y gráficos dentro de una casilla correctas.
- 2026-11-04 — Corrección visual: amarillo y vista previa comparten la casilla del cursor; amarillo limitado al modo construcción y limpiado al salir o cancelar, sin afectar la selección azul.
- Verificación de la corrección: `npm run build` y prueba local de eventos de movimiento, clic, salida y cancelación correctos; sin nuevas dependencias.
- Pendiente: prueba visual y aprobación del usuario; sigue la advertencia de tamaño de Phaser; proyecto sin publicar.
