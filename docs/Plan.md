# Peasant to King — Plan incremental para Codex

**Versión:** 0.2 · **Actualizado:** 4 de noviembre de 2026  
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

## 5. Estado real al cierre del 4 de noviembre de 2026

**Nombre definitivo:** Peasant to King. **Etapas 00–05:** implementadas y probadas por el usuario, incluyendo la corrección del indicador de ocupación y la **unión gráfica automática de caminos** (tramos rectos, esquinas y cruces). La etapa 05 incorpora el Centro de Aldea y la conectividad lógica de edificios mediante caminos ortogonales.

**Importante:** el plan original de las etapas 02 y 04 mencionaba recursos/costos, pero el alcance realmente implementado se centró en selección y edificios **sin economía**. **No dar por terminados los costos ni los recursos.** Se incorporan a las etapas económicas posteriores según el estado real del código. Antes de empezar cada entrega, Codex debe consultar `docs/ESTADO.md` y verificar el código, no asumir que todo lo previsto en la tabla ya existe.

**Siguiente entrega:** 06 — producción/economía básica, definiendo primero los recursos, costos y reglas mínimas; la producción debe depender de conectividad. Después seguir 07–11 para completar el MVP funcional.

### Reglas temporales de 09B

- El calendario ficticio empieza en el año 1, día 1 a las 00:00. Cada día tiene 24 horas y cada año 12 días. El día va de 06:00 a 17:59 y la noche de 18:00 a 05:59.
- Una hora del juego equivale a 25 segundos de simulación. Un día dura 600 segundos reales a ×1, 300 a ×2 y 200 a ×3. La pausa y la suspensión de la pestaña descartan el tiempo transcurrido mientras están activas.
- Las tasas visibles se expresan por hora del juego y son independientes de la velocidad. La granja y el campamento maderero producen hasta 50 unidades/h y cada habitante demanda 2,5 comida/h.
- El salario es de 0,10 oro por trabajador empleado y hora del juego. El mantenimiento por construcción y hora es 0,01 para caminos y solares, 0,05 para granjas y campamentos, 0,08 para almacenes y mercados, y gratuito para el Centro de Aldea.
- Los gastos se prorratean por segundo de simulación y se liquidan al cierre de cada hora, después de las ventas. Los salarios tienen prioridad sobre el mantenimiento. El historial distingue los pagos de los importes que quedaron impagados. Esos importes quedan registrados sin cobro retroactivo.
- El calendario reserva cuatro estaciones futuras de tres días cada una. A ×1 equivaldrán a 30 minutos reales por estación y 120 minutos por año. La fase actual solo indica día o noche mediante texto.

### Reglas económicas de 09C

- Los impuestos residenciales se calculan sobre una base provisional de 1 oro por habitante y hora del juego. La política baja cobra 5 % y suma 10 puntos de atractivo, la normal cobra 10 % y la alta cobra 20 % y resta 20 puntos. La política normal es la inicial.
- Los impuestos se devengan según población y política vigentes en cada segundo de simulación. Se acreditan al cierre de hora, antes de salarios y mantenimiento.
- Cada mercado comparte 100 unidades de capacidad entre comida y madera. Las viviendas cubiertas consumen hasta 0,5 unidades de madera por habitante y hora. El faltante se informa en el inspector.
- La base tributaria y los ingresos municipales directos de 1 oro por unidad de comida o madera consumida son provisionales hasta introducir presupuestos familiares.

### Bienestar y migración de 10A-1

- El atractivo usa abastecimiento, bienestar, empleo e impuestos. La capacidad libre y el suministro previsto por vivienda determinan la admisión de quienes esperan.
- La lista de espera admite hasta la mitad de la población redondeada hacia arriba, con un mínimo de cuatro plazas. Si el atractivo permanece en cero, una persona desiste por hora del juego.
- La felicidad empieza en 70 y se aproxima gradualmente a un objetivo ponderado por comida, madera, empleo e impuestos. El bienestar general pondera cada vivienda por sus residentes.
- Una vivienda que permanece por debajo de 40 durante dos horas del juego puede perder un residente. La ciudad admite como máximo una salida por hora y espera dos horas desde la última emigración y una felicidad media de al menos 45 para volver a admitir inmigrantes.

### Agua, aguadores y Voces de la aldea de 10A-2

