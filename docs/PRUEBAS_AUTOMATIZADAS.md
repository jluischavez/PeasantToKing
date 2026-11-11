# Pruebas automatizadas de Peasant to King

## Hotfix posterior a 15C — Indicadores viales de jardines (10 de noviembre de 2026)

`gardenAccessIndicators.test.ts` añade 21 regresiones: render real del inspector con «Conexión vial: No necesaria» tanto con acceso como sin él; todos los demás tipos conservan «Sin conexión»/«Conectado» según su conexión física; alertas sin falsos positivos antes/después de recarga y con mercado/pozo desconectados; render de los marcadores del mapa para jardín, mercado, pozo, parque y plaza. También verifica que un jardín junto a la red no transmite conexión a calles ni mercados situados al otro lado.

`buildingCoverage.test.ts` añade una regresión integral de jardín sin ninguna calle adyacente: construcción legal, radio 3, previsión +25, vivienda elegible, beneficio real, selección idéntica después de guardar/cargar y ninguna advertencia de falta de acceso del emisor. Si se corta el acceso del hogar, el texto atribuye correctamente el requisito al hogar. Las regresiones existentes de `gardensAndMissionGold.test.ts` comprueban belleza, retirada de caminos sin desconectar la vivienda, recuento de jardines aislados y cumplimiento de una misión real tras recarga sin duplicar premios.

Ensayo con Chrome y escena real: conexión física falsa, inspector exacto, +25 de belleza, cero comandos gráficos del marcador de desconexión y ninguna alerta «Construcciones desconectadas» por el jardín. Se repitieron selección, previsión, cancelación, cámara, pausa, demolición y tacto a 1280×900 y 390×844, con cero excepciones, un único objeto de cobertura y `Session.saveState(null)` idéntico durante la inspección. No se usaron partidas del jugador.

Conclusión: el fallo pendiente era visual (inspector, marcador y alerta colectiva). No se encontraron comprobaciones adicionales incorrectas que afectasen belleza o misiones. La conectividad física y los requisitos de los demás edificios permanecen intactos.

Validación completa: `npm test -- --maxWorkers=1` ejecutó 559 casos en 45 archivos; 558 aprobados y un timeout en `kingdomEvents.test.ts`, «ten-day settlements get distinct achievable missions, modest rewards and continued growth». Duración total 191,62 s; ese caso tardó 49,71 s frente a su límite explícito de 30 s. Repetido sin trabajos concurrentes: 49,98 s y mismo timeout. Comparación temporal con la expresión anterior `type === 'garden' || connected`: 50,62 s y mismo timeout; el archivo se restauró inmediatamente. No se amplían límites ni se cambian aserciones para ocultarlo. Las 22 regresiones nuevas pasan. `npm run build` y `git diff --check` correctos, con el aviso habitual de tamaño de Phaser.

## Etapa 15C — Alcance y cobertura (10 de noviembre de 2026)

Suite inicial: 510 pruebas/43 archivos con `npm test -- --maxWorkers=1` (76,74 s), antes de integrar la visualización. Las 44 regresiones focalizadas iniciales de belleza, distribución, agua y jardines siguieron pasando tras compartir la geometría.

Resultado final: **537 pruebas/44 archivos**, 27 nuevas, con `npm test -- --maxWorkers=1` en 72,58 s. `npm run build`, `git diff --check`, revisión de estado y diff final correctos. Sin dependencias nuevas ni cambio de formato de guardado. Permanece el aviso conocido de tamaño del paquete Phaser.

`buildingCoverage.test.ts` agrega 27 casos contando edificios sin alcance y ambos ejes de puente por separado. Comprueba jardín aislado potencial y real, disminución de belleza y acceso del hogar, alcance desde el extremo completo de un parque 3×3, plaza sin agua, igualdad con la cobertura real de mercado, huella virtual sin construir, corte/desvío con distancia exacta, observaciones y productos parciales de mercado sin atribución ficticia, disponibilidad autorizada de compra, cupo real de agua y hogar parcialmente atendido, falta de aguador, bosque/árboles y tala, ausencia de radios inventados, prioridad/cancelación/selección/demolición, mil posiciones con un solo Graphics, caché de cálculo/dibujo durante mil actualizaciones idénticas, huella inválida roja, coordenadas en extremos de zoom y paneo, persistencia sin estado visual nuevo, caminos mejorados, mejor aporte y tope de belleza y apoyo/cancelación táctil antes del clic sin acción económica.

