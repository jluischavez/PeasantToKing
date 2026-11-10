# Peasant to King — Plan incremental para Codex

## Etapa 15A-4 — NPCs, profesiones y recompensas (2026-11-10)

Se partió del estado local limpio y de 437 pruebas aprobadas. Se conserva la arquitectura de 15A-1/2/3.

Diagnóstico reproducible: cada cambio de topología reiniciaba Loading a cero y convertía Unloading en Carrying, aunque el acceso siguiera siendo válido. Una sucesión de obras podía mantener un personaje en la entrada. También se omitía reconciliar inmediatamente la elegibilidad cuando cambiaban empleados/permisos sin cambiar la topología. Ahora se conserva el tiempo de trabajo en accesos válidos y la fracción del tramo si el siguiente paso no cambia; se buscan desvíos desde la posición confirmada y se bloquea sin perder mercancías/reservas. Agua e inmigración conservan igualmente la descarga. Los bloqueados siguen excluidos del renderizado, las operaciones terminadas liberan inventario transitorio y el pool sigue acotado. Las rutas de una casilla son válidas: completan carga/descarga dentro de los edificios sin representación estacionaria en la calle. El ensayo de cien segundos sin camino confirma que no aparecen operaciones nuevas; se conserva el cupo anterior de ocho por origen y la búsqueda de otro almacén autorizado.

`TransportAppearance` clasifica por tipo de viaje y edificio de origen, sin usar la carga como profesión. Paleta: almacén rojo #d33c36, maderería café #86502e, granja verde #36a34a, aguador azul #318cde, desempleado blanco #ffffff, forastero/inmigrante ocre #c99a30, comprador beige #d9c39d y mercado burdeos #85344f. Solo aparecen los roles respaldados por operaciones reales. El renderizador genera de forma diferida las combinaciones oficio/carga/frame y reasigna la textura al reutilizar una imagen.

| Misión | Recompensa nueva, además del favor vigente |
| --- | --- |
| Guerra del rey | 10 comida y 10–30 madera según la contribución |
| Hambruna en el norte | Oro equivalente al 40 % de la comida entregada, redondeado arriba, y 10 madera |
| El invierno se acerca | Oro equivalente al 70 % de la madera, redondeado arriba, y 10 comida |
| Visita del monarca | 25 oro |
| Pueblo digno de admiración | 4 oro por tramo de grava o 9 por piedra, y 10 madera |
| Capricho de la Corona | 15/45/75 oro por jardín/parque/plaza y 10 madera |
| Nueva oportunidad | 10 oro, 5 comida por habitante solicitado y 10 madera |
| Orgullo de los campesinos | 18 oro |
| Mercaderes del reino | Conserva la prima de 12/18 oro |
| Reconocimiento de lealtad | Conserva 15/20 oro y añade 10 madera |
| Fiesta de la cosecha | 8 oro y 10 comida |

La liquidación existente paga oro/costos y favor una vez. Al resolver se registra el derecho a materiales; se intenta recibirlos en almacenes reales mediante `Inventories.exchange`, sin reabrir reservas iniciales. Solo se descuenta del derecho lo ingresado, en enteros de 1/150. La consulta y recepción del remanente están en Crónicas, incluso cuando su misión abandona el historial de sesenta entradas. Cada ingreso registra `mission-reward` con ID de misión, almacén y balances. El resultado conserva oro recibido, saldo neto, favor efectivo y materiales recibidos; los pendientes se muestran separados. Rechazos y vencimientos no conceden premios de éxito.

El guardado 10 admite estos campos opcionales; cargar términos antiguos no consulta el catálogo nuevo. Se rechazan IDs pendientes duplicados, cantidades fuera de precisión y discrepancias entre premio, recibido y pendiente cuando la misión está en el historial. La compatibilidad de esquemas 1–10 continúa cubierta por las regresiones. No se modifican tarifas, producción, consumo, salarios, crédito, tributos ni derrota; no se introducen transportistas exteriores ni beneficios estratégicos nuevos del favor.

Validación original, antes del hotfix siguiente: 454 pruebas/41 archivos (17 nuevas), build y diff --check correctos; permanece el aviso conocido de tamaño de Phaser. Las simulaciones de crecimiento, economía pequeña, reconocimientos, Corona, diez días de misiones, selección determinista y enfriamientos pasan. La comprobación visual pendiente se realizó durante el hotfix. Sin ramas, commits, push ni publicación.

Hotfix posterior de accesos: antes de cambiar producción se registraron ID, actividad, origen/destino, fase, milisegundos y casilla durante tres ciclos completos. IDs 1/2/3 terminaban a los 6/12/18 s: cada uno pasaba 2 s visible en Loading y 1 s en Unloading. El pool se liberaba; no había operación infinita en esa reproducción. Dibujar sucesivos trabajos interiores sobre la misma calle producía la ilusión, y la interpolación retenía al caminante en el extremo hasta el tick lógico siguiente. `TransportRenderer` ahora solo muestra WalkingToSource/Carrying antes de alcanzar el último punto. No se cambia ningún reloj, fase ni transferencia económica; el mismo filtro sirve a productores, repartidores, compradores, agua e inmigración. Los accesos compartidos sin tramo quedan siempre interiores; la descarga y las reservas terminan por las reglas anteriores. Se elimina el balanceo exterior de manipulación. Las pruebas de pooling y de texturas ahora preparan operaciones caminando para comprobar imágenes realmente necesarias.

Comprobación real con Chrome headless y MapScene/Phaser: granja 3×3, campamento, almacén y mercado 2×2, ocho viviendas y pozo. Se muestrearon 120 s cada 100 ms: 544 IDs, cinco tipos de actividad, máximo 16 sprites visibles, ninguna muestra consecutiva con el mismo ID visible en la misma posición y 47 visitas/llegadas completadas. Cortar el camino ocultó operaciones Blocked; abrir desvío recuperó las cargas sin alterar los totales durante la edición. Pausa estable, escritorio 1280×900, móvil 390×844 y cero excepciones en la ejecución final. La ciudad usa perfil temporal y existencias iniciales de prueba en el libro central; no demuestra el balance de arranque ni constituye una medición de FPS. Harness y trazas permanecen fuera del repositorio; no hay logs nuevos en producción.

