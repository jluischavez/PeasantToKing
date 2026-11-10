# Pruebas automatizadas de Peasant to King

## Etapa 15A-4 — Verificación del 10 de noviembre de 2026

Base antes de modificar: 437 pruebas aprobadas en 41 archivos.

Resultado original, antes del hotfix: `npm test` aprobó **454 pruebas en 41 archivos**, 17 nuevas. `npm run build` y `git diff --check` correctos. Permanece el aviso conocido de tamaño del paquete Phaser. La comprobación visual posterior se describe en el hotfix de esta misma sección.

`npcLifecycle.test.ts` amplía la cobertura con ediciones topológicas cada 500 ms durante carga y descarga, pérdida de personal sin cambio topológico, cien segundos de camino cortado sin nuevos despachos, conservación y recuperación, clasificación por profesión independiente de comida/madera y cambio de textura al reutilizar el pool. Permanecen los cien viajes consecutivos, accesos de una casilla, cortes/desvíos y liberación fuera de cámara. `logistics`, `marketLogistics` y `citizens` conservan pruebas de reservas, persistencia, sprites bloqueados y recorridos físicos.

`kingdomEvents.test.ts` comprueba premios combinados reales con oro, favor, comida y madera; cien intentos repetidos; auditoría por recurso; capacidad llena y recepción de una fracción de 1/150; recarga antes/después de completar y con remanente; recepción completa posterior; permisos, vaciado y espacio reservado; reclamación tras salir del historial acotado; guardados anteriores sin premios retroactivos; rechazo de duplicados y remanentes inflados; rechazo/vencimiento sin suministros; y ambas variantes de las once misiones. Las expectativas previas distinguen ahora premios en oro de ingresos materiales y contemplan el pago de la ayuda alimentaria. El ensayo de diez días permite hasta 250 oro en premios, conserva crecimiento y progresión y sigue comparando decisiones y semillas; no se alteraron precios, producción ni salarios.

Prueba manual adicional sugerida: ejecutar `npm run dev`, observar una granja, maderería y almacén con accesos separados y compartidos; construir repetidamente durante carga/descarga, cortar una calle, abrir desvío y reconectar. Verificar colores, sacos/troncos/cubetas/equipaje, pausa y reutilización al alejar/regresar con la cámara. En Crónicas resolver una misión con almacenes llenos, guardar/recargar, liberar capacidad y pulsar «Recibir suministros pendientes» varias veces: solo debe ingresar el remanente y el historial debe identificarlo. La comprobación visual del hotfix siguiente cubre los NPCs, no vuelve a verificar los premios ni su interfaz.

Hotfix de accesos: se añadieron diez regresiones sobre la base local de 454. Dos se ejecutaron primero contra el renderizador anterior y fallaron por sprites visibles en Loading/Unloading y al alcanzar visualmente el destino. La traza identifica IDs 1/2/3, origen/destino, actividad, fase, faseMs, casilla y tiempo durante 18 s; comprueba que las tres operaciones terminan, en vez de inferirlo únicamente desde `visible`. Otras regresiones cubren guardar/cargar en ambas fases sin repetir la entrega, cien IDs distintos por una ruta de una casilla sin crear imágenes, varios transportistas hacia un almacén con nombres visuales únicos, corte al descargar, conservación, reconexión, pausa durante carga y visibilidad/transiciones a ×1/×2/×3. `logistics.test.ts` conserva su ensayo de 96 imágenes, culling y economía inmutable preparando ahora cargas en marcha.

Resultado final del hotfix: **464 pruebas/41 archivos aprobados** con `npm test -- --maxWorkers=1` (69,89 s); `npm run build` y `git diff --check` correctos. La ejecución inicial sin cambios ya agotaba cinco timeouts; con cuatro workers agotó dos simulaciones prolongadas. Ambas pasan aisladamente y la suite completa pasa en serie, sin modificar sus aserciones ni aumentar timeouts. Se mantiene el aviso de tamaño de Phaser y no se instalan dependencias.

