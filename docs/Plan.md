# De Campesino a Rey — Plan incremental para Codex

**Versión:** 0.1 · **Fecha:** 4 de noviembre de 2026  
**Propósito:** crear un pequeño *city builder idle* medieval para navegador, construyéndolo por entregas cortas y comprobables, sin consumir innecesariamente el cupo de Codex.

## 1. Concepto y alcance

El jugador empieza con un terreno vacío, coloca caminos y edificios donde elija, produce recursos con el tiempo y hace crecer su asentamiento. El **primer hito** es una aldea pequeña, jugable y guardable; no todo el recorrido hasta rey.

### Para el primer hito (MVP)
- Mapa 2D de 20 × 20 casillas, **vista superior ortogonal** (no isométrica inicialmente).
- Selección y colocación manual de caminos, casas, granjas, leñadores, almacén y mercado.
- Reglas simples de ocupación y recursos para construir; derribar edificios con confirmación.
- Conexión de edificios mediante caminos hasta un edificio central (comprobación de conectividad sencilla; no hay ciudadanos simulados).
- Recursos: oro, madera y comida. Producción automática; capacidad y costos definidos en archivo de configuración.
- Población básica derivada de casas abastecidas y objetivos para pasar de **campesino** a **aldea**.
- Interfaz: barra de recursos, menú de construcción, selección de casilla y panel informativo.
- Guardado local automático y botón para reiniciar partida con confirmación.
- Funcionamiento en escritorio; controles móviles y despliegue se pulen después.

### Fuera del primer hito
Multijugador, login, servidor, cuentas en nube, ranking global, combate, ejércitos, ciudades rivales, impuestos complejos, física, simulación individual de cada ciudadano, multiterritorio, arte final e isometría. **No agregar por iniciativa propia** estas funciones.

## 2. Stack y criterios de simplicidad

- **TypeScript + Vite + Phaser** para navegador.
- Sin React, backend ni base de datos en el MVP.
- Persistencia mediante `localStorage`, con versión del formato de guardado.
- Gráficos provisionales creados por código (colores, formas, iconos simples) y sin descargar recursos con licencias dudosas.
- Lógica de simulación separada del renderizado; configuración central de edificios y costos.
- `npm run dev` para probar; `npm run build` antes de declarar cada tarea terminada.
- Repositorio Git con un commit o etiqueta por entrega aprobada. No publicar ni hacer push sin indicación.

## 3. Regla de oro para cada tarea

**Una tarea = un cambio pequeño = una prueba comprobable.** No pedir «haz el juego completo» ni «arregla todo». Al terminar, Codex debe informar (a) archivos modificados, (b) pruebas ejecutadas, (c) pasos manuales, (d) problemas pendientes. Una vez aprobada, registrar el resultado en `docs/ESTADO.md` con máximo 10 líneas de avance; así la siguiente tarea retoma desde una nota corta.

## 4. Secuencia de entregas (enviar una por sesión de trabajo)

| ID | Entrega | Resultado visible | Prueba de aceptación | Costo relativo |
|---|---|---|---|---|
| 00 | Base técnica | Página inicial y proyecto que arranca | `npm run dev`, página carga y `npm run build` pasa | Bajo |
| 01 | Mapa | Terreno de 20×20 casillas | Se ve completo; clic identifica la casilla | Bajo |
| 02 | Cámara/UI | Selección de casilla y barra superior | Se ve coordenada y recursos de ejemplo | Bajo |
| 03 | Construcción | Elegir casa o camino y colocar en celdas vacías | No permite dos edificios en una casilla | Medio |
| 04 | Construcción extendida | Granja, leñador, almacén y mercado; costos | Cada edificio aparece y descuenta costo; no hay recursos negativos | Medio |
| 05 | Caminos | Red de caminos y conexión al centro del poblado | Edificio conectado se marca activo; desconectado, inactivo | Medio-alto |
| 06 | Producción | Comida, madera y oro se generan a intervalos | Los valores cambian solo para edificios activos | Medio |
| 07 | Población | Casas aumentan capacidad y población según reglas sencillas | Construir/demoler afecta población correctamente | Medio |
| 08 | Guardado | Guardado y carga en `localStorage` | Recargar conserva mapa, edificios y recursos | Medio |
| 09 | Progresión | Objetivos y desbloqueo de la etapa «Aldea» | Con objetivos completos se desbloquea la nueva etapa | Medio |
| 10 | Calidad | Errores, mensajes, botón de demolición y reinicio | No deja estados inválidos; reinicio pide confirmación | Medio |
| 11 | Publicación | Versión web estática para GitHub Pages | URL publicada carga con rutas y recursos correctos | Bajo-medio |