Validación final del hotfix: 464 pruebas/41 archivos (10 nuevas) con `npm test -- --maxWorkers=1`, `npm run build` y `git diff --check` correctos. Los timeouts paralelos se reprodujeron antes de modificar el renderizador; las simulaciones largas pasan en serie sin ampliar sus límites. Solo cambian `TransportRenderer`, `tests/{npcLifecycle,citizens,logistics}.test.ts` y estos tres documentos, conservando los cambios locales anteriores. La economía y las recompensas no reciben modificaciones durante este hotfix.

## Etapa 15A-3 — Ciudadanos y ciclo de vida de NPCs (2026-11-09)

Implementada sobre los cambios locales sin confirmar de las etapas anteriores. La revisión inicial ejecutó las 416 pruebas existentes antes de ampliar el modelo. No se crearon ramas, commits, dependencias ni publicaciones.

### Diagnóstico y correcciones verificadas

La representación de Blocked conservaba la última posición, pareciendo una pausa permanente. La reconciliación no invalidaba inmediatamente todas las fases al cambiar caminos; Loading podía quedarse esperando sin personal o sin posibilidad de transferir. Ahora se validan ruta, permisos y empleo, se ocultan las operaciones bloqueadas antes de consultar su posición y se conserva su mercancía/reserva. Los recálculos reconstruyen primero almacenes y después mercados para no validar contra accesos intermedios incompletos ni reiniciar fases válidas.

Carga y descarga tienen duración definida; accesos compartidos con ruta de una sola casilla terminan, las operaciones liquidadas se retiran y el pool pierde sus referencias visuales. El cierre de escena destruye sus imágenes. Las pruebas repiten cien entregas, cortan rutas, recuperan desvíos y comprueban conservación y liberación. Si se elimina la casilla confirmada del personaje, se espera su reconstrucción, sin saltar a otra calle.

### Compras y reservas domésticas

Todas las partidas Session, incluidas las restauradas, habilitan compradores físicos. Distribution conserva el mismo método de consumo y el libro Inventories; su API económica aislada mantiene el modo anterior para pruebas primitivas, sin opción adicional en la interfaz del juego. No existen dos libros de consumo.

Cada hogar habitado puede mantener un inventario home-stock de capacidad 128 recursos. Reordena por debajo de ocho segundos de consumo para cubrir doce, con lotes máximos de 30 y una operación pendiente por hogar/producto. Identifica mercados con stock, autorización, cobertura y personal. La salida WalkingToSource no lleva mercancía: reserva stock del mercado y espacio doméstico; al recoger, mercado → cargamento registra venta e ingreso una sola vez; vuelve por calles y al descargar transfiere cargamento → hogar. Solo hogar → consumidor constituye consumo. Los enteros de 1/150 evitan deriva y las cantidades reservadas no pueden gastarse por otra operación.

La reserva inicial puente se cierra al entregar comida realmente en un hogar; no se reabre al cargar. Los hogares desconectados consumen lo que poseen pero no reciben compras sin ruta. Solicitar demolición detiene nuevos pedidos y protege existencias/compras: esperar las entregas y el consumo y volver a solicitar. Un hogar vacío con stock requiere volver a ocuparse para consumirlo; no se descartan bienes para facilitar la demolición.

### Inmigración y agua

Los cambios positivos de población admitida generan actividades con equipaje desde la entrada del reino. Las partidas sin entrada formal usan un acceso vial válido del centro. Cada actividad registra número real de residentes y destino; los pendientes no superan residentes admitidos y se cancelan si desaparece su vivienda/ocupación. La población se incorpora al aceptar la inmigración, manteniendo empleo, impuestos, consumo y plazas del modelo anterior durante el viaje. La llegada visual no admite población de nuevo. No se generan visitantes al colocar solares.

WaterService expone las asignaciones reales pozo/hogar/habitantes de su cálculo vigente: alcance vial seis, capacidad treinta y empleados sin cambios. Logistics programa visitas por ventanas de diez segundos, una activa por pozo y primero a hogares menos recientemente visitados. Son ciclos auditables del servicio asignado: la cobertura sigue siendo continua, no nace al descargar ni suma un segundo servicio. Se cancelan al perder asignación, actividad o acceso. No hay inventario de agua ni un aguador por residente.

### Arquitectura, guardado y rendimiento

Logistics comparte BFS, accesos, puentes, movimiento, IDs, reloj y rutas compactas entre cargas y actividades. Guardado 10 conserva hogares, recorridos, fases, ventanas y un historial acotado de 128 llegadas/visitas; valida cantidades, destinos, fases y capacidad. Los esquemas 1–9 siguen disponibles sin conceder stock adicional. El inspector muestra reservas domésticas, compras y vecinos en camino.

TransportRenderer reutiliza el pool configurable de 96 imágenes y culling, con poses vacías, comida, madera, equipaje y cubeta. La lógica continúa fuera de cámara y por encima del límite. No hay búsquedas por frame; candidatos de mercado y rutas usan caché invalidada por topología/cobertura. El estrés prueba 400 habitantes en 100×100, cien compras simultáneas y conservación exacta cada segundo. No constituye un benchmark de FPS de todas las ciudades.

No se añadieron retornos vacíos de repartidores o aguadores ni identidades laborales persistentes; al completar liberan su representación y la siguiente actividad parte de su origen. Los compradores sí realizan ida y vuelta. Comercio exterior físico, guardias, milicianos y sonido continúan fuera de alcance.

Archivos de esta etapa: src/economy/{Logistics,Distribution,Economy,Inventories,Storage}.ts; src/map/TransportRenderer.ts; src/persistence/{Session,SaveSlots}.ts; src/simulation/{SettlementSimulation,WaterService}.ts; src/scenes/MapScene.ts; src/ui/SelectionPanel.ts; tests/{citizens,npcLifecycle,economicBalance,footprints,marketLogistics,initialBalance,settlementProgress}.test.ts y los tres documentos vigentes. Se preservan los demás cambios locales anteriores.

Validación final: 437 pruebas/41 archivos, build y diff --check correctos. Precios, tasas de consumo/producción y salarios no cambiaron; el desfase de compras cambia el arranque de caja: balances de tres días 212,38 / 277,42 / 342,46 y recuperación 48,076 / 113,116 / 178,156, con incremento diario estable 65,04. La partida procedural sigue creciendo y sosteniendo veinticuatro habitantes y los reconocimientos existentes.

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

### Etapa 12C. Camino exterior y puentes