Chrome headless real, sin dependencias nuevas: ciudad aislada con granja 3×3, campamento/almacén/mercado 2×2, ocho viviendas y pozo; 120 s simulados con muestras cada 100 ms. Registró 544 IDs en producción, reposición de mercado, compras, agua e inmigración; 47 visitas/llegadas completadas, máximo 16 sprites visibles, ningún ID con posición visible repetida en muestras consecutivas y cero excepciones. Se verificaron pausa, corte sin alternativa, desvío con conservación inmediata de totales y capturas 1280×900 / 390×844, inspeccionadas visualmente. El harness temporal del repositorio se retiró y el perfil de navegador no utiliza partidas del jugador. Las trazas y capturas están en la carpeta de artefactos de este chat; no es un benchmark ni una prueba manual prolongada de una partida existente.

Límite conservado: si se retira la propia casilla confirmada del NPC, se conserva bloqueado e invisible hasta reconstruirla; no salta a otra calle ni pierde mercancía. No se han añadido retornos ni transportistas exteriores.

## Etapa 15A-3 — Verificación del 9 de noviembre de 2026

Resultado final: `npm test` aprobó **437 pruebas en 41 archivos** (416 iniciales); `npm run build` y `git diff --check` correctos. Permanece la advertencia conocida del tamaño del paquete Phaser. Sin dependencias nuevas.

`tests/npcLifecycle.test.ts` añade seis casos: corte con retirada visual y conservación, desvío sin teletransporte, pérdida de empleados durante carga, cien entregas sin acumular imágenes, acceso compartido de una casilla y finalización fuera de cámara sin crear sprites. Se comprueban también descarga y liberación de actividades.

`tests/citizens.test.ts` añade quince casos contando velocidades parametrizadas: ida vacía/recogida/vuelta/consumo, permisos y stock, bloqueo y recuperación sin pérdida, ×1/×2/×3 y guardado exacto, admisiones reales y alternativa antigua, entrada del reino, demolición sin llegadas fantasma, pozo operativo/capacidad/un único trabajador activo, esquema 9, estrés con 400 residentes y más operaciones que sprites, llegada bloqueada persistida, suspensión/narrativa y rechazo de inventarios/actividades/ventanas dañados. El estrés conserva los enteros de cada producto cada segundo; no mide FPS.

Las regresiones de 15A-1/15A-2 y el balance procedural siguen pasando. Los balances esperados reflejan el nuevo momento real de compra, sin alterar tasas ni precios. Las pruebas primitivas de mercado aíslan explícitamente la API anterior; las partidas reales usan compradores. La fixture de progresión abastecida ahora autoriza madera en su mercado operativo y la comparación de oro usa escala entera. La fixture de esquema 8 solo prepara operaciones que ese esquema podía contener.

### Verificación funcional en Chrome

Escena Phaser real a 1280×900 y 390×844, con huellas 3×3/2×2, entrada del reino y red privada con desvío. Se comprobaron salida vacía, vuelta con comida/madera, stock doméstico (hogar observado: 3,2 comida y 0,64 madera), cubetas y equipajes. Un corte bloqueó dos repartos y retiró ambos sprites inmediatamente conservando las cargas; un desvío permitió continuar las mismas operaciones. Dos llegadas y diecisiete visitas de agua finalizaron. Pausa y restauración JSON exactas; sin sprites huérfanos, cero visibles fuera de cámara y pool de dieciocho imágenes antes/después de reiniciar la escena. Cero excepciones JavaScript. Es una comprobación de integración controlada, no un benchmark exhaustivo.

### Pruebas manuales reproducibles