**Primer alto recomendable:** tras la tarea **03**, evaluar si la experiencia de construir ya resulta agradable. **Segundo alto:** tras la **06**, decidir si seguir o cambiar el diseño. **Tercer alto:** tras la **09**, el MVP ya debe ser jugable.

## 5. Cómo usar Codex de forma eficiente

1. Revisar el cupo en **Configuración → Uso** antes de tareas nuevas. Reservar de manera orientativa la mayor parte del cupo para tu trabajo profesional; si no tienes cupo suficiente, no iniciar otra tarea.
2. Usar un modelo más económico para cambios pequeños cuando esté disponible; reservar modelos más capaces para errores complejos o decisiones de arquitectura.
3. Pegar **solo el prompt de la siguiente tarea** y mantener accesible este plan en el repositorio como `docs/PLAN.md`.
4. Pedir que no cambie archivos ajenos al alcance, no instale dependencias adicionales sin justificar y no cree funcionalidades futuras.
5. Verificar cada resultado manualmente; si falla, dar a Codex el error exacto y pedir una corrección localizada.
6. Hacer commit al aprobar cada entrega. Si surgen errores, comparar con el último commit estable.
7. Registrar uso real y número de iteraciones por entrega; con 2–3 tareas completadas podrás estimar la velocidad del proyecto sin adivinar millones de tokens.

### Plantilla para solicitudes posteriores

> Continúa el proyecto «De Campesino a Rey». Revisa `docs/PLAN.md`, `docs/ESTADO.md` y únicamente los archivos relevantes. Ejecuta **solo la tarea [ID]** según el plan. Mantén la solución simple y no implementes tareas posteriores. Cuando termines, ejecuta `npm run build`, resume archivos modificados y describe cómo lo compruebo manualmente. Si algo falla, indícalo; no lo declares terminado. Actualiza `docs/ESTADO.md` en un máximo de 10 líneas nuevas. No publiques ni hagas push.

## 6. Primer mensaje listo para pegar en Codex (tarea 00)

> Vamos a crear por etapas un juego web 2D medieval llamado provisionalmente «De Campesino a Rey». La meta inicial es construir una aldea en un mapa de casillas, NO desarrollar todo el juego de una vez. Trabaja en el repositorio actual (si está vacío, inicialízalo) con **Vite + TypeScript + Phaser**, sin React ni backend. Configura un proyecto mínimo que funcione con `npm install`, `npm run dev` y `npm run build`. Muestra una pantalla inicial con el título del juego y el texto «Prototipo — Etapa 00», sin mapas, economía ni edificios todavía. Crea `docs/PLAN.md` con la descripción del alcance y la secuencia 00–11 de este plan (si el archivo ya existe, respétalo), y `docs/ESTADO.md` con el estado de esta entrega. Mantén el código simple, sin recursos gráficos externos ni dependencias innecesarias. Ejecuta `npm run build` y dime qué archivos modificaste, si la compilación pasó y exactamente qué debo revisar en el navegador. No implementes etapas posteriores. No publiques ni hagas push.

**Después de aprobar 00:** prueba la página, captura cualquier error de consola y marca 00 como terminado. Solo entonces solicita 01.

## 7. Qué guardar del desarrollo

| Fecha | Tarea | Cupo antes/después | Iteraciones | Resultado | Commit |
|---|---|---|---|---|---|
| | 00 | | | | |
| | 01 | | | | |
| | 02 | | | | |

**Nota:** los plazos, tokens y consumo de cupos no pueden calcularse con exactitud a partir del tamaño del proyecto. Este registro sirve para medir el uso de tu propia cuenta.