- Las partidas nuevas usan `procedural-v2`. Una búsqueda en anchura determinista encuentra una ruta corta desde el Centro de Aldea hasta un borde por tierra firme. Si hace falta, el generador garantiza un corredor seco hacia el norte. Los obstáculos removibles del trazado se despejan al generar el mundo.
- El camino del reino tiene segmentos protegidos, una entrada identificable y conexión a la red vial. La generación y el mantenimiento de sus segmentos son gratuitos. La entrada queda disponible como dato para futuras etapas.
- En **Caminos → Puente de madera**, selecciona un camino conectado en la orilla y una casilla de río en línea recta. El inspector muestra el tramo y el costo total antes de confirmar. Se admiten hasta 8 casillas de agua y cuesta 15 oro y 10 madera por casilla. El tablero conecta solo por sus extremos y conserva el río.
- **Demoler** retira el tramo completo por 5 oro por casilla. Si era el único acceso, se interrumpen las conexiones. El guardado conserva el recorrido, la entrada y los puentes. Los mapas anteriores mantienen sus construcciones y siguen sin camino exterior.

### Etapa 13B. Rebalance económico y empleo

Las ventas municipales pasan de 1 oro por unidad a importes de 0,10 por comida y 0,20 por madera efectivamente entregadas. Se mantiene el volumen de producción y consumo. La reserva inicial, los traslados y la demanda sin atender quedan fuera de las ventas. Los impuestos conservan su base y sus políticas de 5 %, 10 % y 20 %.

| Tarifa | Antes | Ahora |
| --- | ---: | ---: |
| Comida, oro por unidad vendida | 1,00 | 0,10 |
| Madera, oro por unidad vendida | 1,00 | 0,20 |
| Salario, oro/h por empleado | 0,10 | 0,40 |
| Mantenimiento de solar, oro/h | 0,01 | 0,02 |
| Mantenimiento de granja, oro/h | 0,05 | 0,25 |
| Mantenimiento de campamento, oro/h | 0,05 | 0,20 |
| Mantenimiento de almacén, oro/h | 0,08 | 0,35 |
| Mantenimiento de mercado, oro/h | 0,08 | 0,30 |
| Mantenimiento de pozo, oro/h | 0,05 | 0,15 |
| Mantenimiento de camino normal, oro/h | 0,01 | 0,01 |
| Centro de Aldea, camino del reino y puentes, oro/h | 0 | 0 |

- Se asigna un primer puesto a cada negocio elegible antes de cubrir puestos adicionales. Se usa el personal libre y, si falta, se toma de los equipos más numerosos sin vaciar al donante. En escasez rigen primero los servicios esenciales, incluida la cobertura de mercados por zona. Se conservan los puestos ya cubiertos cuando las prioridades lo permiten y se llenan los puestos adicionales libres por prioridad y coordenadas.
- Un mercado con ambas ventas deshabilitadas queda sin personal. Un almacén vacío que esté en vaciado o tenga cerradas ambas entradas queda sin personal. Los productores conservan la posibilidad de trabajar cuando se resuelve un bloqueo temporal de almacenamiento.
- Con dos trabajadores, el cambio de producción a venta requiere el doble del colchón alimentario que activa el retorno a producción. Se cuentan las existencias de los mercados útiles aunque estén sin personal, de modo que trasladar a un empleado no cambie las existencias contabilizadas.
- Las partidas anteriores conservan tesorería, historial y gastos ya devengados. La carga verifica la elegibilidad y la cobertura de puestos con la configuración real de los edificios. Finanzas extrapola las ventas del último segundo simulado y muestra las tasas por hora del juego.

### Etapa 13C. Urbanismo y belleza residencial

| Construcción nueva | Huella | Costo de decoración | Mantenimiento de decoración por hora |
| --- | --- | --- | --- |
| Solar residencial, pozo, Centro de Aldea y camino | 1 × 1 | — | — |
| Campamento maderero, almacén y mercado | 2 × 2 | — | — |
| Granja | 3 × 3 | — | — |
| Jardín | 1 × 1 | 40 oro | 0,50 oro |
| Parque | 3 × 3 | 150 oro | 2 oro |
| Plaza con fuente | 2 × 2 | 300 oro | 4 oro |
| Puente de madera | Una casilla por segmento | — | — |

- Cada edificio se cobra y opera una vez, con un anclaje y conexión desde cualquiera de sus bordes. Cualquier casilla selecciona la huella completa. Los edificios y sus miniaturas usan los mismos SVG locales provisionales. Las cuatro viviendas conservan su arte.
- La belleza parte de 15 y llega hasta 100. Se mide la distancia ortogonal desde la casilla más cercana de cada huella. Con acceso vial en la vivienda y la decoración, el jardín aporta hasta 25 en 3 casillas, el parque hasta 35 en 6 y la plaza hasta 40 en 5. El aporte disminuye con la distancia y se toma el mayor por cada tipo.
- La decoración tiene un costo fijo de mantenimiento, emplea a cero trabajadores y aporta cero producción. Los pozos siguen siendo la fuente del abastecimiento de agua. Las tres decoraciones están disponibles desde el inicio de la partida.
- Las casas de nivel 3 y 4 requieren 35 y 65 de belleza respectivamente, además del abastecimiento, la felicidad y el empleo para evolucionar. Mejorar o deteriorarse toma 60 segundos simulados. Necesidades muestra la media de los hogares habitados.
- Selecciona un camino normal, elige **Mejorar** y confirma. Tierra a grava cuesta 6 oro y 2 madera. Grava a piedra cuesta 15 oro y 4 madera. El mejor tramo conectado a dos casillas o menos aporta 5 o 10 puntos respectivamente. Cada tramo conserva la red, y el camino del reino y los puentes conservan sus reglas.
- Las partidas de esquema 1 cargan sus edificios compactos de 1 × 1 y sus caminos de tierra. El esquema 2 registra huellas grandes y superficies mejoradas. La belleza se deriva de esos datos y de la red vial al cargar.

### Etapa 14A. Reconocimiento del asentamiento y Crónicas

| Rango | Habitantes | Felicidad | Belleza residencial | Pago único | Desbloqueos | Capítulo |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Aldea | — | — | — | — | Centro, solares, tierra, puentes, granjas, campamentos madereros, almacenes, mercados, pozos y jardines | I · Una tierra por construir |
| Pueblo | 24 | 50 | 30 | 500 oro | Parques, Casa de Comercio y mejora de tierra a grava | II · El nacimiento de un pueblo |
| Villa | 60 | 65 | 55 | 800 oro | Plazas con fuente y mejora de grava a piedra | III · Una villa digna de la Corona |