1. Ejecutar `npm run dev`. Preparar una aldea con granja, campamento junto a árboles, almacén, mercado, pozo y viviendas habitadas conectados por calles y con empleados. Autorizar comida y madera tanto en almacén como mercado; esperar los repartos reales. Un mercado vacío o sin empleados/productos autorizados no genera compras válidas.
2. Seleccionar una vivienda habitada. Observar salida sin carga, aproximación al mercado, recogida y vuelta con cesta/troncos; tras descargar aumenta la reserva doméstica y luego disminuye por consumo. No se crea un viaje por cada fracción consumida. Revisar que ventas/ingresos aumentan al recoger una sola vez.
3. Crear solares vacantes con acceso, agua, suministros y empleo suficiente. Esperar oportunidades reales de inmigración (evaluadas cada cinco segundos, sujetas a las condiciones habituales). Observar equipajes desde la entrada exterior; puede ser necesario desplazar allí la cámara. En guardados antiguos buscar el acceso del centro. La población aumenta al aceptar la admisión y no vuelve a aumentar al terminar el paseo; construir un solar por sí solo no genera un visitante.
4. Mantener pozo conectado y empleado, con viviendas habitadas dentro de seis pasos viales. Observar una cubeta por pozo activo y visitas agrupadas a hogares realmente asignados (hasta treinta habitantes). Desconectar o quitar el empleado: las visitas inválidas se retiran y la cobertura usa sus reglas originales. Las visitas representan ventanas del servicio continuo, sin almacenar agua.
5. Durante un transporte, demoler un tramo futuro de una calle privada; el camino protegido del reino no se puede demoler. Sin alternativa desaparece el personaje y persiste la carga bloqueada. Abrir un desvío recupera la misma operación. Si se elimina la casilla exacta ocupada, reconstruirla. Revisar también entradas de granja, campamento y almacén: las pausas de carga/descarga terminan o pasan a bloqueo invisible recuperable.
6. Guardar durante ida, vuelta, inmigración y agua; cargar y comprobar una única continuación. Probar pausa, ×1/×2/×3 y suspensión de pestaña. Alejar la cámara durante varios viajes y volver: la economía y las entregas siguen avanzando. Repetir cargas/reinicios y revisar que no se acumulan personajes abandonados.
7. Solicitar demolición de una vivienda con compras/reservas: se protege la mercancía y se detienen nuevos pedidos. Esperar consumo/entregas y reintentar; si quedó vacía con stock, requiere ocupación para consumirlo. No se elimina mercancía al ocultar un NPC.

Desde la raíz del proyecto, ejecuta npm ci para instalar las versiones del archivo de bloqueo. Después ejecuta npm test para correr toda la suite una vez. Para ejecutar solo la regresión de recuperación económica, usa npm test -- tests/economicRecovery.test.ts. Ejecuta npm run build para validar TypeScript y el paquete de producción.

Vitest usa Vite y el TypeScript del proyecto. Las pruebas se ejecutan en Node e importan los modelos económicos directamente. La escena de Phaser, el DOM y el dibujo real del mapa quedan fuera de estas pruebas.