- El pozo cuesta 20 oro y 10 madera. Tiene un puesto de aguador, mantiene un gasto de 0,05 oro por hora y abastece a un máximo de 20 habitantes a seis casillas viales. El servicio depende de un trabajador asignado y de una conexión al Centro de Aldea.
- El agua se mide como habitantes abastecidos. El bienestar usa el suministro efectivo de comida, madera y agua, junto con el empleo y los impuestos. El resumen de necesidades promedia hasta una hora del juego y estima el número equivalente de habitantes afectados.
- Voces de la aldea conserva las 50 opiniones más recientes, generadas a partir de plantillas y de observaciones de hogares habitados. Se puede filtrar por tono y seleccionar la vivienda de origen mientras siga existiendo.

### Evolución y deterioro residencial de 10B

- Choza, casa de madera, casa de piedra y residencia próspera alojan hasta 4, 6, 8 y 12 habitantes. Un solar nuevo parte del nivel 1. Las construcciones ya mejoradas conservan su nivel mientras están vacías.
- Una vivienda ocupada mejora tras 60 segundos simulados continuos con felicidad de al menos 80, comida, madera y agua completamente cubiertas y desempleo municipal de hasta 25 %. El deterioro requiere otros 60 segundos continuos con felicidad inferior a 40 o una necesidad sin cubrir. La interrupción de una condición reinicia el contador correspondiente.
- Cada cambio avanza o retrocede un nivel. Si la nueva capacidad es menor que la ocupación, el excedente abandona la ciudad y se registra en el historial de población. Las opiniones de mejora y deterioro se publican con el intervalo y la cadencia de Voces de la aldea.
- Las cuatro ilustraciones originales se almacenan en src/assets/housing. HousingArt asigna una textura por nivel. Cambiar una ilustración por un PNG solo requiere actualizar su importación en ese archivo.

### Etapa 11A. Alpha 0.1

- El almacén configura por separado la recepción y el envío a mercados de comida y madera. La reserva conserva las reglas de acceso para construir y el modo vaciado transfiere a otros almacenes.
- Voces de la aldea amplía su catálogo con 69 plantillas y rota entre temas y hogares. La cadencia se mide en tiempo simulado.
- Alpha 0.1 cierra la etapa. El desarrollo continúa en `main` y la publicación web queda aplazada. El [README](../README.md) describe la verificación local.

### Etapa 12A. Mapa grande y cámara móvil

- El mundo de pasto mide 100 × 100 casillas. La vista inicial abarca 20 casillas por lado y se centra en el Centro de Aldea. Una partida nueva coloca el centro en la casilla (50, 50).
- WASD, flechas y arrastre desplazan la cámara. La rueda hace zoom hacia el puntero. **Centrar aldea** regresa al Centro de Aldea con el zoom actual. El clic izquierdo se confirma al soltar y se cancela si el puntero se arrastró.
- Los guardados incluyen dimensiones, posición y zoom. Las partidas de 20 × 20 se amplían al cargar usando el ancho original para conservar sus coordenadas.
- Las dimensiones y el punto de inicio se definen por separado de la cámara. Los terrenos procedurales quedan para 12B y el camino exterior para 12C.

### Etapa 12B. Generación procedural y limpieza

- Nueva partida crea un mapa de 100 × 100 a partir de una semilla entera. **Partida** muestra la semilla y permite reutilizarla. Campos suaves de humedad y elevación agrupan los bosques y las zonas escarpadas. El río sigue un trazado continuo de norte a sur.
- El Centro de Aldea conserva la casilla (50, 50). La generación despeja una zona de 13 × 13 y valida al menos 350 casillas libres conectadas con expansión en dos direcciones. Corrige el área de forma determinista si hace falta.
- **Demoler** también limpia obstáculos con confirmación. Árbol individual cuesta 3 oro, bosque denso 8 y rocas superficiales 6. El suelo queda intacto y el gasto entra al historial. Ríos, barrancos y montañas están protegidos.
- El guardado almacena la semilla, el terreno completo y el zoom y la posición de cámara. Las partidas anteriores conservan su suelo de pasto. Al recargar la pestaña se recupera la sesión desde su copia temporal cuando está disponible.

### Funcionalidad futura reservada: evolución visual de la ciudad

**Prioridad:** después de finalizar, probar y publicar el MVP funcional (etapas 06–11), **no antes**. Es una expansión planificada, no un requisito inmediato ni una orden de implementación automática. Dividir en tareas pequeñas independientes:

| ID futuro | Función | Regla propuesta |
|---|---|---|
| F01 | Prosperidad y servicios | Calcular por vivienda una puntuación basada en acceso por caminos, abastecimiento, mercado, seguridad y otros servicios; ajustar las reglas tras probar la economía. |
| F02 | Evolución visual ampliada de viviendas | 10B cubre los cuatro niveles residenciales. Los efectos visuales adicionales forman parte del pulido futuro. |
| F03 | Mejoras de calles | Camino de tierra → grava → piedra → piedra pulida/real; mantener las uniones automáticas de rectas, curvas, T y cruces en todos los niveles. |
| F04 | Evolución de edificios | Granja, leñador/aserradero, almacén y mercado tendrán apariencias más desarrolladas según nivel/mejoras económicas; siempre reconocibles. |
| F05 | Centro de aldea y defensa | Centro de Aldea → ayuntamiento/casa señorial → castillo; añadir torres de vigilancia, guardias, murallas y portones por etapas posteriores. |
| F06 | Pulido visual | Barrios pobres y prósperos distinguibles, decoración y animaciones ligeras; sin exigir simulación de ciudadanos ni rehacer el motor. |

**Principio de diseño:** el crecimiento visual debe reflejar desarrollo y funcionamiento de la ciudad, no solo tiempo transcurrido. Algunas mejoras pueden requerir acciones del jugador y recursos, en vez de ser todas automáticas. Acordar reglas y balance antes de codificarlas. **No gastar tokens en el arte final todavía**; reutilizar el sistema gráfico existente mientras probamos mecánicas.

## 6. Cómo usar Codex de forma eficiente

1. Revisar el cupo en **Configuración → Uso** antes de tareas nuevas. Reservar de manera orientativa la mayor parte del cupo para tu trabajo profesional; si no tienes cupo suficiente, no iniciar otra tarea.
2. Usar un modelo más económico para cambios pequeños cuando esté disponible; reservar modelos más capaces para errores complejos o decisiones de arquitectura.
3. Pegar **solo el prompt de la siguiente tarea** y mantener accesible este plan en el repositorio como `docs/PLAN.md`.
4. Pedir que no cambie archivos ajenos al alcance, no instale dependencias adicionales sin justificar y no cree funcionalidades futuras.
5. Verificar cada resultado manualmente; si falla, dar a Codex el error exacto y pedir una corrección localizada.
6. Hacer commit al aprobar cada entrega. Si surgen errores, comparar con el último commit estable.
7. Registrar uso real y número de iteraciones por entrega; con 2–3 tareas completadas podrás estimar la velocidad del proyecto sin adivinar millones de tokens.

### Plantilla para solicitudes posteriores

> Continúa el proyecto «Peasant to King». Revisa `docs/PLAN.md`, `docs/ESTADO.md` y únicamente los archivos relevantes. Ejecuta **solo la tarea [ID]** según el plan. Mantén la solución simple y no implementes tareas posteriores. Cuando termines, ejecuta `npm run build`, resume archivos modificados y describe cómo lo compruebo manualmente. Si algo falla, indícalo; no lo declares terminado. Actualiza `docs/ESTADO.md` en un máximo de 10 líneas nuevas. No publiques ni hagas push.

## 7. Primer mensaje histórico para Codex (tarea 00)

> Vamos a crear por etapas un juego web 2D medieval llamado provisionalmente «Peasant to King». La meta inicial es construir una aldea en un mapa de casillas, NO desarrollar todo el juego de una vez. Trabaja en el repositorio actual (si está vacío, inicialízalo) con **Vite + TypeScript + Phaser**, sin React ni backend. Configura un proyecto mínimo que funcione con `npm install`, `npm run dev` y `npm run build`. Muestra una pantalla inicial con el título del juego y el texto «Prototipo — Etapa 00», sin mapas, economía ni edificios todavía. Crea `docs/PLAN.md` con la descripción del alcance y la secuencia 00–11 de este plan (si el archivo ya existe, respétalo), y `docs/ESTADO.md` con el estado de esta entrega. Mantén el código simple, sin recursos gráficos externos ni dependencias innecesarias. Ejecuta `npm run build` y dime qué archivos modificaste, si la compilación pasó y exactamente qué debo revisar en el navegador. No implementes etapas posteriores. No publiques ni hagas push.

**Después de aprobar 00:** prueba la página, captura cualquier error de consola y marca 00 como terminado. Solo entonces solicita 01.

## 8. Qué guardar del desarrollo

| Fecha | Tarea | Cupo antes/después | Iteraciones | Resultado | Commit |
|---|---|---|---|---|---|
| | 00 | | | | |
| | 01 | | | | |
| | 02 | | | | |

**Nota:** los plazos, tokens y consumo de cupos no pueden calcularse con exactitud a partir del tamaño del proyecto. Este registro sirve para medir el uso de tu propia cuenta.