- En **Crónicas** se solicita el siguiente reconocimiento. El botón se habilita cuando se cumplen los cuatro objetivos. El pago queda en **Historial** y la fecha del reconocimiento, en **Crónicas**. Las mejoras de camino se hacen en el inspector del tramo.
- La belleza es el promedio por vivienda habitada. Parte de 15. Un jardín conectado a dos casillas da 17 puntos, suficiente para superar 30. Una casa a dos casillas de un jardín y un parque conectados, con grava cerca, suma 66 puntos. Se pueden cumplir ambos objetivos antes de desbloquear el rango correspondiente. Los umbrales y costos se centralizan en `SettlementProgress`.
- La prueba de crecimiento parte de 150 oro, 50 madera y la reserva alimentaria habitual, construye con los costos reales y espera inmigración e ingresos de la simulación. Los almacenes y mercados dedicados a comida ayudan a evitar que la madera agote el espacio. Conviene reservar el costo del reconocimiento antes de asumir el mantenimiento de más parques.
- Una partida nueva ofrece el capítulo I. Los reconocimientos abren los capítulos II y III. **Continuar** y **Atrás** recorren las escenas. **Omitir capítulo** cierra la escena. Al terminar el relato se puede elegir **Ver tutorial** u **Omitir tutorial**. Ambos recorridos se pueden abrir por separado en **Crónicas**.
- **Escuchar** activa la voz disponible en español. Después puedes repetirla, pausarla, reanudarla o detenerla. **Silenciar voz** guarda la preferencia en el navegador. El texto está siempre disponible. El diálogo congela el reloj mientras está abierto y recupera el modo y la velocidad anteriores al cerrar.
- El esquema 3 añade la progresión. Los guardados de los esquemas 1 y 2 empiezan en Aldea y conservan sus viviendas, edificios, caminos y recursos. Los capítulos quedan disponibles para consulta. Solo una partida recién creada abre automáticamente la introducción. Villa es el máximo de esta etapa.

### Corrección del balance inicial

| Regla | Antes | Ahora |
| --- | --- | --- |
| Producción de granja | 12,5 comida/h por trabajador, hasta 50 con cuatro | 16 comida/h por trabajador, hasta 64 con cuatro |
| Consumo residencial | 2,5 comida/h por habitante | 2,5 comida/h por habitante |
| Campamento maderero con 1, 2 o 3 trabajadores | 16,67 / 33,33 / 50 madera/h | 14 / 22 / 30 madera/h |
| Pozo con aguador | 20 habitantes, hasta 6 tramos viales | 30 habitantes, hasta 6 tramos viales |
| Mercado mixto | La madera podía ocupar las 100 unidades | Hasta 50 de madera en la reposición. La venta dedicada de madera puede usar las 100 unidades |
| Reposición | Cada 5 segundos simulados | Ciclo de 5 segundos y reposición puntual de comida si una vivienda cubierta queda corta |

- La granja deposita lotes de producción en almacenes operativos con recepción autorizada. La comida sigue pasando por un mercado atendido dentro del alcance vial. La reposición puntual mueve hasta lo necesario para cubrir la entrega actual, aunque solo alcance para cubrir una parte. Cada movimiento descuenta el origen y queda auditado. El espacio compartido de los almacenes sigue siendo de 300 unidades. La producción de madera reserva 30 para comida en los almacenes mixtos y la de comida reserva 30 para madera cuando hay un campamento operativo en la red.
- A 22 habitantes, 55 comida/h excedían la producción máxima anterior. El cupo de agua de 20 daba una cobertura máxima del 90,91 % con un pozo. El corte de atractivo venía de la reserva alimentaria instantánea, no de la cobertura de agua. Ahora, con una reserva corta, el atractivo también considera la cobertura alimentaria de hasta una hora del juego. Con al menos 90 % se admite hasta una persona si hay comida real en mercados para un segundo simulado de todos los residentes y la nueva llegada. La cobertura del 50 % o menos sin reserva suficiente bloquea las llegadas.
- La admisión regular usa la capacidad máxima de las granjas conectadas como límite de crecimiento. Una granja cubre hasta 25 habitantes con cuatro empleados. Si hay poca comida y una ruta de abastecimiento, se cubre la producción necesaria con empleados de puestos excedentes o del campamento antes de perder el servicio de un mercado, un almacén o un pozo.
- El campamento requiere árboles o bosque a un máximo de seis casillas ortogonales desde su huella. El menú avisa al seleccionar el campamento y el juego rechaza la ubicación sin cobrar si queda fuera de alcance. Los rodales se aprovechan de forma renovable mientras estén en el mapa. Limpiar el último rodal cercano detiene la producción. Las partidas nuevas incluyen arbolado cerca del área despejada. Al cargar mapas antiguos de pasto sin datos de terreno se añaden árboles en casillas libres cerca del centro y de campamentos que los necesiten. El terreno guardado conserva las talas.

### Etapa 14B. La Corona

| Rango al emitir el tributo | Importe | Frecuencia |
| --- | ---: | --- |
| Aldea | 50 oro | Cada 3 días completos |
| Pueblo | 150 oro | Cada 3 días completos |
| Villa | 350 oro | Cada 3 días completos |

- El primer decreto y la primera obligación se emiten al comienzo del día 4. El primer vencimiento cae al comienzo del día 7. Al vencer cada período se emite el siguiente tributo con el rango vigente en ese instante. El importe anunciado queda fijo. El calendario avanza con el reloj simulado y conserva la pausa y la velocidad de la partida.
- En **Crónicas → La Corona**, paga antes del vencimiento para ganar 5 de favor y reiniciar la racha de impagos. El favor empieza en 50 y se limita a 0–100. Los impagos consecutivos restan 15, 20 y 25. El tercero termina el gobierno. El tributo vencido queda en el historial y la siguiente obligación tiene su propio plazo.
- Las ofrendas de 50, 100 y 200 oro mejoran el favor hasta en 5, 12 y 25 puntos. La confirmación muestra la mejora efectiva y vincula el pago al favor cotizado. El tributo mantiene su estado al hacer una ofrenda.
- La tesorería admite gastos de construcción y pagos reales hasta −200 oro. La deuda con el rey es el valor absoluto del saldo negativo y los ingresos la amortizan al entrar. Los reconocimientos conservan el requisito de oro en caja de 14A.
- Salarios y mantenimiento también usan el crédito disponible. Los importes que exceden el límite quedan pendientes por separado. Al cierre de hora, las ventas y los impuestos se reflejan primero en el saldo. Luego se liquidan salarios pendientes con saldo positivo, salarios de la hora, mantenimiento pendiente con saldo positivo y mantenimiento de la hora. Los importes nuevos pueden usar el crédito restante. Los impagos históricos anteriores a 14B conservan su carácter informativo.
- Finanzas separa los tributos y ofrendas acumulados de las tasas operativas. Historial registra ambos como gastos. El decreto y la destitución reutilizan el diálogo narrativo y **Escuchar** usa la voz española disponible. Desde la destitución se puede abrir **Partida** para cargar o iniciar otra.
- El esquema 4 guarda la Corona, el saldo firmado y los gastos pendientes. Las partidas anteriores reciben favor 50 y una primera emisión tres días simulados después de su fecha guardada. La emisión, el pago y el estado del decreto sobreviven a la recarga. Tras la derrota se conserva la última ranura de autoguardado.