| Sistema | Casos principales |
| --- | --- |
| Empleo y población | Límites de población activa y puestos, desempleo, conexión, capacidad residencial e inmigración |
| Bienestar y migración | Atractivo sin solares, lista de espera, promedio ponderado, recuperación y tolerancia antes de emigrar |
| Evolución residencial | Cambios de nivel, tiempo continuo, capacidades, excedentes, pausa y opiniones |
| Agua y voces | Cobertura vial, capacidad de pozos, bienestar, ventana de necesidades, opiniones, filtros y demolición |
| Producción | Proporción por trabajador, máximo, productores desconectados o sin personal |
| Almacenes y transferencias | Capacidad, permisos, operación, inventarios separados y saldos exactos, incluso tras rechazar una transferencia |
| Mercados | Empleo, permisos, cobertura vial, existencias e ingresos por comida entregada |
| Simulación y auditoría | Pausa, reanudación, velocidades, saldos por evento, filtros, rechazos y límite del historial |
| Integración | Granja → almacén → mercado → vivienda y recuperación con dos trabajadores, mercados inactivos y reserva agotada |
| Alpha 0.1 | Versión, favicon y rutas de recursos desde la raíz en desarrollo y producción |
| Reservas de almacén | Envíos independientes de la recepción, gastos de construcción, vaciado, saldos y guardados anteriores |
| Catálogo de Voces | 69 plantillas nuevas, condiciones observadas, filtros, rotación y compatibilidad de los enfriamientos |
| Mapa y cámara | Dimensiones, selección con desplazamiento y zoom, límites, arrastre seguro, conexiones y construcciones lejanas |
| Guardado del mundo | Vista de cámara, construcciones lejanas, migración desde 20 × 20 y continuidad del estado económico |
| Terreno procedural | Semillas reproducibles, río continuo, expansión inicial, construcción, costos de limpieza y suelos protegidos |
| Persistencia de terreno | Restauración del mapa exacto, obstáculos limpiados, cámara, recarga de pestaña y mapas de pasto anteriores |
| Camino del reino | Entrada de borde, ruta determinista y conectada, protección, gratuidad y restauración sin duplicados |
| Puentes | Ambos ejes, costos, cancelación, cruces inválidos, conexión y cobertura, demolición, reconstrucción y guardado |
| Rebalance de empleo | Primer puesto, excedentes, desempleo, prioridades, cambios de población y carga de un reparto anterior |
| Rebalance económico | Precios sobre entregas reales, gastos, déficit, recuperación desde cero y comparación durante tres días |
| Huellas multicelda | Identidad compartida, bloqueo en cualquier casilla, cobro, demolición, producción y acceso por el perímetro |
| Belleza y decoración | Cobertura desde el borde, acceso vial, tope, mantenimiento, voces y umbrales de evolución y deterioro |
| Superficies de caminos | Costo por mejora, protección, conectividad, belleza, puentes y carga de caminos mejorados |
| Ilustraciones | SVG locales distintos y completos para el catálogo y las mejoras de caminos |
| Reconocimiento del asentamiento | Objetivos individuales, pago único, catálogo y obras bloqueadas, crecimiento desde la reserva inicial hasta Villa, progreso y migración de guardados |
| Capítulos y narración | Estado independiente de relato y tutorial, recuperación de pestaña sin repetir la introducción, conservación del reloj y pausa, voz española simulada, cancelación y alternativa de texto |
| Balance inicial | Crecimiento procedural con costos reales, reparto parcial sin duplicar existencias, inmigración con reserva corta, crisis, capacidad del pozo y explotación y persistencia del arbolado |
| La Corona | Crédito atómico, amortización, gastos pendientes, vencimientos, rangos, favor, ofrendas, derrota y migración del guardado |
| Inmigración ocasional | Recuperación desde siete habitantes, atractivo cero, pausa y velocidades, conexión, cupo, consumo, emigración y recarga antes y después del límite de tiempo |

### Simulación de la Etapa 13B

La tabla conserva la comparación anterior a la línea de crédito. `tests/economicBalance.test.ts` arranca con infraestructura preparada y 18 habitantes. Compara el saldo operativo en oro al cierre de cada día. El escenario de recuperación abre el mercado tras seis horas de déficit y mide los tres días siguientes. El escenario carece de decoración y sus viviendas permanecen como máximo en el nivel 2.

| Escenario | Saldo al inicio de la comparación | Día 1 | Día 2 | Día 3 |
| --- | ---: | ---: | ---: | ---: |
| Abastecida | 150,00 | 214,03 | 279,07 | 344,11 |
| Diez edificios sobrantes y mercado cerrado | 150,00 | 16,82 | 0,00 | 0,00 |
| Recuperación al reabrir el mercado | 0,00 | 56,08 | 121,12 | 186,16 |

### Crecimiento en un mapa nuevo

`tests/initialBalance.test.ts` usa la semilla 23 y el presupuesto de una partida nueva. Construye seis viviendas, una granja, un pozo, un campamento, un mercado, un almacén, caminos y jardines con sus costos reales. Alcanza 24 habitantes dentro de las primeras 48 horas. En 14B reúne 650 oro antes de solicitar Pueblo para conservar caja para el siguiente ciclo. Después del ascenso sostiene 25 habitantes durante tres días con cobertura completa de comida y agua. La granja tiene cuatro trabajadores y una capacidad de 64 comida/h frente a una demanda de 62,5.

### Simulaciones de la Corona

Resultados de la etapa 14B previos a las llegadas ocasionales.