Las comprobaciones de estado comparan `Session.saveState(null)` antes/después, incluyendo inventarios, logística, servicios derivados reconstruidos, población, misiones y Corona. Las pruebas visuales usan datos existentes y nunca llaman métodos de consumo o asignación para mostrar la cobertura. El ensayo de repetición verifica objetos y cálculos, no FPS de una ciudad arbitraria.

Chrome headless real con MapScene: capturas a 1280×900 y 390×844, eventos nativos de ratón/teclado/tacto. Verificó jardín aislado seleccionado, vista previa potencial con mejora estimada, huella inválida, cancelación con buffer vacío, mercado con observaciones de cualquier origen, pozo 30/30 con parcial, árboles/bosques, pausa, demolición, mínimo/máximo de zoom, WASD, arrastre, 150 movimientos manteniendo un solo Graphics y selección/previsualización/cancelación táctil. Cero excepciones y estado guardable idéntico durante el recorrido. Las capturas se inspeccionaron y no hubo desbordamiento horizontal móvil. El harness temporal se retiró del repositorio; no utiliza partidas del jugador.

Prueba manual adicional: seleccionar jardín, parque, plaza, mercado, pozo y campamento; comparar el alcance con viviendas reales y leer las condiciones del inspector. Activar una construcción y mover el cursor por posiciones válidas/inválidas; cancelar debe borrar la capa. Cortar un camino y crear un desvío, cambiar permisos del mercado y observar los cupos del pozo. Añadir una decoración igual cerca de una existente: la previsión no debe prometer suma ilimitada. Probar cámara, tacto, guardar/cargar y cambio de escena. En mercados recordar que recepción doméstica y procedencia concreta son datos distintos: el verde no identifica qué tienda entregó los productos.

## Hotfix — Jardines y oro de misiones (10 de noviembre de 2026)

**REGLA PERMANENTE: Los jardines no necesitan conexión vial para aportar belleza o contar como decoración válida.**

Suite inicial: 498 pruebas/42 archivos aprobados con `npm test -- --maxWorkers=1` (74,67 s).

Resultado final: **510 pruebas en 43 archivos**, 12 nuevas, aprobadas con `npm test -- --maxWorkers=1` en 72,75 s. La comprobación focalizada pasó sus 55 pruebas. `npm run build` y `git diff --check` correctos; permanece el aviso conocido de tamaño de Phaser. Sin dependencias nuevas, ampliación de límites del historial ni cambios en la liquidación económica. No se realizó prueba manual de navegador durante este hotfix.

`gardensAndMissionGold.test.ts` agrega once casos contando parques/plazas por separado: construcción pagada sin carretera, belleza de vivienda conectada, recuento decorativo sin falsificar conexión, ausencia de servicios/trabajadores/transporte, retirada de calles del jardín, desconexión de la vivienda, JSON/recarga, nueva misión real de jardín aislado y premio exacto de 15 oro, línea base de jardines anteriores, espacio sin caminos, caché positiva/negativa e invalidación por limpiar/plantar/construir/demoler, conservación de conexión para parques/plazas y sus misiones, contribución real sin premio de oro y expulsión de un premio tras 200 movimientos posteriores. La prueba de caché usa un mapa 4×4 sin terreno libre y verifica que treinta consultas no repitan la búsqueda; después libera una casilla aislada y comprueba su detección.

`kingdomEvents.test.ts` añade un caso de contribución y recompensa combinadas con comprobación de ambos movimientos, cantidades, balances de origen/destino y resultado neto. `residentialBeauty.test.ts` corrige la expectativa anterior que descartaba deliberadamente el jardín más cercano por estar aislado: ahora aporta 25 puntos, sin modificar el tope ni las reglas de las otras decoraciones.

No se reprodujo bug de oro: la misión real paga su premio prometido una sola vez; los cargos se distinguen de ingresos, los premios cero no crean ingresos, los resultados y la auditoría sobreviven al guardado/carga sin repetirse. El historial económico tiene capacidad predeterminada de 200 movimientos globales; el registro de un premio puede ser retirado por actividad posterior, aunque su resultado permanezca en Crónicas (hasta sesenta misiones). Se preserva el comportamiento económico y visual del historial.