### Ajuste 14B. La ira del rey

- Llegar a favor real 0 abre un plazo de 24 horas del juego. La última advertencia usa el diálogo de decretos y una advertencia persistente muestra el tiempo restante y permite acceder a las ofrendas y al pago del tributo.
- Recuperar al menos un punto antes del vencimiento cancela el plazo y registra la confianza recuperada. Una caída posterior a cero inicia otras 24 horas completas. Se mantienen las tarifas y las mejoras de favor vigentes.
- Agotar el plazo causa **Destitución por pérdida de confianza real**. La derrota por tres impagos consecutivos sigue vigente. La Corona registra una única derrota con motivo y fecha. Ambas condiciones congelan la simulación y bloquean obras, demoliciones, mejoras, pagos, impuestos, configuración de productos y comercio.
- El capítulo final **El rey ya no os quiere** se puede omitir y consultar después desde el resumen de la partida terminada. Solo se puede empezar otra partida, cargar un guardado jugable o consultar el estado final. Las ranuras anteriores se conservan.
- Todas las escenas narrativas intentan iniciar la voz española automáticamente. Los controles permiten pausa, repetición y silencio persistente. Cambiar de página o cerrar la escena cancela la voz previa. Si la voz llega tarde se intenta al recibir el catálogo. Si el navegador bloquea la reproducción, el texto y el botón manual siguen disponibles.
- El reloj compartido respeta pausa, velocidades, suspensión narrativa y cierre del juego. El esquema 6 guarda inicio, vencimiento, estado del aviso y derrota. Una partida anterior con favor cero recibe un día completo desde su fecha guardada. Las recargas posteriores conservan ese vencimiento. También se conserva una derrota que coincida con la salida pendiente de un viaje comercial.

### Corrección de inmigración y emigración

- La inmigración normal conserva la lista de espera, el atractivo y la previsión de comida por vivienda. Se evalúa cada cinco segundos simulados. La disponibilidad real de plazas conectadas y las reglas de readmisión del bienestar determinan si se puede aceptar a quienes esperan. El atractivo puede ser positivo mientras las reservas disponibles impiden una admisión normal.
- Si la admisión normal está cerrada, una Aldea con menos de 12 habitantes, Centro de Aldea y una plaza conectada puede acoger a un viajero en la siguiente oportunidad del calendario. Las oportunidades ocurren cada ocho horas del juego, a las 08:00, 16:00 y 00:00. Cada una admite como máximo una persona. Las oportunidades que pasan se descartan.
- El viajero ocupa una plaza normal, consume suministros y cuenta para el empleo con la participación habitual del 50 %. Su llegada reinicia los contadores de descontento sostenido y deterioro en su vivienda. La felicidad y las condiciones de suministro siguen determinando si permanece. Con hambre prolongada, la vivienda puede perder residentes al volver a alcanzar los umbrales vigentes.
- **Necesidades** distingue las admisiones normales, las ocasionales y las cerradas, con su motivo. **Historial** registra las llegadas ocasionales junto a las salidas. **Voces de la aldea** puede comentar una llegada con su cadencia habitual.
- El guardado conserva las llegadas y el reloj. La fase del intervalo se obtiene del tiempo simulado guardado, también en partidas anteriores. El reloj compartido respeta pausa, velocidades y derrota.

### Etapa 14C. Comercio exterior

La Casa de Comercio ocupa 2 × 2 casillas, se desbloquea en Pueblo y cuesta 100 oro y 25 madera. Tiene dos puestos, paga los salarios habituales y añade 0,45 oro/h de mantenimiento. El reconocimiento de Villa cuesta 800 oro y conserva sus otros requisitos.

| Producto | Venta por unidad | Compra por unidad | Reserva y objetivo iniciales |
| --- | ---: | ---: | ---: |
| Comida | 0,32 oro | 0,65 oro | 150 unidades |
| Madera | 0,48 oro | 0,90 oro | 30 unidades |

Con dos empleados, la casa cuesta 1,25 oro/h entre salarios y mantenimiento. Un viaje lleno de comida ingresa 19,20 oro y uno lleno de madera ingresa 28,80 oro, antes del costo de producir, almacenar y abastecer a los vecinos.

- La casa y los almacenes comerciales deben estar conectados al Centro de Aldea y a la entrada exterior por una ruta continua de caminos o puentes. El Centro conecta servicios municipales, pero no sirve de tramo vial para los viajes. Los mapas anteriores sin entrada exterior pueden seguir cargándose.
- Cada casa tiene una oportunidad cada seis horas simuladas. La carga total de exportación e importación es de 30 unidades por trabajador, hasta 60. Se calculan primero las ventas y luego las compras, en orden de comida y madera. Las oportunidades que pasan sin ruta, personal o carga disponible se descartan.
- Cada producto arranca desactivado y se configura para exportar, importar o quedar inactivo. Las exportaciones usan existencias autorizadas para despacho de almacenes operativos. Se aplica el mayor mínimo de las casas exportadoras activas y los objetivos de las importadoras de esa red. El inspector avisa si el mínimo efectivo cubre menos de dos horas de demanda estimada. Las importaciones respetan objetivo, espacio compartido y aceptación del almacén.
- Las reservas iniciales especiales y las existencias de viviendas y mercados quedan fuera. El libro de inventarios valida el manifiesto completo antes de liquidarlo con la tesorería. Las casas se procesan en orden estable contra las existencias ya actualizadas, por lo que cada unidad se mueve una sola vez. Las ventas reducen la deuda y las compras respetan el límite de crédito de la Corona.
- **Comercio** muestra las casas, sus próximas oportunidades y los últimos 60 viajes con mercancías. El inspector permite configurar cada producto. **Finanzas** muestra ingresos, gastos y neto realizados por separado del balance operativo estimado. El esquema de guardado 5 conserva ajustes, fase, transacciones y acumulados. El tutorial de Pueblo se puede omitir.