| Escenario | Resultado observado |
| --- | --- |
| Aldea abastecida desde una partida nueva | Pagó 150 oro en tres tributos sin pedir crédito para pagarlos. Tras ascender y sostenerse tres días, terminó con 349,24 oro. |
| Aldea con ingresos insuficientes | Con mercado cerrado y exceso de edificios pasó de 16,82 a −104,14 y −200 oro al cierre de los días 1, 2 y 3. Acumuló mantenimiento pendiente. |
| Aldea endeudada que reabre su mercado | Subió de −6,96 a +49,12 oro el primer día y a +179,20 el tercero, con amortización automática. |
| Pueblo abastecido | Tenía 540,43 oro antes del primer pago de 150 y 634,27 tras pagar dos tributos en ciclos sucesivos. |
| Villa con exceso de mantenimiento | La Villa abastecida quedó con 986,62 oro después de pagar 350. Con 15 plazas adicionales, la otra agotó el crédito y dejó vencer el mismo tributo. |
| Pueblo que adelanta obras ornamentales | Dos parques elevaron el mantenimiento en 4 oro/h y llevaron la caja a −150. La tercera compra fue rechazada. Un día después el saldo era −118,13. |

### Simulaciones de inmigración y emigración

| Escenario de `tests/occasionalMigration.test.ts` | Resultado observado |
| --- | --- |
| A. Aldea abastecida | Pasó de 7 a 17 habitantes en la primera hora por vía normal y alcanzó 25 en tres días, con comida, madera y agua cubiertas. |
| B. Aldea pequeña con mercado sin reserva | Se mantuvo en 7 habitantes y 3 trabajadores hasta la primera oportunidad de las 8 h. Llegó una persona y la población activa subió a 4. |
| C. Escasez permanente | Una aldea vacía y sin suministros registró 9 llegadas y 8 salidas en tres días. La población osciló entre 0 y 1. |
| D. Recuperación de la aldea pequeña | El cuarto trabajador cubrió el segundo puesto de la granja. Volvió la inmigración normal, con 16 habitantes una hora después de la llegada y 25 al tercer día. |
| E. Pueblo en crisis alimentaria | En tres días pasó de 24 a 0 habitantes por emigración, con cero llegadas ocasionales. |

### Simulaciones de comercio exterior

`tests/externalTrade.test.ts` cubre desbloqueo, huella, cargos únicos, caminos y puentes, empleo, reservas, capacidad, protección de almacenes, liquidación atómica, crédito, guardados 4 y 5, pausa y velocidades ×1, ×2 y ×3.

Los pueblos de prueba arrancan con 30 habitantes, 150 oro y la red local ya montada. Las Casas de Comercio se construyen y pagan durante la prueba. Los escenarios A–F avanzan tres días y G avanza seis. Se paga el tributo en cuanto se emite si hay saldo suficiente.

| Escenario | Resultado observado |
| --- | --- |
| A. Pueblo equilibrado | Exportó 330 de comida por 105,60 oro y mantuvo cobertura alimentaria del 100 %. |
| B. Pueblo sin excedente sobre la reserva elegida | La reserva alta dejó cero unidades exportables. Los ingresos comerciales fueron 0 oro. |
| C. Escasez de comida | Con una granja, la reserva de 150 permitió vender 8 unidades y dejó 58 de 72 mediciones horarias con cobertura incompleta. La reserva de 0 permitió vender 30 y elevó las mediciones con escasez a 59. |
| D. Pueblo maderero | Tres campamentos sostuvieron exportaciones de 330 de madera por 158,40 oro. Comida y madera terminaron al 100 % de cobertura. |
| E. Pueblo importador | Sin campamentos, gastó 236,56 oro en madera y tuvo cobertura parcial o total en 27 de 72 mediciones horarias. Terminó con 70,79 oro de deuda. |
| F. Dos casas | Exportaron 660 de madera por 316,80 oro. La caja quedó 26 oro por encima de D tras la segunda obra, salarios y mantenimiento. |
| G. Ahorrar para Villa | Tras pagar la obra y un tributo de 150 oro, el exportador reunió 800 oro a las 95 h. El mismo Pueblo sin Casa de Comercio llegó a las 103 h. La prueba mide el objetivo de tesorería. |

### Regresión de la ira del rey