Prueba reproducible: `npx vitest run tests/gardensAndMissionGold.test.ts tests/kingdomEvents.test.ts tests/residentialBeauty.test.ts --maxWorkers=1`. Para comprobarlo jugando, aceptar «El capricho de la Corona» cuando solicite jardín, construirlo aislado en terreno válido y revisar la belleza de una vivienda conectada dentro del radio. Al completar, abrir Historial con recurso Oro y sin «Edificio seleccionado»: debe figurar «Recompensa de misión» con 15 oro y saldos antes/después. Guardar/cargar no vuelve a cobrar. Tras suficientes ventas, producción, consumo y traslados para sumar 200 movimientos globales, el registro antiguo puede desaparecer; consultar el resultado conservado en Crónicas. Parques/plazas y viviendas desconectadas deben conservar sus bloqueos anteriores.

## Etapa 15B — Privilegios reales (10 de noviembre de 2026)

Suite inicial: 464 pruebas/41 archivos aprobados mediante `npm test -- --maxWorkers=1` (71,13 s).

Resultado final: **498 pruebas en 42 archivos**, 34 nuevas. El comando requerido `npm test -- --maxWorkers=1` pasó en 74,24 s; una comprobación adicional con `npm test` pasó también, en 30,29 s. La limitación histórica de timeouts paralelos no se reprodujo en esta ejecución; no se aumentaron límites ni se redujeron aserciones. `npm run build` y `git diff --check` correctos. Continúa el aviso conocido del tamaño del paquete Phaser, sin nuevas dependencias.

`royalPrivileges.test.ts` agrega 34 casos contando parametrizaciones: umbrales 0/50/59/79/89; comida/madera en inventarios reales; ausencia de almacén, capacidad insuficiente, reservas, permisos, vaciado, demolición, desconexión y falta de empleados; recepción repartida entre dos almacenes con un solo cobro de favor; subsidio sobre deuda y cien confirmaciones repetidas; recuperación común; pausa y cambio de velocidades ×1/×2/×3 al borde exacto de 72 h; recarga con solicitud antigua; descuento en los tres rangos, céntimos, tope, fechas, pago único y recarga pagada; auditoría de pasivo sin ingreso ficticio; rachas intactas; obligaciones ausentes/pagadas/vencidas; fallo de transacción y confirmaciones inválidas; migración de versión 10 a 11; ofrendas, favor de misiones y ausencia de arbitraje; favor cero y ambas derrotas; rechazo de contadores/duplicados/descuentos/recuperación alterados; cambios de espacio entre preparación y confirmación; e historial acotado con 140 concesiones sin perder sus límites. `footprints.test.ts` espera ahora el formato 11 al escribir una partida; los formatos anteriores siguen aceptados.

Chrome headless real con MapScene y perfil temporal, a 1280×900 y 390×844: muestra/cancela confirmaciones, concede intercesión 50→42,5 sin aumentar tesorería, rechaza doble confirmación, abona 20 oro, muestra la recuperación de las tres ayudas, restaura audiencias y descuento, rechaza una confirmación que perdió capacidad sin gastar favor y entrega 15 madera después de una recarga válida. Se inspeccionaron las capturas y el ancho móvil no desborda el documento. Cero excepciones en la ejecución final. Las existencias y el favor de esta ciudad son una preparación de prueba, no premios retroactivos; el harness se retiró del repositorio y las evidencias están en los artefactos del chat.

Prueba manual sugerida: abrir Crónicas → La Corona → Privilegios reales. Con 60 favor solicitar comida o madera, cancelar primero y confirmar después; comprobar almacén, favor y recuperación compartida. Intentar con almacén lleno, sin recepción o sin empleados: debe explicar el bloqueo sin cobrar. Con 80 favor solicitar subsidio estando endeudado y comprobar el saldo. Con 90 y tributo pendiente confirmar intercesión y revisar original, descuento, importe y fecha; pagar y recargar. Verificar que ninguna acción cambia NPCs, premios de misiones ni progresión. Pausar y alternar velocidades para observar que solo avanza el reloj del juego.

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