### Etapa 14D. Crónicas del Reino

El catálogo central de acontecimientos se encuentra en `src/story/KingdomEventCatalog.ts`. El motor `KingdomEvents` observa la ciudad y resuelve las misiones mediante la economía y la Corona existentes. El panel de Crónicas presenta las ofertas, el progreso, los resultados y las decisiones. Los relatos y sus decisiones usan el diálogo narrativo y su voz automática.

| Acontecimiento | Requisitos y objetivo | Recompensa |
| --- | --- | --- |
| La guerra del rey | Reservar el tributo antes de calcular el presupuesto. Solicita el 12–15 % del disponible, con mínimo 10 y máximos de 30, 65 o 100 oro según rango. | Hasta 5 favor |
| Hambruna en el norte | Granja y comida de almacén superior a dos horas de demanda más 30. Solicita la mitad del excedente, hasta 40 o 50 unidades. | Hasta 6 favor |
| El invierno se acerca | Campamento y 45 de madera autorizada. Solicita hasta 25 o 35 unidades y como máximo la mitad de las existencias. | 0,55 oro por unidad, redondeado hacia abajo, y hasta 3 favor |
| La visita del monarca | Felicidad ≥60, belleza ≥20 y comida y agua ≥90 %. Exige 4 o 5 horas consecutivas con esas condiciones. Conserva como mínimo la belleza inicial menos 3 puntos. | Hasta 7 favor |
| Un pueblo digno de admiración | Desde Pueblo, recursos para mejorar 2 o 3 tramos propios. Villa puede recibir objetivos de piedra si dispone de caminos de grava y presupuesto. | Hasta 5 favor |
| El capricho de la Corona | Presupuesto y espacio junto a caminos para un jardín, parque o plaza desbloqueados. Exige una decoración nueva y conectada. | Hasta 3 favor por jardín o 6 por parque o plaza |
| Una nueva oportunidad | Plazas residenciales libres y buen abastecimiento. Pide 2 o 4 habitantes nuevos desde la aceptación y dos horas de bienestar después de recibirlos. | Hasta 5 favor |
| El orgullo de los campesinos | Mercado, pozo y felicidad ≥60. Exige 4 o 6 horas consecutivas con felicidad ≥70 y comida y agua ≥90 %. | Hasta 5 favor |
| Los mercaderes del reino | Casa de Comercio operativa, almacén accesible al exterior y producción disponible. Pide exportar 40 o 60 unidades de un producto desde la aceptación. | Prima de 12 o 18 oro, además de las ventas reales |
| La Corona reconoce tu lealtad | Favor ≥70, tributo pagado en los últimos tres días, felicidad ≥65 y abastecimiento estable. | 15 o 20 oro y hasta 2 favor |
| La fiesta de la cosecha | Mercado y servicios cubiertos. Exige 2 o 3 horas consecutivas con felicidad ≥60 y comida y agua ≥90 %. | Hasta 2 favor |

Cada acontecimiento tiene dos relatos y variantes de objetivo. La primera oportunidad llega a las 24 horas simuladas. Las siguientes se programan entre 24 y 48 horas mediante un generador determinista inicializado con la semilla del mundo. El estado del generador, la siguiente fecha, el último tipo y los enfriamientos se guardan. Un mismo tipo espera 96 horas, la visita y el capricho 120 y la lealtad 144. No se repite inmediatamente el mismo tipo. Si no hay oferta apta, se revisa seis horas después.

Solo puede existir una misión disponible o activa. Las ofertas duran 48 horas desde su aparición y aceptar no amplía el plazo. Una misión pendiente pospone las nuevas. Después de resolverla hay al menos seis horas de descanso. Se excluyen las peticiones exigentes durante una advertencia de destitución, en las últimas 24 horas de un tributo sin pagar y en las seis horas anteriores a una emisión.

Todas las peticiones son voluntarias. Omitir el relato mantiene la respuesta pendiente y **Decidir más tarde** conserva la oferta. La guerra y las dos ayudas materiales restan hasta 2 de favor al rechazarse y hasta 3 si se aceptan y después vencen. Las demás carecen de penalización. Dejar vencer una oferta sin aceptarla tiene consecuencia cero.

Las contribuciones opcionales de oro usan saldo positivo. Las entregas usan existencias reales de almacenes operativos conectados y autorizados para despacho. Las reservas especiales, los hogares y los mercados quedan fuera. Se valida la entrega completa y su liquidación antes de mover mercancías u oro. Las recompensas pueden amortizar deuda. Los cambios de favor pasan por la Corona y pueden iniciar o cancelar su plazo de destitución.

La aceptación fija el punto inicial del crecimiento, de las obras y de las exportaciones. Reconectar obras antiguas no produce progreso nuevo. Un segundo que incumple el bienestar reinicia el periodo continuo. Las misiones de mercaderes observan los contadores acumulados de exportación, sin volver a retirar ni vender la carga. Los estados terminales entregan las recompensas una sola vez y conservan el resultado efectivo, incluido el límite de 100 de favor.

El esquema 7 guarda misiones, decisiones, resultados, plazos, generador y contadores de carga exportada. Los esquemas anteriores mantienen su ciudad y reciben la primera oportunidad un día después del tiempo guardado. El historial conserva los últimos 60 resultados y los enfriamientos se mantienen por separado. Las referencias a obras anteriores se eliminan al resolver cada misión para limitar el tamaño del guardado.

Las simulaciones de diez días con semillas 23, 24 y 1023 completaron 7, 7 y 6 misiones, con recompensas totales de 27, 33 y 0 oro. Cada pueblo mantuvo 48 habitantes. La comparación sin aceptar misiones también conservó su crecimiento. La tabla completa está en `docs/PRUEBAS_AUTOMATIZADAS.md`.

### Funcionalidad futura reservada: evolución visual de la ciudad

**Prioridad:** después de finalizar, probar y publicar el MVP funcional (etapas 06–11), **no antes**. Es una expansión planificada, no un requisito inmediato ni una orden de implementación automática. Dividir en tareas pequeñas independientes:

| ID futuro | Función | Regla propuesta |
|---|---|---|
| F01 | Prosperidad y servicios | Calcular por vivienda una puntuación basada en acceso por caminos, abastecimiento, mercado, seguridad y otros servicios; ajustar las reglas tras probar la economía. |
| F02 | Evolución visual ampliada de viviendas | 10B cubre los cuatro niveles residenciales. Los efectos visuales adicionales forman parte del pulido futuro. |
| F03 | Mejoras de calles | 13C cubre tierra, grava y piedra con uniones automáticas. Un nivel adicional queda reservado para una etapa futura. |
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

## Etapa 15A-1 — Logística física de productores

Implementada sobre las etapas locales 14A–14D, conservando sus cambios sin confirmar. Solo se sustituyó el despacho automático de granjas y campamentos hacia almacenes. Distribución desde almacenes a mercados, ventas, comercio exterior, misiones, salarios, impuestos, Corona y progresión mantienen sus reglas.

`Economy.advance` genera los lotes con las tasas laborales existentes y los entrega a `Storage.queueProduction`. `Logistics` mantiene operaciones independientes de Phaser: ID, transportista, productor, almacén, producto, unidades, capacidad, ruta, casilla confirmada, progreso de tramo, fase y fechas simuladas. Loading acumula mercancía en el productor; Carrying representa su custodia por el transportista; Unloading liquida la entrega; Blocked conserva la carga. Al terminar se retiran operación e inventario vacío; el historial conserva la entrega fechada. No hay NPC por unidad ni retorno ficticio con efecto económico.

Invariantes:

- Cada carga existe una sola vez en `Inventories`, identificada por su operación. Producción crea cantidades enteras de 1/150 con su auditoría. La recogida cambia su custodia lógica y registra el traslado; la descarga usa la transferencia central y retira únicamente el inventario vacío. `depositProduction` sigue como operación inmediata explícita de preparación de existencias usada por pruebas anteriores; el ciclo productivo del juego utiliza exclusivamente `queueProduction`.
- Totales globales = reservas iniciales + almacenes + mercados + cargas pendientes/en tránsito. Las cargas quedan excluidas de consumo, ventas, construcción y exportaciones hasta descargar.
- Las reservas se descuentan del espacio libre para todos los movimientos de entrada, incluidos vaciado e importaciones. La descarga libera solo su reserva, transfiere atómicamente y la recupera si falla. No cambia las capacidades generales ni la reserva de espacio por producto.
- Sin ruta, permisos, personal, espacio o cupo logístico se detiene la producción correspondiente. La espera se limita a ocho operaciones por productor, cada una con capacidad de 12 recursos. Los cargamentos se agrupan durante dos segundos simulados y pueden salir parciales; no esperan llenar la capacidad.
- Una entrega bloqueada conserva la mercancía y su reserva. Recuperar permisos, empleados o conexión permite reintentarla. Una carga ya recogida puede terminar aunque su productor pierda el acceso. Si se elimina la propia casilla ocupada, permanece bloqueada hasta reconstruirla; nunca salta a otra calle.
- Solicitar demolición detiene nuevos despachos del productor o al almacén solicitado, informa el motivo y protege ambos extremos mientras existan operaciones. Cuando terminen, se puede solicitar otra vez. Cancelar el modo reactiva despachos. Un almacén con existencias sigue necesitando el vaciado habitual.

Rutas: BFS multiorigen desde todo el perímetro hacia todo el perímetro de destino; elige el par de accesos más corto sin usar edificios ni el Centro de Aldea como atajos. Solo camina por tierra, grava, piedra y puentes válidos por ambos sentidos de cada enlace. La caché acotada se invalida con una firma determinista de topología, independiente de los recálculos laborales y estable al cargar. Los cortes se resuelven desde la casilla confirmada con ruta alternativa o bloqueo seguro. No hay búsqueda por frame.

Phaser: cuatro texturas medievales generadas por código (comida/madera y dos poses), pool por escena, máximo configurable de 96 imágenes y culling antes de crear/actualizar imágenes. Un único recorrido visual interpola el reloj confirmado y su fracción; pausa, velocidades y suspensión reutilizan el reloj existente. La cámara y el límite visual no gobiernan entregas. El inspector muestra pendiente de recogida, carga en tránsito, bloqueos y capacidad reservada.

Guardado 8: rutas compartidas codificadas como enteros, operaciones activas, custodia, tiempos de fase, progreso y detención para demoler. Las reservas se reconstruyen a partir de cargas validadas contra el inventario central. Se rechazan cantidades incompatibles, IDs duplicados, fases imposibles, exceso de cupos/reservas y rutas inválidas para la topología guardada. Los esquemas 1–7 sin logística arrancan sin operaciones, conservando sus existencias. La codificación conserva coordenadas al ampliar mapas de 20×20.

Balance: no se modificaron precios, empleo, tasas ni progresión. La aldea abastecida del ensayo de tres días termina con 213,844 / 278,884 / 343,924 oro: la demora inicial de ventas explica la diferencia respecto al ensayo anterior. El escenario con siete habitantes puede recuperar inmigración normal con cargamentos parciales, sin esperar una llegada ocasional. Las simulaciones existentes de crecimiento nuevo, Corona, comercio y misiones siguen verificándose.

Pendiente para 15A-2: transportistas de mercados y comercio exterior, retorno/reutilización de identidades y políticas de reasignación/devolución a otro almacén para cargas bloqueadas. Esta entrega no agrega compradores, aguadores ni unidades militares.
Archivos de 15A-1 (además de los cambios locales preexistentes):

- Nuevos: `src/economy/Logistics.ts`, `src/map/LogisticsRoutes.ts`, `src/map/TransportRenderer.ts`, `tests/logistics.test.ts`.
- Integración: `src/economy/Economy.ts`, `src/economy/Inventories.ts`, `src/economy/Storage.ts`, `src/map/RoadConnections.ts`, `src/persistence/SaveSlots.ts`, `src/scenes/MapScene.ts`, `src/simulation/SettlementSimulation.ts`, `src/ui/SelectionPanel.ts`, `src/ui/SimulationPanel.ts`.
- Regresiones adaptadas: `tests/distribution.test.ts`, `tests/economicBalance.test.ts`, `tests/economicRecovery.test.ts`, `tests/economy.test.ts`, `tests/employmentRebalance.test.ts`, `tests/footprints.test.ts`, `tests/occasionalMigration.test.ts`, `tests/productConfiguration.test.ts`, `tests/simulationAudit.test.ts`, `tests/storage.test.ts`, `tests/taxesAndWood.test.ts`.
- Documentación: `docs/ESTADO.md`, `docs/Plan.md`, `docs/PRUEBAS_AUTOMATIZADAS.md`.
## Etapa 15A-2 — Reparto de almacenes y vaciado físico