`tests/royalConfidence.test.ts` comprueba la apertura del plazo al caer a cero, la cancelación por tributo y ofrenda, una segunda caída con plazo completo y el vencimiento exacto. Los casos ×1, ×2 y ×3 verifican pausa, suspensión narrativa, suspensión de la aplicación, guardados repetidos, bloqueo de acciones y restauración de la derrota con un viaje comercial pendiente.

También cubre la migración de un guardado 5 con favor cero, la conservación de un decreto omitido, el rechazo de un guardado 6 que haya perdido el contador y la carga de un guardado jugable anterior. La regresión de tres impagos conserva su propio motivo de derrota. `tests/chapterVoice.test.ts` comprueba que el bloqueo de audio permite reintentar manualmente.

Chrome comprobó a 1280 × 720 y 390 × 844 la voz automática al abrir y cambiar de página, pausa, repetición, silencio persistente, aviso crítico, recuperación por ofrenda, derrota, omisión, resumen, recarga y carga de una partida anterior. También se simuló un bloqueo de reproducción automática.

La comprobación de narración global recorrió las 16 páginas de introducciones y tutoriales de Aldea, Pueblo y Villa sin pulsar Escuchar. Incluyó la invitación opcional al tutorial, los tres relatos reales y una escena genérica. También verificó voz española disponible con retraso, respeto al silencio, ausencia de repeticiones al actualizar las voces y cancelación al cerrar.

### Crónicas del Reino y simulaciones de misiones

`tests/kingdomEvents.test.ts` comprueba los once acontecimientos y sus variantes, fechas válidas, reproducción con la misma semilla y decisiones, diversidad entre semillas, enfriamientos y 24 días de selección con recargas. Cubre objetivos bloqueados por rango, recursos y comercio, protección ante tributos próximos, entregas atómicas, límites del crédito, recompensas únicas, progreso continuo, crecimiento nuevo y obras antiguas reconectadas.

Las pruebas de integración usan almacenes y comercio reales, los comandos normales de construcción y mejora, la Corona, guardados anteriores y el esquema actual. Las velocidades ×1, ×2 y ×3 conservan ofertas, pausa y suspensión narrativa. Una decisión que lleva el favor a cero activa el plazo de destitución existente.

Las simulaciones siguientes parten de un Pueblo preparado con 32 habitantes, 150 oro, servicios y producción. La Casa de Comercio se construye pagando su costo. Durante diez días se pagan los tributos y se exporta madera. La política de respuesta acepta encargos, paga o entrega solo si dispone de existencias, protege dos horas de alimento y realiza las obras con sus comandos y costos habituales. El favor inicial de 80 representa una administración ya reconocida.

| Semilla y decisiones | Misiones completadas | Recompensas de oro | Contribuciones de oro | Saldo al día 10 | Habitantes | Primera hora con 800 oro |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 23, responde | 7 | 27 | 0 | 1339,65 | 48 | 132 |
| 24, responde | 7 | 33 | 65 | 1875,85 | 48 | 98 |
| 1023, responde | 6 | 0 | 36 | 1465,85 | 48 | 101 |
| 23, deja pasar las ofertas | 0 | 0 | 0 | 1925,85 | 48 | 96 |

Las secuencias difieren. La semilla 23 comenzó con un capricho de la Corona, la 24 con una fiesta y la 1023 con una contribución de guerra. Las obras y su mantenimiento explican que aceptar todos los encargos no acelere siempre el ahorro. Las recompensas permanecieron por debajo de 100 oro en diez días.

Chrome comprobó a 1280 × 720 y 390 × 844 una misión narrada automáticamente, omisión sin rechazo, aceptación, pago único, cambio de favor, historial, consulta del resultado, pausa y velocidad ×3, y recargas antes y después de resolverla.

## Agregar un caso

1. Crea o amplía un archivo con sufijo .test.ts en tests. Importa test desde vitest y usa las aserciones de Node o expect de Vitest.
2. Crea un estado independiente para cada caso. Usa Inventories para comprobar movimientos aislados. Para probar la cadena completa, crea ConstructionMap, RoadConnections, Population, Economy y SettlementSimulation.
3. Avanza SettlementSimulation con milisegundos explícitos. Así puedes verificar el instante anterior a la reposición y el siguiente tick sin esperar tiempo real.
4. Comprueba el resultado observable. Para una transferencia, verifica el saldo de origen y destino, el total y los ingresos cuando procedan. Para un rechazo, verifica ambos saldos.
5. Ejecuta primero el archivo afectado y después npm test y npm run build.

Las unidades enteras de inventario representan fracciones de 1/150 desde 09C. Los movimientos de tesorería que incluyen una fracción más fina indican su escala en unitScale. Usa unitsPerResource para preparar existencias en pruebas de Inventories. Los saldos públicos de Economy se expresan en unidades de comida, madera y oro.

### Etapa 15A-1 — Entregas físicas

`tests/logistics.test.ts` agrega 17 casos: creación sin depósito instantáneo, conservación y entrega única, dos productores reservando el mismo almacén, protección frente a importaciones y depósitos explícitos, bloqueo por personal/permisos, cortes y desvíos, casilla ocupada retirada, entrega tras desconectar solo el productor, ambos ejes de puentes, accesos de huellas 3×3 y 2×2, caché, pausa, equivalencia ×1/×2/×3, guardado en tránsito, rechazo de estados dañados, compatibilidad anterior, demolición con vaciado logístico y estrés 100×100. El caso visual usa una escena de prueba para verificar pooling, máximo de 96 imágenes, culling, ausencia de nuevas imágenes al repetir frames y ausencia de cambios económicos desde el renderizador.

El estrés monta muchos productores y almacenes y avanza 90 segundos simulados; supera el límite visual y compara, por producto, la producción auditada con el total entero de inventarios y cargas. No busca rutas ni crea relojes por personaje en cada frame. Los guardados mantienen rutas compartidas y compactas.

Las regresiones anteriores que esperaban existencias inmediatas se actualizaron para distinguir almacén, pendiente y tránsito, conservando las comprobaciones de consumo, ingresos, empleo y precisión. La recuperación desde una tesorería vacía puede registrar una pequeña deuda inicial por salarios antes de las primeras ventas; no se modificaron salarios ni precios. El escenario de siete habitantes ahora verifica recuperación normal mediante cargamentos parciales; las otras pruebas de inmigración mantienen la cobertura de llegadas ocasionales y su calendario.

Comprobación de navegador: Chrome local con perfil temporal a 1280×900 y 390×844, usando la escena Phaser real con granja 3×3, campamento y almacén 2×2. Se observaron sacos y troncos, cambio de coordenadas entre 3000 y 4000 ms, pausa estable y almacén inicialmente vacío. Tras avanzar el viaje, recibió 10,24 comida y 3,52 madera. Sin excepciones JavaScript. Esta comprobación complementa las pruebas del modelo; no constituye un benchmark exhaustivo.

Prueba manual:

1. Ejecutar `npm run dev`. En una partida, conectar por calles una granja, un almacén, viviendas y mercado; añadir pozo para sostener el crecimiento. Verificar empleados en los inspectores.
2. Seleccionar la granja: aparecen cantidades pendientes y en tránsito; el almacén muestra su espacio reservado. Los sacos recorren las calles y la comida solo se agrega al completar la descarga.
3. Añadir un campamento junto a árboles/bosque y darle acceso vial y empleados. Comprobar troncos y entregas de madera. La reserva inicial de construcción es independiente de estos cargamentos.
4. Probar pausa y ×1/×2/×3; guardar mientras hay carga, recargar y comprobar continuación sin duplicados. Alejar la cámara y regresar: la logística continúa.
5. Cortar un tramo futuro de la ruta y añadir un desvío. Sin alternativa, la mercancía sigue contabilizada y bloqueada; con acceso restaurado, se entrega. Si se quita exactamente la casilla del transportista, reconstruir esa casilla.
6. Deshabilitar temporalmente recepción o quitar empleo del destino: no recibe hasta recuperar los requisitos. Solicitar demolición de un productor ocupado, esperar el vaciado y volver a solicitar; cancelar el modo permite seguir produciendo.