Se amplía `Logistics` con `warehouse-to-market` y `warehouse-to-warehouse`, junto al tipo productivo anterior. Se reutilizan el mismo BFS, caché, accesos multicelda, orientación de puentes, estados, reloj, pool y culling; no hay otro sistema de NPCs ni inventarios. Los repartidores comienzan en el acceso del almacén, siguiendo el diseño de 15A-1. No se agregan recorridos vacíos de aproximación o retorno.

El pedido reserva una cantidad entera en el almacén y capacidad compartida en el destino, creando un inventario central de tránsito vacío. La mercancía sigue físicamente en el origen hasta completar la carga. `Inventories.snapshot.available` descuenta la reserva de salida; transferencias, gasto de madera, intercambios y entregas de misiones no pueden consumirla. En la recogida se libera únicamente esa reserva y se transfiere atómicamente al cargamento; si falla, se restaura la reserva. Al llegar y terminar de descargar, se libera su reserva de destino y se ejecuta otra transferencia central. Un fallo conserva mercancía y reservas. Ni la reserva de un pedido ni la creación de un inventario de tránsito producen recursos ni ingresos.

Contabilidad: antes de recoger, las existencias se cuentan una vez en el almacén y el cargamento está vacío; después, se cuentan una vez en tránsito. Solo al descargar forman parte del inventario disponible de mercado o almacén. Cada recogida y descarga tiene una transferencia auditada; no se registra producción adicional ni se repite la entrega. La operación termina retirando solamente el inventario vacío. La autorización de envío y el personal de origen se comprueban al recoger; el destino exige personal, recepción autorizada y conexión al entregar. Cambiar permisos después de la recogida no devuelve mágicamente mercancía al origen.

Abastecimiento: se conserva el intervalo de cinco segundos y el orden de prioridades existente. El espacio libre incluye todos los pedidos ya reservados. La cuota de madera de un mercado mixto considera madera almacenada y en camino. La antigua reposición instantánea de emergencia también solicita transporte: solicita una reserva de cinco recursos (o la demanda si es mayor), admite cargas parciales y espera si ya hay comida en camino, evitando pedidos por cada vivienda o venta. Se permiten cargas parciales cuando falta suministro. Los pedidos sucesivos usan únicamente existencias sin reservar.

Parámetros exclusivos del reparto: capacidad de 30 recursos y carga de un segundo simulado; descarga de un segundo y 350 ms por tramo, compartidos con la arquitectura previa. Se mantiene el máximo de ocho operaciones por origen, el pool visual de 96 imágenes y el límite de capacidad económica de los edificios. Las cargas productivas conservan capacidad 12 y agrupación de dos segundos. Hay un pequeño desplazamiento visual estable por ID dentro de la calle para distinguir repartidores superpuestos; no modifica posición económica ni fecha de entrega.

Vaciado: `Storage.advanceDrain` solicita los mismos transportes hacia almacenes operativos, autorizados y no configurados para vaciarse. No intercambia recursos entre dos almacenes en vaciado. El origen conserva las existencias reservadas hasta recogerlas y no se considera demolible mientras queden operaciones propias o entregas pendientes. Solicitar su demolición frena nuevas entradas, pero permite despachar lo existente hacia mercados o completar el vaciado. Cancelar modo restaura las entradas. Si falta ruta o autorización, hay que recuperar los requisitos antes de poder terminar y demoler.

Guardado 9: mantiene rutas compactas compartidas y reconstruye ambas reservas desde operaciones activas. Se valida la cantidad de cada cargamento según haya ocurrido la recogida, el stock reservado de origen, la capacidad de destino, el tipo de los edificios y las fases y rutas. El esquema 8 de 15A-1 restaura exactamente sus operaciones productivas; los anteriores conservan los valores por defecto existentes. No hay tiempo acumulado de pestaña suspendida ni liquidación por parte de sprites.

Balance comprobado: la partida procedural nueva continúa creciendo a 24 habitantes y sosteniendo su población con una granja, mercado, pozo y reparto real. El escenario abastecido de tres días conserva el incremento diario de 65,04 oro y termina con 212,728 / 277,768 / 342,808 oro; la demora inicial explica el desplazamiento respecto a 15A-1. La recuperación endeudada termina con 48,40 / 113,44 / 178,48. No cambian producción, consumo, precios, salarios, impuestos ni requisitos de progresión. Las simulaciones de comercio y misiones siguen pasando. En el escenario importador, el nuevo calendario de recepción/consumo da 136,26 oro de compras, 21 horas muestreadas con cobertura de madera y 9,38 oro final, sin alterar tarifas.

Limitaciones heredadas: las cargas bloqueadas mantienen su destino y reservas hasta recuperar el acceso, personal o permisos; no hay reasignación ni devolución automática. Si se retira la casilla exacta ocupada, debe reconstruirse antes de continuar. El comercio exterior físico, los retornos y las identidades reutilizables de transportistas quedan para etapas posteriores. No se agregan compradores, inmigrantes visibles, agua física, unidades militares, industrias ni audio.

Archivos de esta entrega, preservando los cambios locales previos:

- Integración: `src/economy/Logistics.ts`, `src/economy/Inventories.ts`, `src/economy/Storage.ts`, `src/economy/Distribution.ts`, `src/economy/Economy.ts`, `src/economy/ExternalTrade.ts`, `src/persistence/SaveSlots.ts`, `src/map/TransportRenderer.ts`, `src/ui/SelectionPanel.ts`.
- Nuevos: `tests/marketLogistics.test.ts` y `tests/fixtures/logistics.ts`.
- Regresiones adaptadas: `tests/bridges.test.ts`, `tests/constructionCosts.test.ts`, `tests/distribution.test.ts`, `tests/economicBalance.test.ts`, `tests/economicRecovery.test.ts`, `tests/externalTrade.test.ts`, `tests/footprints.test.ts`, `tests/initialBalance.test.ts`, `tests/kingdomEvents.test.ts`, `tests/productConfiguration.test.ts`, `tests/simulationAudit.test.ts`, `tests/storage.test.ts`, `tests/taxesAndWood.test.ts`.
- Documentación: `docs/ESTADO.md`, `docs/Plan.md` y `docs/PRUEBAS_AUTOMATIZADAS.md`.