Verificación final: `npm test` aprobó 399 pruebas en 38 archivos; `npm run build` y `git diff --check` pasaron. La advertencia de tamaño del paquete de Phaser continúa siendo la conocida. Sin dependencias nuevas ni publicación.
### Etapa 15A-2 — Repartidores y transferencias entre almacenes

`tests/marketLogistics.test.ts` añade 17 casos: mercado vacío al programar el pedido, recogida y descarga reales de comida/madera, reservas frente a construcción y comercio, pedidos repetidos, capacidad compartida y cuota de madera, autorización de despacho/recepción, falta de empleados, venta solo después de llegar, agrupación de emergencias, vaciado físico y demolición protegida, desvíos tras cortar calles, cuatro fases de guardado, equivalencia de velocidades ×1/×2/×3 y pausa, restauración de un guardado 8, comandos reales de demolición y varios mercados en 100×100 sin cámara.

La regresión de 15A-1 sigue comprobando productores, conservación entera, puentes por ambos ejes, huellas 2×2/3×3, estrés por encima del máximo visual, caché y pooling. Las preparaciones de pruebas anteriores utilizan `tests/fixtures/logistics.ts` para completar operaciones reales antes de comprobar consumo, cobertura o impuestos; los escenarios de integración avanzan el reloj completo. Las pruebas de emergencia y auditoría se actualizaron para distinguir pedido, recogida, descarga y venta, en lugar de exigir reposición inmediata. Las misiones no pueden gastar mercancía reservada por repartidores.

Se ejecutó `npm test`: 416 pruebas aprobadas en 39 archivos, 17 nuevas respecto a 15A-1. También pasó la suite con cuatro workers para revisar simulaciones prolongadas. El crecimiento procedural, el balance de tres días, el comercio y los diez días de misiones continúan pasando. Las diferencias de caja por recepción tardía están registradas en el plan; no se cambiaron tarifas ni reglas de consumo/producción.

Chrome local, con perfil temporal, comprobó la escena Phaser a 1280×900 y 390×844: mercado inicialmente con cero comida/madera y pedidos de 50 de cada producto; cuatro operaciones descargaron exactamente 100 recursos en el mercado y tres trasladaron 50 a otro almacén. Se vieron sacos y troncos en movimiento, pausa estable y ambos destinos. Tras alejar la cámara, quedaron cero sprites visibles y se completaron otras doce entregas. No hubo excepciones JavaScript. La prueba reutiliza edificios con huellas reales y el renderizador del juego.

Prueba manual de 15A-2:

1. Ejecutar `npm run dev`. Construir o cargar una aldea con granja, campamento junto a árboles, almacén, mercado, viviendas y pozo, conectados mediante calles y con empleados.
2. Autorizar el envío de comida y madera en el almacén y ambos productos en el mercado. Ver los pedidos en camino en el inspector del mercado y las reservas de recogida en el almacén. El mercado sigue vacío hasta que los repartidores descarguen; las ventas empiezan al disponer de existencias.
3. Añadir un segundo almacén que acepte los productos y activar «Vaciar almacén» en el primero. Observar cargamentos hacia el nuevo destino. El primero puede mostrar cero existencias y seguir protegido mientras sus entregas estén en tránsito; esperar a que terminen antes de demolerlo.
4. Probar pausa, velocidades y cámara alejada. Guardar antes de recoger y durante el trayecto, recargar y verificar que el pedido continúa una sola vez.
5. Cortar un tramo futuro y construir un desvío. Deshabilitar temporalmente recepción o envío y comprobar que no desaparecen existencias ni reservas. Restablecer permisos, personal y ruta para terminar operaciones bloqueadas. Si se elimina la propia casilla del NPC, reconstruirla.
6. Consultar el historial: almacén → cargamento es recogida; cargamento → mercado/almacén es descarga. Ningún reparto crea producción ni ingresos por sí mismo.

El tamaño del canvas y la estructura de paneles se conservan; los campos adicionales usan el scroll del inspector. Continúa la advertencia conocida sobre el tamaño del paquete de Phaser. Sin nuevas dependencias, ramas, commits, push ni publicación.
