# Estado del proyecto

- 2026-11-10 — Hotfix posterior a 15C: **regla permanente: los jardines no necesitan conexión vial**. El inspector muestra «Conexión vial: No necesaria» tanto conectados como aislados. No generan el punto amarillo del mapa ni incrementan «Construcciones desconectadas» por falta de camino.
- La incidencia restante era visual: inspector, marcador y alerta colectiva aplicaban conexión indiscriminadamente. Belleza, construcción, misiones y persistencia ya admitían jardines aislados. `BuildingAccess.requiresRoadConnection` comparte el requisito por tipo entre esos indicadores, belleza y cobertura; `RoadConnections` conserva caminos reales y los jardines nunca transmiten conexión a otras calles o edificios.
- Cobertura de 15C conservada: radio 3, hogares beneficiados verdes, previsión coherente con selección/recarga. Si una vivienda pierde acceso, el detalle señala expresamente que el requisito es de la vivienda, no del jardín. Parques, plazas, mercados, pozos y demás tipos conservan sus requisitos.
- Chrome real: jardín físicamente desconectado, +25 de belleza en vivienda vecina, ningún comando de marcador vial ni alerta colectiva por el jardín; escritorio 1280×900 y móvil 390×844, cero excepciones y guardado idéntico durante la inspección. Sin cambios en economía, NPCs, privilegios, formato de guardado ni otras reglas de 15C; sin ramas, commits ni push.
- Validación del hotfix: 22 regresiones nuevas. Suite completa ejecutada: 558/559 aprobadas (45 archivos, 191,62 s); el escenario existente de diez días agota su límite de 30 s. Repetido solo: 49,98 s; con la expresión de belleza anterior al hotfix: 50,62 s, mismo timeout. No se ampliaron límites ni se modificó ese escenario. Build y diff --check correctos; permanece el aviso conocido de tamaño de Phaser.

- 2026-11-10 — Etapa 15C: capa de alcance al mover una construcción o seleccionar un edificio. Jardín 3, parque 6, plaza 5, maderería 6 desde toda la huella; mercados/pozos hasta 6 tramos viales y caminos mejorados con su belleza real de 2 casillas. Sin radios inventados para los demás edificios.
- Jardines siguen funcionando aislados. La previsión de belleza respeta distancia, mejor aporte por tipo y máximo; indica hogares con mejora estimada sin prometer una bonificación duplicada. Parques/plazas y hogares mantienen sus requisitos de acceso; la fuente decorativa no da agua.
- Mercado: se distinguen alcance vial, existencias autorizadas sin reservar y recepción observada de comida/madera del hogar en el último segundo, de cualquier origen. No se atribuyen reservas domésticas a un mercado concreto ni se confunde disponibilidad con entrega. Agua: las asignaciones reales del pozo determinan hogares verdes y rellenos parciales hasta 30 habitantes. Maderería: árboles/bosques reales dentro del alcance, contados por casilla.
- Un objeto Graphics de Phaser en coordenadas del mundo, sin interceptar eventos. Amarillo potencial/sin beneficio, verde observado o arbolado, gris sin acceso y rojo huella no confirmable. Inspector compacto con condiciones desplegables y detalles por vivienda al pasar el cursor. Construcción tiene prioridad; cancelar, limpiar selección, demoler o cerrar escena retira la capa.
- Geometría compartida con simulación: `FootprintRange` para belleza/bosque y el recorrido de `MarketCoverage` para servicios. Caché por objetivo, ocupación, topología, terreno y revisión de contexto; sin BFS ni barrido del mapa por frame. No se guarda el overlay ni cambia la versión de persistencia.
- Chrome real comprobó selección, vista previa, invalidez, cancelación, demolición, pausa, zoom mínimo/máximo, WASD, arrastre y tacto a 1280×900 y 390×844, con cero excepciones. Se mantuvo un único objeto de cobertura y el estado de `Session.saveState(null)` idéntico durante la inspección. El apoyo táctil actualiza la vista previa antes de soltar, sin construir ni cobrar.
- Se conservan los cambios locales de 15B y jardines, economía, reglas de cobertura, logística, NPCs y misiones. Sin ramas, commits, push, dependencias nuevas ni publicación.
- Verificación final 15C: 537 pruebas/44 archivos (27 nuevas) con `npm test -- --maxWorkers=1`, 72,58 s; build y diff --check correctos, y estado/diff revisados. Se mantiene el aviso conocido de tamaño de Phaser. La procedencia concreta de las reservas domésticas no se inventa: el mercado muestra recepción de cualquier origen y disponibilidad de venta por separado.

- 2026-11-10 — Hotfix de jardines y revisión del oro: **REGLA PERMANENTE: Los jardines no necesitan conexión vial para aportar belleza o contar como decoración válida.** Se mantiene la conexión propia de las viviendas receptoras y las reglas de parques/plazas.
- La regresión estaba en el filtro común de fuentes de belleza, el recuento de edificios del contexto del reino, el requisito de conexión de nuevas obras de misión y la búsqueda de espacio limitada a bordes viales. La excepción ahora es exclusiva de `garden`; su conectividad real sigue siendo falsa cuando está aislado.
- Espacios para jardines: búsqueda en cualquier terreno construible, cacheada por cambios de construcciones y revisión del terreno. No se recorre el mapa en cada actualización ni se guarda la caché; limpiar o plantar árboles invalida el resultado derivado. El texto del objetivo ya no exige caminos para jardines.
- Oro de misiones: no se reprodujo error de acreditación ni auditoría. Una misión real de jardín promete y entrega 15 oro; la tesorería registra `mission-reward` con importe y saldos exactos. Se comprobaron recompensa cero, contribución/recompensa separadas, resultado neto y recarga sin duplicados. No se modifican cantidades ni funcionamiento económico.
- El historial económico conserva los últimos **200 movimientos globales**, antes de aplicar filtros. Tras 200 movimientos nuevos puede desaparecer el premio antiguo de la vista, aunque ya esté cobrado. El resultado de la misión conserva el oro recibido mientras la misión permanezca en el historial de Crónicas (60 misiones). No se amplió el historial ni se añadieron filtros.
- Se preservan todos los cambios locales de 15B, los NPCs, la logística, los privilegios, el comercio y la progresión. Sin ramas, commits, push ni publicación.
- Verificación final del hotfix: 510 pruebas/43 archivos, 12 nuevas, aprobadas con `npm test -- --maxWorkers=1` (72,75 s); build y diff --check correctos. Continúa el aviso conocido de tamaño de Phaser. Sin fallo funcional conocido pendiente; no se realizó prueba manual de navegador en este hotfix y se dejan pasos reproducibles en el documento de pruebas.

- 2026-11-10 — Etapa 15B: «Privilegios reales» integrado en La Corona, con requisitos, motivos de bloqueo, confirmación, beneficio efectivo, favor gastado/restante y recuperación visible.
- Provisiones: desde 60 favor, 20 comida o 15 madera por 8 favor. Se valida todo el lote en almacenes operativos conectados, con recepción permitida y capacidad libre descontando reservas; sin espacio no se entrega nada ni se cobra favor. Puede repartirse entre almacenes. Sin NPCs nuevos.
- Subsidio: desde 80 favor, +20 oro por 15 favor mediante tesorería real, recuperando el saldo negativo/crédito existente. Comida, madera y oro comparten 72 h simuladas de recuperación.
- Intercesión: desde 90 favor, cuesta 18 y reduce el tributo pendiente un 15 %, redondeado a céntimos y con tope de 50 oro. Conserva importe original, reducción, secuencia de audiencia y vencimiento; una vez por obligación, sin reiniciar impagos ni emitir oro ficticio. Ejemplos: 50→42,5; 150→127,5; 350→300.
- Solicitudes con secuencia, favor esperado y obligación esperada; confirmación revalida la viabilidad económica. Un fallo no gasta favor ni activa recuperación. Se conservan las reglas de favor cero, destitución, ofrendas, misiones y tres impagos.
- Guardado 11 compatible con 1–10: última ayuda, próxima disponibilidad, contadores por privilegio, historial acotado de 60 audiencias, última intercesión y descuento del tributo. Sin ayudas retroactivas. Auditoría separada: provisiones reales, subsidio real y reducción del tributo.
- Balance: cantidades propuestas conservadas. La ofrenda más eficiente cuesta 8 oro/favor; recomprar el favor del subsidio cuesta al menos 120 para recibir 20, y el de intercesión 144 para ahorrar hasta 50. Los suministros tienen valor de exportación 6,4/7,2 oro frente a 64 de ofrendas para recuperar sus ocho puntos.
- Chrome real comprobó confirmación/cancelación, doble clic, descuento, subsidio, capacidad, madera, recuperación compartida y recarga, con capturas 1280×900 y 390×844; cero excepciones en la ejecución final. No se modificaron NPCs, colores, tasas, premios de misiones, comercio ni progresión. Sin ramas, commits, push, dependencias nuevas ni publicación.
- Validación final 15B: 498 pruebas/42 archivos (34 nuevas) aprobadas con `npm test -- --maxWorkers=1` en 74,24 s. La comprobación adicional `npm test` también pasó las 498 en 30,29 s: los timeouts paralelos previos no se reprodujeron en esta ejecución. Build y diff --check correctos; persiste únicamente el aviso conocido de tamaño de Phaser.

- 2026-11-10 — Etapa 15A-4: la reconciliación valida personal y permisos aunque no cambie la topología; editar calles/edificios ya no reinicia carga, descarga ni el avance fraccionario de un tramo que sigue válido. Incluye viajes de agua e inmigración.
- Causa reproducida: `validateRoute` y `reconcileJourneys` reiniciaban fase/temporizador al invalidarse la topología, incluso descargando en el mismo acceso. Ediciones sucesivas podían impedir terminar. Además, `reconcile` omitía operaciones no bloqueadas sin cambio topológico y retrasaba la retirada visual al perder personal/permisos. Los accesos compartidos de una casilla y la producción sucesiva también explican pausas legítimas; el hotfix posterior las representa dentro de los edificios, sin cambiar la economía.
- Camisetas por lugar de trabajo/operación: almacén rojo, maderería café, granja verde, agua azul, comprador beige e inmigrante ocre. Blanco desempleado y burdeos mercado quedan definidos sin crear personajes ficticios. Cargas y pool de 96 conservados; texturas combinadas generadas solo al usarse.
- Las once misiones ofrecen oro o suministros además del favor existente. Oro reutiliza tesorería; comida/madera ingresan mediante intercambio central auditado, respetando capacidad compartida, reservas, recepción, empleo, conexión y demolición.
- Suministros sin espacio quedan pendientes por ID de misión, persistentes e independientes del historial acotado. Crónicas ofrece «Recibir suministros pendientes», admite recepción parcial y distingue recibido/pendiente; muestra oro recibido separado del saldo neto de la misión.
- Compatibilidad: extensión opcional del guardado 10; no se recalculan términos de misiones antiguas ni se conceden premios retroactivos. Sin beneficios nuevos por favor alto, ramas, commits, push ni publicación.
- Verificación original 15A-4, antes del hotfix: 454 pruebas en 41 archivos aprobadas (17 nuevas), `npm run build` correcto y `git diff --check` limpio. La comprobación visual pendiente se realizó durante el hotfix descrito a continuación.
- Hotfix de accesos (2026-11-10): trazas previas al cambio demostraron tres IDs distintos completando viajes de seis segundos, cada uno visible 2 s cargando y 1 s descargando en los mismos accesos. No era un mismo NPC lógico infinito en esa reproducción. Además, la interpolación lo estacionaba en el destino hasta el siguiente tick. Ahora solo se dibujan WalkingToSource/Carrying con distancia restante: Loading/Unloading ocurren dentro y una ruta de una casilla nunca produce un destello exterior. Reservas, mercancías, ventas, servicios y población mantienen sus transiciones existentes.
- Chrome headless con escena real y ciudad aislada: 120 s simulados, 544 IDs de cinco actividades, ningún ID visible con posición idéntica entre muestras consecutivas de 100 ms, 47 actividades de agua/llegada finalizadas, cero excepciones. Verificados corte/desvío, pausa y capturas a 1280×900 y 390×844; sin modificar partidas del jugador ni dejar instrumentación en producción.
- Validación final del hotfix: 464 pruebas/41 archivos con `npm test -- --maxWorkers=1` (10 nuevas), build y diff --check correctos. La ejecución paralela inicial también agotaba timeouts antes del hotfix; en serie pasan todas sin ampliar límites ni cambiar aserciones económicas. Persiste el aviso conocido de tamaño de Phaser. Solo se modifica el renderizador, sus regresiones y estos documentos; sin ramas, commits, push, nuevas dependencias ni publicación.

- 2026-11-09 — Etapa 15A-3: compradores reales salen vacíos, recogen comida/madera autorizada y vuelven a su vivienda; reservas domésticas persistentes agrupan el consumo.
- Mercado → cargamento registra una sola venta; cargamento → hogar entrega existencias; hogar → consumidor registra consumo. Todo conserva el libro central entero y sus reservas.
- Corregidos sprites congelados: reconciliación tras reconstruir acceso/personal, bloqueo de todas las fases y exclusión visual inmediata de Blocked; carga/descarga acotadas, finalización y limpieza del pool verificadas.
- Inmigración visible únicamente tras admisiones reales: entrada del reino o acceso del centro en partidas antiguas. La población se incorpora al aceptar la inmigración, ocupando plazas durante el viaje; llegar no vuelve a incorporarla.
- Aguadores vinculados a asignaciones reales del servicio existente, uno activo por pozo, visitas agrupadas y reparto por antigüedad; conserva cobertura, capacidad y empleados, sin inventario comercial de agua.
- Guardado 10 conserva reservas domésticas, compras, llegadas y ventanas de agua; admite esquemas 1–9. Inspector residencial muestra existencias y actividades pendientes.
- Verificación: 437 pruebas en 41 archivos, build correcto y diff --check limpio. Chrome escritorio/móvil comprobó corte/desvío, compras, llegadas, agua, pausa, recarga, cámara y reinicio sin errores ni sprites huérfanos.
- Rendimiento: reloj y rutas compartidos, candidatos de mercado cacheados, pool de 96 y culling; estrés con 400 habitantes conserva cantidades por encima del límite visual.
- Límites: agua mantiene asignación continua (las visitas no condicionan cobertura); inmigración contabilizada al aceptar; sin retorno vacío de repartidores/aguadores. Si se elimina la propia calle ocupada, se conserva el bloqueo invisible hasta reconstruirla.

- 2026-11-07 — Etapa 15A-2: comida y madera viajan físicamente de almacenes a mercados y entre almacenes en vaciado, reutilizando operaciones, rutas, reloj y sprites de 15A-1.
- Cada pedido reserva existencias en origen y capacidad en destino. La recogida transfiere al cargamento central y la descarga al destino; consumo, construcción, misiones y comercio respetan las reservas.
- Reposición periódica y de emergencia usan repartidores; los pedidos pendientes cuentan para la capacidad compartida y el límite de madera. Emergencias agrupan una reserva y no generan un viaje por comida vendida.
- Cargamentos de reparto de hasta 30 recursos, carga de un segundo simulado y cupo de ocho operaciones por origen; producción de 15A-1 mantiene sus parámetros.
- Vaciado y demolición consideran operaciones pendientes y en tránsito; solicitar demolición de un almacén frena nuevas recepciones y permite terminar sus salidas.
- Guardado 9 reconstruye reservas de origen/destino y valida cargamentos vacíos antes de recoger o llenos después. Mantiene compatibilidad con los esquemas 1–8.
- Inspectores muestran pedidos en camino, reservas y reparto; sprites separados ligeramente dentro de la calle para distinguir cargas simultáneas. Canvas, pool de 96 y culling conservados.
- Verificación: 416 pruebas aprobadas en 39 archivos. Chrome comprobó ambos flujos en escritorio/móvil, pausa y entregas fuera de cámara. Pendientes: comercio exterior físico, retornos y reasignación automática de cargas bloqueadas.

- 2026-11-07 — Etapa 15A-1: granjas y campamentos entregan mediante cargamentos reales y transportistas visibles; el almacén recibe únicamente al terminar la descarga.
- `Logistics` usa los inventarios centrales en enteros de 1/150, reservas de destino y estados Loading/Carrying/Unloading/Blocked; producción y tránsito suman al total, pero no están disponibles para consumo, comercio ni construcción.
- Rutas BFS entre accesos del perímetro, puentes por su eje y caché por topología; un corte recalcula desde la posición confirmada o conserva la carga bloqueada.
- Phaser representa el modelo con sacos/troncos, interpolación, animación, culling y pool limitado a 96 imágenes; la simulación continúa fuera de cámara y por encima del límite visual.
- Guardado 8: cargas, fases, posiciones, rutas compactas compartidas y reconstrucción de reservas; compatible con esquemas 1–7 y expansión de mapas antiguos.
- Demolición protegida: solicitarla detiene nuevos despachos del productor o al destino; esperar las entregas y volver a solicitar. Cancelar modo reactiva los despachos.
- Verificación 15A-1: 399 pruebas aprobadas, build correcto y diff --check limpio; Chrome comprobó comida/madera, movimiento, pausa e inspector en escritorio/móvil. Sin dependencias, ramas, commits, push ni publicación.
- Pendiente 15A-2: transporte de mercados/comercio; retorno y reasignación de transportistas. Una carga bloqueada conserva su destino reservado hasta recuperar acceso, permisos y personal.

- 2026-11-04 — Tarea 00 implementada: base técnica con Vite, TypeScript y Phaser.
- 2026-11-04 — Tarea 01 implementada: mapa verde con cuadrícula de 20 × 20 casillas.
- 2026-11-04 — Tarea 02 implementada: selección persistente con clic izquierdo y cambio de casilla.
- 2026-11-04 — Tarea 03 implementada: menú Casa, Camino y Cancelar construcción; herramienta activa hasta cancelarla.
- Modelo de ocupación independiente de Phaser: una construcción por casilla; se rechazan solapamientos y posiciones inválidas.
- Gráficos por código y vista previa semitransparente; indicador rojo en casillas ocupadas.
- Se conservan selección, resaltado temporal y panel X/Y (0–19); el estado distingue disponible u ocupada con el nombre de la construcción.
- Mapa y construcciones se ajustan al redimensionar; datos en memoria, sin guardado.
- Verificación: `npm run build` correcto; pruebas locales de las 400 casillas, solapamientos, límites y gráficos dentro de una casilla correctas.
- 2026-11-04 — Corrección visual: amarillo y vista previa comparten la casilla del cursor; amarillo limitado al modo construcción y limpiado al salir o cancelar, sin afectar la selección azul.
- Verificación de la corrección: `npm run build` y prueba local de eventos de movimiento, clic, salida y cancelación correctos; sin nuevas dependencias.
- 2026-11-04 — Tarea 04 implementada: Granja, Leñador, Almacén y Mercado, conservando Casa y Camino.
- Catálogo central de tipos y nombres: genera el menú y alimenta el panel; dibujos específicos registrados por tipo.
- Granja con cultivos, Leñador con árbol y troncos, Almacén con portón doble y Mercado con toldo a rayas.
- Se reutilizan ocupación y colocación múltiple de una casilla; consulta muestra nombre y coordenadas.
- Correcciones del cursor, indicadores verde/rojo, selección y cancelación sin cambios.
- Entrega 04 sin costos, producción, economía, población, conexiones de caminos ni dependencias nuevas.
- Verificación de 04: `npm run build` correcto; pruebas locales de seis tipos, múltiples colocaciones, solapamientos, gráficos y transparencia correctas.
- 2026-11-04 — Tarea 05 implementada: Centro de Aldea gratuito de una casilla, único en el modelo y deshabilitado en el menú tras colocarlo.
- `RoadConnections` calcula BFS desde el centro: solo caminos ortogonales; edificios adyacentes a caminos alcanzables quedan conectados y no transmiten la conexión.
- El centro funciona sin caminos; edificios sin acceso muestran un punto ámbar discreto y el panel indica «Conectado» o «Sin conexión».
- Conexiones recalculadas tras cada construcción; indicadores conservados al redimensionar; cursor, selección y cancelación mantienen sus reglas.
- Sin recursos, producción, población, ciudadanos, economía ni dependencias nuevas; no se implementó la etapa 06.
- Verificación de 05: `npm run build` correcto y 9 pruebas en `node --test tests/roadConnections.test.ts` aprobadas (centro único, diagonales, cortes, bucles y conexión tardía).
- 2026-11-04 — Mejora visual de caminos: máscara N/E/S/O de cuatro bits para los 16 patrones, desde camino aislado hasta cruce completo.
- Superficie continua hasta el borde compartido, conservando colores; el redibujado existente actualiza el nuevo camino y sus vecinos inmediatamente.
- Vista previa reutiliza el dibujo y la máscara; BFS, selección e indicadores verde/rojo conservan su funcionamiento.
- Verificación: `npm run build` correcto y 12 pruebas aprobadas con `node --test tests/roadAppearance.test.ts tests/roadConnections.test.ts`; sin nuevas dependencias ni funciones posteriores.
- Pendiente: prueba visual y aprobación del usuario; sigue la advertencia de tamaño de Phaser; proyecto sin publicar.

- 2026-11-04 — Etapa 06 implementada: oro, comida y madera iniciales en 0; economía independiente de Phaser en `src/economy/Economy.ts`.
- Producción por edificio conectado: Granja +2 comida/s, Leñador +2 madera/s, Mercado +1 oro/s; restantes tipos y desconectados producen 0.
- Tasas acumuladas mediante `RoadConnections`, recalculadas tras construir; conectar edificios existentes activa su producción.
- Un único ciclo de escena acumula milisegundos y entrega recursos cada segundo; se retira al cerrar la escena.
- Barra superior HTML fuera del canvas con cantidades y tasas; distribución flexible y adaptable al ancho disponible.
- Sin costos, trabajadores, consumo, límites, niveles, guardado ni funcionalidades posteriores; controles conservados.
- Verificación: `npm run build` correcto y 18 pruebas aprobadas (6 económicas y 12 previas); sin dependencias nuevas.
- Pendiente: comprobación visual/manual y aprobación del usuario; persiste advertencia de tamaño de Phaser. No se avanzó a 07 ni se publicó.
- 2026-11-04 — Etapa 07 implementada: «Zona residencial» reemplaza Casa; el identificador interno house se conserva como solar de una casilla.
- Solares vacíos con estacas; primera familia activa una choza sencilla, máximo 4 habitantes por solar; selección muestra estado, habitantes y conexión.
- Inmigración cada 5 s: hasta 2 habitantes distribuidos entre solares conectados, limitada por espacio, vacantes y reserva de comida para 5 s de toda la población resultante.
- Population mantiene habitantes y asigna empleo automáticamente; puestos conectados: Granja 4, Leñador 3, Mercado 3 y Almacén 2.
- SettlementSimulation coordina producción, consumo e inmigración en un único ciclo; consumo de 0,1 comida/habitante/s, redondeado a décimas y limitado a cero.
- Panel HTML flexible fuera del canvas: población, capacidades residencial total/conectada, puestos, ocupados, desempleados, vacantes y consumo.
- Producción de etapa 06 independiente del empleo; sin mortalidad, emigración, servicios, costos, impuestos, dependencias nuevas ni funcionalidades posteriores.
- Verificación: npm run build correcto y 30 pruebas aprobadas (12 nuevas); pendiente comprobación visual/manual y aprobación del usuario.
- Persiste advertencia conocida de tamaño de Phaser; sin publicación ni avance a etapa 08.

- 2026-11-04 — Etapa 08A implementada: población activa = 50 % de habitantes, redondeada hacia abajo; empleados + desempleados = población activa; tasa sobre activos, 0 % si no hay activos.
- Asignación central automática por edificio conectado, limitada por activos y capacidad; puestos conservados: Granja 4, Campamento maderero 3, Mercado 3, Almacén 2.
- Nombre visible «Campamento maderero», conservando el identificador lumberjack.
- Inmigración sin requisito de vacantes: atractivo 0–100 combina vivienda conectada (35), reserva de comida (40), oportunidades laborales (25) y penalización progresiva por desempleo.
- Evaluación determinista cada 5 s; crédito fraccionario regula hasta 2 llegadas por evaluación. Con 60 % de desempleo, sin espacio conectado o sin comida suficiente, se detiene.
- Parámetros en populationRules; se conserva la reserva alimentaria de 5 s, recursos iniciales en 0, consumo de 0,1/habitante/s y producción independiente de empleados.
- Interfaz HTML flexible muestra población, activos, empleados, desempleados, porcentaje y atractivo; nuevos empleos conectados reasignan trabajadores inmediatamente.
- Verificación: npm run build correcto, 36 pruebas aprobadas y git diff --check sin errores; simulación reproducible con 1 granja: 10 habitantes, 5 activos y 1 desempleado a los 30 s.
- Pendiente validación visual/manual; persiste aviso conocido de tamaño de Phaser. Sin dependencias nuevas, salarios, inventarios, cambios visuales ni avance a 08B.

- 2026-11-04 — Etapa 08B implementada: producción = máximo × empleados/capacidad; Granja 2 comida/4, Campamento maderero 2 madera/3, Mercado 1 oro/3; Almacén no produce.
- Empleados y capacidades reutilizados de Population; sin segundo asignador. Edificios desconectados o sin empleados producen 0; nunca se supera el máximo.
- SettlementSimulation recalcula conexiones → empleo → producción al construir, y actualiza las tasas tras inmigración/reasignación dentro del único ciclo existente.
- Reserva inicial configurable en economyRules: 20 comida, 0 oro y 0 madera, concedida solo al crear Economy para una partida nueva.
- Estado económico, población, mapa y reloj conservados en la escena al reconstruir su interfaz; recalcular y redimensionar no conceden recursos.
- Precisión mediante enteros en unidades de 1/30: mitades, tercios y consumo de décimas exactos; cantidades con hasta 2 decimales y tasas con hasta 3 solo en presentación.
- Selección de productores muestra empleados/capacidad y productividad porcentual; se mantiene la interfaz y las reglas migratorias de 08A.
- Verificación: npm run build correcto, 43 pruebas aprobadas y git diff --check sin errores; incluye arranque, conexión tardía, reasignación, reserva única y acumulación prolongada de fracciones.
- Pendiente comprobación visual/manual; continúa aviso conocido de tamaño de Phaser. Sin dependencias nuevas, almacenamiento, distribución, ventas reales, salarios ni avance de etapa.

- 2026-11-04 — Etapa 08C implementada: inventario propio por almacén, comida/madera con capacidad compartida de 300; operación exige conexión al centro y al menos 1 empleado.
- Inventories centraliza transferencias atómicas: valida origen, destino, recurso, red, disponibilidad y capacidad, con precisión entera de 1/30 y sin duplicaciones.
- Storage conserva inventarios y reparte cada entrega entre almacenes operativos de la misma red BFS; si el lote completo no cabe, no se almacena y se muestra bloqueo.
- Economía reutiliza producción laboral y ciclo existentes; oro provisional del Mercado sin cambios. Totales de comida/madera derivados únicamente de reserva e inventarios reales.
- Reserva inicial separada de 20 comida: se consume primero, luego comida de almacenes operativos; no se regenera ni se copia al construir. Comida inaccesible no habilita inmigración.
- Solución mínima de arranque en el asignador existente: priorizar 1 empleado al primer almacén conectado y 1 a la primera granja, sin crear población ni otro sistema laboral.
- Interfaz HTML conserva distribución flexible: reserva, comida disponible, bloqueo; selección de almacén muestra inventario, capacidad usada/libre, empleados y conexión.
- Verificación: npm run build correcto, 56 pruebas aprobadas y git diff --check sin errores; secuencia de saturación/ampliación verificada en simulación; pasos en docs/PRUEBAS_08C.md.
- Pendiente validación visual/manual; persiste aviso conocido de tamaño de Phaser. Sin dependencias nuevas, ventas, salarios, demolición, transportistas ni avance a 08D.

- 2026-11-04 — Etapa 08D implementada: inventario de comida por mercado (100), operativo con conexión y al menos 1 empleado; reposición configurable cada 5 s desde almacenes operativos de la misma red.
- Transferencias reutilizan Inventories; sin duplicaciones, inventarios negativos ni consumo directo de almacenes. Totales globales incluyen reserva, almacenes y mercados, incluso temporalmente inactivos.
- MarketCoverage calcula BFS separado del renderizado: máximo 6 casillas viales, compartida = 1; sin diagonales ni atajos por edificios/centro. Se prioriza el mercado cercano con existencias.
- Cada vivienda consume hasta 0,1 comida/habitante/s desde mercados en cobertura; demanda no satisfecha no consume ni paga. Otro mercado cubierto puede completar una entrega parcial.
- Inmigración filtrada por suministro local: previsión compartida de 5 s para residentes actuales/nuevos sin duplicar disponibilidad; una vivienda sin suministro no bloquea otras abastecidas.
- Reserva inicial puente hasta operar el primer mercado; después queda cerrada permanentemente, sin regenerarse ni desaparecer su remanente. Arranque prioriza almacén, granja, mercado y completar la primera granja.
- Eliminado oro pasivo: tesorería recibe 1 oro por comida efectivamente entregada desde mercados; ingresos provisionales hasta salarios, presupuestos de hogares e impuestos.
- Interfaz muestra mercados (comida, empleo, cobertura, estado), suministro residencial, reserva abierta/cerrada e ingresos reales/s; pruebas manuales en docs/PRUEBAS_08D.md.
- Verificación: npm run build correcto, 72 pruebas aprobadas y git diff --check sin errores; ciudad de referencia simulada 120 s, solares abastecidos crecen y solar a 7 tramos permanece vacío.
- Pendiente validación visual/manual; persiste aviso conocido de tamaño de Phaser. Sin dependencias nuevas, transporte animado, mortalidad, emigración, felicidad ni avance a otra etapa.

- 2026-11-04 — Etapa 08E implementada: configuración individual de almacenes (aceptar comida/madera) y mercados (autorizar comida), habilitada por defecto para sus productos permitidos.
- Products centraliza identificadores, nombres y productos autorizables; solo food y wood, sin agregar productos futuros ni tratar el oro como mercancía.
- Inventories conserva permisos por inventario y valida entradas a almacenes y entradas/salidas autorizadas de mercados; cambios no modifican existencias, capacidad ni totales.
- Producción busca almacenes operativos que acepten su producto y tengan espacio; sin destino válido se mantiene bloqueada. Rechazar entradas permite retirar existencias anteriores hacia mercados.
- Mercados con comida deshabilitada conservan inventario, sin reponer ni vender; hogares e inmigración buscan otros mercados autorizados dentro de cobertura, sin ingresos por productos deshabilitados.
- Casillas HTML por edificio con estado explícito, etiquetas amplias y distribución flexible; controles reutilizados durante actualizaciones, conservando foco y selección. Configuración en memoria, sin guardado nuevo.
- Sin cambios en consumo, empleo, capacidades 300/100 ni intervalo de reposición; sin reinicios de relojes, dependencias, cuotas, prioridades de almacenamiento, transportistas ni avance de etapa.
- Verificación: npm run build correcto, 85 pruebas aprobadas (13 nuevas) y git diff --check sin errores. Pasos manuales en docs/PRUEBAS_08E.md; pendiente validación visual del usuario.
- Persiste la advertencia conocida del tamaño de Phaser; no se publicó ni se avanzó sin autorización.

- 2026-11-04 — Corrección posterior a 08E, sin nueva etapa: con dos activos se ocupaban almacén y granja antes del mercado; la previsión por vivienda quedaba vacía y el atractivo en 0 aunque hubiese alimentos almacenados.
- employmentRules configura mínimos mercado/almacén/granja, recuperación productiva con escasez y puestos sobrantes para servicios antes del campamento; empates por fila y columna.
- Prioridad esencial a almacén con comida y mercado autorizado con cobertura útil; otro mercado obtiene mínimo si cubre habitantes distintos y quedan activos, sin superar capacidades.
- La reserva se cierra cuando un mercado autorizado y empleado tiene comida real, no al contratarlo vacío; no se regenera ni duplica.
- Si la previsión normal falla, recuperación limitada a 1 llegada por evaluación por debajo de 12 habitantes, con comida accesible real y cobertura autorizada; se conservan consumo, empleo, límites migratorios y permisos de productos.
- Sin comida, dos activos pueden producir/almacenar antes de distribuir; no se vende ni produce sin empleados, ni se consume directamente de almacenes.
- Interfaz muestra por qué un mercado está inactivo, vacío o deshabilitado, y por qué el atractivo es 0 o la llegada está limitada.
- Verificación: npm run build correcto y 98 pruebas aprobadas (13 nuevas), incluida ciudad de 4 habitantes, 23 puestos, dos mercados y 77,5 comida; conservación exacta y recuperación con reserva agotada.
- Causa, desempates y pasos en docs/RECUPERACION_ECONOMICA.md; pendiente comprobación visual. Persiste aviso conocido del tamaño de Phaser; sin dependencias ni funcionalidades de otra etapa.

- 2026-11-04 — Etapa 08T. npm test ejecuta la suite con Vitest 5.1 como dependencia de desarrollo y reutiliza Vite 8 y TypeScript.
- Migradas las 98 pruebas existentes y agregados tres casos de regresión para la cadena alimentaria y los límites independientes de una transferencia.
- Las dos integraciones verifican saldos e ingresos en el ciclo de distribución y la recuperación de la ciudad con mercados inactivos.
- La suite usa modelos independientes de Phaser. La revisión visual de la escena se mantiene como prueba manual.
- docs/PRUEBAS_AUTOMATIZADAS.md explica cómo ejecutar y ampliar la suite. Las guías anteriores usan los comandos de Vitest.
- Verificación de 08T. npm test ejecutó 101 pruebas en ocho archivos, con 101 aprobadas y cero fallidas. npm run build correcto.

- 2026-11-04 — Etapa 08F. SettlementSimulation aplica la pausa y las velocidades ×1, ×2 y ×3 al delta antes de ejecutar los pasos de un segundo simulado. Producción, asignación laboral, reposición, consumo, ventas e inmigración conservan sus tasas e intervalos base.
- La pausa descarta el tiempo real recibido mientras está activa y conserva la fracción de segundo previa y la velocidad elegida. La escena permite seleccionar edificios y consultar paneles. La construcción y la edición de permisos se suspenden hasta reanudar.
- EconomicHistory conserva en memoria los últimos 200 eventos confirmados por defecto. Cada evento tiene ID creciente, tiempo simulado, recurso, cantidad entera en unidades de 1/30, extremos, operación, resultado y saldos cuando corresponden.
- Inventories registra una fila por traspaso confirmado con saldos de ambos inventarios. La producción se registra al crear un lote admitido y el consumo al retirar comida de la reserva o del mercado para la vivienda. La venta identifica la vivienda y el crédito de oro efectivamente aplicado a la tesorería.
- El panel HTML filtra por recurso y edificio seleccionado y presenta los registros más recientes primero. La lectura del historial es independiente del estado económico.
- Verificación de 08F. npm test ejecutó 112 pruebas en nueve archivos, con 112 aprobadas y cero fallidas. Se conservaron las 101 previas y se añadieron 11 casos. npm run build correcto, con el aviso conocido de tamaño del paquete de Phaser. Comprobación visual pendiente, con pasos en docs/PRUEBAS_08F.md.

- 2026-11-04 — Corrección de interfaz de 08F. El canvas, el inspector de casillas y el historial tienen áreas reservadas. Seleccionar edificios, mostrar permisos, filtrar o plegar el historial no cambia sus dimensiones ni su posición.
- El inspector reúne los datos de cualquier casilla y, cuando corresponde, los permisos del almacén o mercado. Los controles de productos se siguen generando desde el catálogo para admitir futuras ampliaciones.
- El inspector y el historial tienen desplazamiento interno. El historial abre desplegado y conserva su espacio al plegarlo. En ventanas estrechas, los paneles pasan debajo del mapa.
- Verificación en Chrome a 1280 × 720 y 390 × 844 con selección de vivienda, almacén y mercado, cambio de permiso, filtros y movimientos reales. Se comprobaron las dimensiones y la posición del canvas y de los paneles. npm test aprobó 112 pruebas, con cero fallidas. npm run build correcto, con el aviso conocido de tamaño del paquete de Phaser.

- 2026-11-04 — Etapa 09A. ConstructionCosts centraliza los precios y la tarifa de demolición de 5 oro. La partida empieza con 150 oro, 50 madera en una reserva de construcción independiente y la reserva alimentaria existente de 20.
- SettlementSimulation valida casilla, recursos y pausa antes de construir. El cargo se aplica una sola vez tras colocar el edificio. La madera se retira primero de la reserva y luego de almacenes operativos conectados.
- El menú muestra precios y faltantes. La vista previa incorpora disponibilidad de recursos y el inspector muestra el edificio y el precio de la demolición antes de confirmar. La barra distingue madera total, utilizable y de reserva.
- Demoler vuelve a validar el objetivo y el saldo. Protege el Centro de Aldea, los solares habitados y los inventarios con existencias. Las eliminaciones válidas actualizan conexiones, empleo, producción, capacidad residencial y cobertura, y retiran los inventarios vacíos.
- El historial distingue oro de construcción, madera consumida por origen y oro de demolición. Conserva saldos exactos y registra solamente los cargos completados.
- Verificación de 09A. Vitest aprobó 129 pruebas, con cero fallidas y 17 casos nuevos. npm run build correcto, con el aviso habitual del tamaño del paquete de Phaser. Chrome verificó compras, faltantes, cancelación, demolición, auditoría y dimensiones fijas a 1280 × 720 y 390 × 844.

- 2026-11-04 — Correcciones de 09A. El corte vial no pausaba el reloj. Se reprodujo un avance de 5 a 15 segundos sin producción, ventas ni cambios de inventario. Faltaba registrar la demanda no satisfecha, y la tasa de venta anterior seguía visible hasta el siguiente ciclo.
- Distribution registra el déficit acumulado y la comida sin entregar por vivienda en el último ciclo. El déficit es histórico y la reconexión reanuda el consumo del ciclo actual. Se conservan las existencias inaccesibles y la inmigración sigue dependiendo del abastecimiento y de los solares conectados.
- El modo Vaciar almacén bloquea entradas sin modificar permisos. Cada segundo simulado, después de la reposición de mercados, se trasladan existencias a almacenes operativos de la misma red que no estén en vaciado, según permisos y capacidad. El inspector muestra el inventario restante y el motivo del bloqueo.
- La demolición residencial muestra cuántos habitantes abandonarán la ciudad. Al confirmar se retira el solar y el recálculo existente actualiza la población, los puestos asignados y la demanda. El costo sigue siendo 5 de oro. Cancelar conserva habitantes y recursos.
- Verificación. npm test aprobó 137 pruebas, con cero fallidas y ocho casos nuevos. npm run build correcto, con el aviso habitual de tamaño del paquete de Phaser. Chrome comprobó el reloj y el déficit tras cortar la vía, los controles de vaciado, la confirmación residencial y la estabilidad del canvas.

- 2026-11-05 — Etapa 09B. Calendario ficticio de 24 horas y 12 días por año. Empieza en Año 1, Día 1, 00:00. Una hora dura 25 segundos simulados y el día dura 600, 300 o 200 segundos reales a ×1, ×2 o ×3. La interfaz indica Día entre 06:00 y 17:59.
- El reloj usa el acumulador de SettlementSimulation. La pausa conserva la fracción previa y la pestaña oculta o suspendida descarta el tiempo de fondo y el primer delta de vuelta. Las tasas visibles y los tiempos de los movimientos se expresan en el calendario del juego.
- Se devengan 0,10 oro por trabajador empleado y hora. El mantenimiento por hora se calcula sobre las construcciones existentes según OperatingCosts, incluso desconectadas. Ambos se prorratean por segundo y se liquidan después de las ventas al cierre de hora, con prioridad para salarios.
- Treasury mantiene precisión entera para los pagos y conserva el saldo en cero como mínimo. El historial distingue cargos efectivos e impagos por categoría. Los impagos se acumulan para consulta y no se cobran retroactivamente.
- La interfaz muestra ingresos, salarios, mantenimiento y neto estimado por hora. PLAN.md documenta las duraciones y la estructura de cuatro estaciones futuras de tres días.
- Verificación. npm test aprobó 149 pruebas, con cero fallidas y 12 casos nuevos. npm run build correcto, con el aviso conocido de tamaño del paquete de Phaser. Chrome comprobó pausa, cambio real de pestaña, liquidación, historial y dimensiones estables a 1280 × 720.

- 2026-11-05 — Etapa 09C. Políticas baja (5 %), normal (10 %, inicial) y alta (20 %) sobre una base provisional de 1 oro por habitante y hora. La tasa se aplica al siguiente segundo simulado y se liquida al cierre de hora, antes de salarios y mantenimiento.
- El atractivo aplica una sola vez +10, 0 o −20 puntos, limitado a 0–100 y sujeto a las condiciones existentes de vivienda, comida y desempleo.
- Los mercados aceptan comida y madera por defecto, con permisos independientes y 100 unidades compartidas. Reponen cada 5 segundos simulados desde almacenes operativos conectados. Si hay madera disponible, se le da espacio hasta alcanzar la mitad de la capacidad y puede aprovechar el espacio sobrante.
- Los hogares consumen hasta 0,5 madera por habitante y hora desde mercados en cobertura. El inspector informa la disponibilidad y el faltante del último ciclo. Se conservan las reglas de comida y la madera no condiciona la inmigración.
- La escala de inventarios pasa a 1/150 para conservar fracciones exactas. El historial distingue impuestos y ventas de comida o madera. Los ingresos municipales de 1 oro por unidad consumida y la base tributaria son provisionales hasta incorporar presupuestos familiares.
- Verificación. npm test aprobó 166 pruebas, con cero fallidas y 17 casos nuevos. npm run build correcto, con el aviso habitual de tamaño de Phaser. Chrome comprobó el selector, la tasa prevista, el permiso independiente de madera, el faltante residencial, el registro de impuestos y el canvas estable.

- 2026-11-05 — Etapa 10A-1. El atractivo depende de abastecimiento, bienestar, empleo e impuestos. La capacidad libre se muestra aparte y el plan alimentario por vivienda sigue controlando la admisión.
- La lista de espera se evalúa cada cinco segundos simulados, admite hasta la mitad de la población redondeada hacia arriba con un mínimo de cuatro plazas y pierde una persona por hora con atractivo sostenido en cero. Se da prioridad a quienes ya esperan.
- Wellbeing calcula felicidad desde las entregas de comida y madera, empleo e impuestos, con cambios graduales. El promedio general pondera por habitantes y las viviendas vacías se excluyen. Sin habitantes, el valor neutral es 70.
- Una vivienda por debajo de 40 durante dos horas del juego puede perder un habitante. Se registra como evento de población y se recalcula el empleo. La ciudad permite como máximo una salida por hora y retoma las admisiones tras dos horas y con felicidad general de al menos 45.
- El resumen y el inspector muestran bienestar, suministros y causas de descontento. El historial de población comparte el espacio fijo del panel de auditoría.
- Verificación. npm test aprobó 177 pruebas, con cero fallidas y 11 casos nuevos. npm run build correcto, con el aviso habitual del tamaño de Phaser. Chrome verificó la cola con la ciudad llena, la admisión al abrir un solar, la pausa, la salida sostenida y el canvas estable a 1280 × 720.

- 2026-11-05 — Corrección de formato numérico. formatNumber centraliza la presentación en español con hasta dos decimales y un guion para valores no finitos. Se usa en importes, saldos, tasas, inspectores y eventos de población.
- El historial convierte desde la escala entera de cada movimiento al presentar el dato. La revisión y las pruebas de operaciones repetidas no detectaron deriva en tesorería o inventarios. Se conservaron las escalas y los cálculos económicos.
- Verificación. npm test aprobó 181 pruebas, con cero fallidas. npm run build correcto, con el aviso conocido de tamaño de Phaser. Chrome verificó los saldos visibles y las dimensiones fijas a 1280 × 720 y 390 × 844.

- 2026-11-05 — Etapa 10A-2 sobre 10A-1. El Pozo cuesta 20 oro y 10 madera, tiene un puesto asalariado de aguador y cuesta 0,05 oro/h de mantenimiento. Un pozo operativo abastece hasta 20 habitantes a seis casillas de camino.
- WaterService reutiliza la cobertura vial de mercados y asigna cupos sin duplicar residentes. La demolición recalcula el servicio, el empleo y el mantenimiento. El agua se representa como servicio residencial, sin inventario comercial.
- El bienestar pondera comida, madera, agua, empleo e impuestos. El panel de necesidades promedia hasta una hora del juego y muestra cobertura y habitantes equivalentes afectados. El inspector muestra el agua asignada en el momento.
- Voces de la aldea conserva hasta 50 mensajes de plantillas locales con filtros por tono. Las publicaciones se espacian al menos 15 segundos simulados y el mismo tema espera tres horas del juego. Los mensajes permiten seleccionar viviendas existentes y se conservan cuando se demuelen.
- Verificación. npm test aprobó 192 pruebas, cero fallidas y 11 nuevas. npm run build correcto, con el aviso habitual de tamaño de Phaser. Chrome verificó suministro, filtros, selección, demolición y canvas estable a 1280 × 720 y 390 × 844.

- 2026-11-05 — Etapa 10B. Cuatro niveles residenciales con capacidades de 4, 6, 8 y 12. La inmigración, la previsión de comida y la capacidad libre usan el nivel real de cada vivienda.
- La mejora requiere 60 segundos simulados continuos con felicidad de al menos 80, suministros completos y desempleo municipal de hasta 25 %. El deterioro requiere 60 segundos continuos con felicidad menor a 40 o falta de un suministro. Pausa y velocidad siguen el reloj compartido.
- El deterioro reduce un nivel por vez. El excedente abandona la ciudad y se actualizan empleo, consumo e impuestos. El inspector muestra nivel, capacidad, bienestar y progreso. Los cambios generan opiniones con cadencia limitada.
- Se añadieron cuatro ilustraciones SVG originales y un catálogo de texturas sustituibles por PNG. Chrome verificó las cuatro texturas reales de Phaser, la selección, el progreso y el canvas estable a 1280 × 720 y 390 × 844.
- Verificación. npm test aprobó 202 pruebas, cero fallidas y 10 nuevas. npm run build correcto, con el aviso habitual de tamaño de Phaser.

- 2026-11-05 — Etapa 10C. HUD compacto con tarjetas de oro, comida, madera, población, felicidad, balance estimado y fecha del juego. El tamaño del canvas depende de la ventana. Los paneles y el menú tienen espacios reservados.
- El inspector usa filas de etiqueta y valor con scroll interno. Muestra progreso residencial incluso en reposo y aloja permisos de productos, vaciado y confirmaciones de demolición. En pantallas estrechas, los paneles quedan debajo del mapa.
- Las pestañas Finanzas, Necesidades, Voces de la aldea e Historial comparten una región fija. Voces e Historial conservan los filtros y mantienen la fila de lectura al llegar novedades. Necesidades muestra la cobertura de comida, madera y agua con barras.
- Finanzas desglosa ventas efectivas de comida y madera, impuestos, salarios, mantenimiento y neto estimado en oro por hora del juego. El desglose usa las mismas entregas que originan los ingresos. Las tasas y reglas de la simulación se conservan.
- Las alertas se agrupan por problema y se consultan desde el HUD. El menú tiene siete categorías de construcción con espacio previsto para miniaturas. Cambiar de categoría cancela el modo de construcción activo.
- Verificación. npm test aprobó 204 pruebas, con cero fallidas y dos nuevas. npm run build correcto, con el aviso conocido por el tamaño del paquete de Phaser. Chrome comprobó a 1280 × 720 y 390 × 844 la estabilidad del mapa y los paneles, los permisos de almacén y mercado, las ventas efectivas en Finanzas y la conservación del scroll del historial a ×3.

- 2026-11-05 — Guardado y carga de partidas. El menú Partida ofrece tres ranuras locales con fecha y formato versionado en localStorage. Guardar sobre otra ranura ocupada exige confirmación.
- El autoguardado se ejecuta cada 60 segundos reales mientras la partida está abierta, incluso en pausa. Usa la ranura activa o la primera vacía. Si las tres están ocupadas y no hay una activa, espera una elección explícita. Nueva partida conserva las ranuras.
- El estado incluye semilla, dimensiones, versión de terreno, construcciones, selección, inventarios, tesorería, población, empleo, bienestar, voces, auditoría y configuración. Guarda también las fracciones del reloj, los devengos, los ciclos de reposición e inmigración y los contadores de evolución residencial.
- La carga valida una sesión independiente y reconstruye conexiones, cobertura y producción prevista antes de sustituir la partida activa. Retoma desde el tiempo simulado guardado, sin cobrar ni producir al cargar. Los fallos de lectura o escritura muestran un aviso y conservan la partida activa.
- Verificación. npm test aprobó 211 pruebas con cero fallidas y siete nuevas. npm run build correcto, con el aviso conocido por el tamaño del paquete de Phaser. Chrome comprobó las tres ranuras, el cierre y reapertura completos, el rechazo de un guardado dañado, Nueva partida sin borrar ranuras y el autoguardado a los 60 segundos en pausa. El diálogo conserva las dimensiones del mapa.

- 2026-11-05 — Etapa 11A. Alpha 0.1 incluye favicon original local y etiqueta en el HUD y la pestaña. La publicación web queda aplazada. El desarrollo continúa en `main` y Vite usa la ruta raíz `/`.
- Los almacenes configuran la recepción y el envío a mercados por producto. El vaciado a otro almacén y el gasto de madera en construcción conservan sus reglas. Los guardados anteriores habilitan ambos envíos al cargar.
- Voces de la aldea suma 69 plantillas y conserva las 13 anteriores. Los mensajes normales rotan por tema y vivienda. Los eventos residenciales comparten el intervalo general y conservan su propio enfriamiento.
- Verificación. `npm test` y `npm run build` comprueban la Alpha. La prueba de compilación valida el HTML, el favicon, CSS y JavaScript con rutas desde la raíz.

- Etapa 12A. Mundo de pasto de 100 × 100. La partida nueva coloca el Centro de Aldea en (50, 50) y la cámara empieza con una vista de 20 × 20.
- WASD, flechas y arrastre desplazan el mapa. La rueda cambia el zoom entre 0,5 y 2,5 veces el inicial. **Centrar aldea** conserva el zoom. El clic para seleccionar, construir o pedir demolición se confirma al soltar el botón izquierdo sin arrastre.
- El terreno prepara su cuadrícula una vez. El dibujo de construcciones se actualiza por región. La simulación recorre las casillas ocupadas en el mismo orden que antes y se mantiene independiente de la cámara.
- El guardado conserva posición, zoom y mapa completo. Las partidas de 20 × 20 se amplían al cargarlas y mantienen coordenadas, edificios, inventarios, población y reloj.
- Verificación. `npm test` aprobó 227 pruebas con cero fallidas. `npm run build` pasó con el aviso habitual de tamaño de Phaser. Chrome sin interfaz comprobó el centro inicial, arrastre sin gasto, construcción, zoom, flechas, HUD fijo y guardado de la cámara.

- Etapa 12B. Las nuevas partidas generan un mundo de 100 × 100 con semilla reproducible desde **Partida**. El terreno incluye pasto, pradera, árboles, bosques, rocas, un río continuo, barrancos y montañas. Se valida la zona inicial y su expansión.
- **Demoler** permite limpiar un árbol por 3 oro, bosque por 8 y rocas por 6 con confirmación. Mantiene el suelo, registra el gasto y actualiza la textura de la región. Los terrenos permanentes quedan protegidos.
- El guardado conserva semilla, terreno y cámara. Los mapas de pasto anteriores conservan sus casillas. La copia temporal de la pestaña permite recuperar el terreno y los cambios sin guardar al recargar, sin modificar la ranura.
- Verificación. `npm test` aprobó 240 pruebas con cero fallidas. `npm run build` pasó con el aviso habitual de tamaño de Phaser. Chrome sin interfaz verificó semillas manual y aleatoria, bloqueo de construcción, cancelación, limpieza, recarga y carga de ranuras.

- Etapa 12C. Las partidas nuevas `procedural-v2` generan un camino protegido entre el Centro de Aldea y una entrada estable en el borde. El trazado usa tierra firme, despeja obstáculos removibles y queda exento de costo inicial y mantenimiento.
- **Puente de madera** está en **Caminos**. Se elige un camino conectado en la orilla y se confirma el cruce recto completo por 15 oro y 10 madera por casilla, hasta 8 casillas. Los puentes no tienen un cargo periódico. **Demoler** retira el tramo por 5 oro por casilla y conserva el río.
- Los tableros conectan por su eje. Al retirar el único acceso se interrumpen las conexiones y la cobertura de servicios de la otra orilla. Al reconstruirlo se recuperan si el resto de la red sigue intacto.
- Los guardados restauran exactamente los segmentos protegidos, la entrada y los puentes. Las partidas de pasto y `procedural-v1` conservan su terreno y sus construcciones, y siguen sin camino exterior.
- Verificación. `npm test` aprobó 253 pruebas con cero fallidas. `npm run build` pasó con el aviso habitual de tamaño de Phaser. Chrome sin interfaz comprobó la protección del camino, el costo previo, la cancelación, la construcción, la demolición y la carga de un puente.

- Etapa 13B. Ventas de 0,10 oro por comida y 0,20 por madera realmente entregadas. El salario es de 0,40 oro por empleado y hora. El [plan](Plan.md) compara las tarifas, incluido el mantenimiento.
- Empleo. Primero se cubre un puesto por negocio elegible. Se usa personal libre y luego el excedente de los equipos más grandes. En escasez se mantienen las prioridades de servicios. El inspector indica personal, capacidad, operación y motivo de inactividad.
- Simulación de tres días. La aldea abastecida pasó de 150 a 413,84 oro y ganó 53,04 oro durante el tercer día. La aldea con diez edificios adicionales y el mercado cerrado cayó a 0. Otra aldea se recuperó desde 0 hasta 119,28 oro el primer día después de reabrir su mercado, con existencias y diez habitantes al corregir el problema.
- Verificación. `npm test` aprobó 260 pruebas con cero fallidas. `npm run build` pasó con el aviso habitual de tamaño de Phaser. Chrome sin interfaz verificó las tasas de Finanzas, los estados del inspector y que el mapa y los paneles conservaran sus dimensiones.

- Etapa 13C. Una construcción ocupa su huella completa y conserva un anclaje único para inventario, empleo y producción. Se selecciona y demuele desde cualquier casilla. La conexión parte de todo el perímetro. El [plan](Plan.md#etapa-13c-urbanismo-y-belleza-residencial) detalla huellas, costos y cobertura.
- Mapa y menú comparten SVG medievales locales. Los cuatro niveles de vivienda mantienen sus ilustraciones. Tierra, grava y piedra se unen mediante la máscara vial y los puentes dibujan el tablero según su eje.
- Jardín, parque y plaza aportan belleza a viviendas con acceso vial. Las casas avanzadas necesitan 35 o 65 puntos para evolucionar y conservar el nivel. El inspector explica las fuentes y requisitos. Necesidades muestra el promedio de hogares habitados y Voces incluye comentarios sobre su entorno real.
- Las mejoras se confirman en el inspector por 6 oro y 2 madera para grava, y 15 oro y 4 madera para piedra. Conservan la red vial y los tramos del reino quedan protegidos.
- El esquema 2 guarda las huellas y niveles de caminos. El esquema 1 carga sus construcciones compactas y sus caminos de tierra en las coordenadas originales. La belleza se reconstruye a partir del mapa. Las tres ranuras y su autoguardado conservan el flujo anterior.
- Verificación. `npm test` aprobó 279 pruebas y `npm run build` pasó con el aviso habitual de tamaño de Phaser. Chrome comprobó miniaturas, vista previa, selección con zoom, inspector, decoración, mejora de caminos y dimensiones fijas.

- Etapa 14A. Aldea → Pueblo → Villa con reconocimiento manual y un único cargo registrado por ascenso. **Crónicas** muestra rango, objetivos en vivo, desbloqueos y capítulos. El [plan](PLAN.md#etapa-14a-reconocimiento-del-asentamiento-y-crónicas) detalla umbrales y costos.
- Pueblo habilita parques y grava. Villa habilita plazas con fuente y piedra. Los requisitos se comprobaron mediante una partida simulada que construye, atrae habitantes y ahorra con las reglas vigentes.
- Cada rango tiene un capítulo y un tutorial opcional, ambos consultables por separado. **Escuchar** inicia la voz en español cuando está disponible. Se puede repetir, pausar, detener o silenciar. Al cerrar se recuperan la pausa y la velocidad previas.
- El esquema 3 conserva rango, fechas y capítulos o tutoriales vistos u omitidos. Los esquemas 1 y 2 pasan a Aldea con sus edificios, caminos y recursos intactos. Cargar una partida deja la introducción en el archivo de Crónicas.
- Verificación. `npm test` aprobó 290 pruebas y `npm run build` pasó con el aviso habitual del tamaño de Phaser. Chrome a 1280 × 720 y 390 × 844 comprobó la interfaz, la voz simulada y la alternativa de texto, la pausa, el ascenso a Pueblo y la carga sin repetir el capítulo.

- Corrección de balance inicial. Una granja produce hasta 64 comida/h con cuatro trabajadores. El consumo se mantiene en 2,5 por habitante y hora. Un pozo abastece a 30 habitantes a seis tramos viales e informa el motivo de la falta de agua.
- Los mercados cubren faltantes con entregas parciales desde almacenes operativos. Las reservas de espacio evitan que la madera desplace toda la comida. Si hay escasez, la asignación protege la cadena esencial y refuerza la granja. La migración usa cobertura reciente, reservas reales y capacidad agrícola.
- Los campamentos requieren árboles o bosque dentro de su radio. Las semillas nuevas incluyen arbolado cercano. Los mapas de pasto antiguos incorporan árboles en celdas libres y el guardado conserva las talas, los edificios y los inventarios.
- Simulación con la semilla 23. La aldea llegó a 24 habitantes a las 29 horas del juego. Solicitó Pueblo a las 198 horas y mantuvo 25 habitantes durante tres días con cobertura completa de comida y agua. El [plan](Plan.md#corrección-del-balance-inicial) recoge los valores y [las pruebas](PRUEBAS_AUTOMATIZADAS.md#crecimiento-en-un-mapa-nuevo), las cifras de crecimiento.
- Verificación. `npm test` aprobó 296 pruebas. `npm run build` pasó con el aviso habitual de tamaño de Phaser. Chrome comprobó los avisos del campamento sin árboles y de la vivienda fuera de cobertura, así como capacidad, alcance y habitantes abastecidos del pozo.

- Etapa 14B. **Crónicas → La Corona** muestra favor, tributos, crédito, gastos pendientes e historial. La primera obligación se emite el día 4 y vence el día 7. Cada emisión fija 50, 150 o 350 oro según el rango vigente.
- Crédito de 200 oro mediante saldo negativo, con amortización automática por ingresos. Los gastos obligatorios que exceden el límite quedan pendientes y se liquidan al cierre de hora con saldo positivo. Finanzas e Historial separan tributos, ofrendas e impuestos.
- El favor parte de 50. Los pagos puntuales y las ofrendas lo mejoran. Tres impagos consecutivos terminan la partida. El decreto y la destitución usan el diálogo narrativo con voz opcional. El esquema 4 conserva el estado real y da tres días de gracia a partidas anteriores.
- Las [simulaciones](PRUEBAS_AUTOMATIZADAS.md#simulaciones-de-la-corona) verifican pagos sostenibles, endeudamiento y recuperación, mantenimiento excesivo y compras ornamentales. El [plan](Plan.md#etapa-14b-la-corona) documenta plazos, montos y prioridad de pagos.
- Verificación. `npm test` aprobó 308 pruebas. `npm run build` pasó con el aviso habitual de tamaño de Phaser. Chrome comprobó decreto, voz simulada y silencio, pago único, ofrenda, saldo negativo, recarga y recuperación tras derrota a 1280 × 720 y 390 × 844.

- Corrección de inmigración. Cuando la vía normal está cerrada, una Aldea con menos de 12 habitantes y plaza conectada puede admitir una persona en una oportunidad del calendario cada ocho horas. El reloj guardado conserva la fase y las oportunidades pasadas se descartan.
- Los viajeros consumen y trabajan como residentes. Su vivienda reinicia los contadores de deterioro y descontento sostenido al recibirlos. **Necesidades** indica el tipo de admisión y el motivo. **Historial** registra las llegadas y **Voces de la aldea** las comenta con su cadencia habitual.
- La simulación de siete habitantes obtuvo su cuarto trabajador y recuperó la inmigración normal. La prueba sin suministros osciló entre cero y un habitante. El [plan](Plan.md#corrección-de-inmigración-y-emigración) recoge las reglas y [las pruebas](PRUEBAS_AUTOMATIZADAS.md#simulaciones-de-inmigración-y-emigración), los cinco escenarios.
- Verificación. `npm test` aprobó 319 pruebas y `npm run build` pasó con el aviso habitual de tamaño de Phaser. Chrome comprobó Necesidades, Historial, Voces, pausa y recarga a 1280 × 720 y 390 × 844.

- Etapa 14C. Pueblo desbloquea la Casa de Comercio de 2 × 2. Villa cuesta 800 oro. La casa y los almacenes necesitan una ruta vial hasta la entrada del reino.
- Viajes cada seis horas simuladas, con 30 unidades de carga por trabajador y hasta 60 por casa. Cada producto tiene modo, reserva y objetivo. Las casas comparten inventario y la tesorería respeta el crédito de la Corona.
- **Comercio**, el inspector, **Finanzas** e **Historial** muestran rutas, ajustes y operaciones realizadas. El guardado 5 conserva viajes y ajustes. Los mapas antiguos sin entrada exterior siguen siendo compatibles.
- El [plan](Plan.md#etapa-14c-comercio-exterior) recoge tarifas y reglas. Las [simulaciones](PRUEBAS_AUTOMATIZADAS.md#simulaciones-de-comercio-exterior) documentan siete escenarios. En el Pueblo maderero, comerciar adelantó de 103 a 95 horas el objetivo de 800 oro.
- Verificación. `npm test` aprobó 336 pruebas y `npm run build` pasó con el aviso habitual de tamaño de Phaser. Chrome comprobó el inspector, una venta de 50 madera por 24 oro, Finanzas y la recarga a 1280 × 720 y 390 × 844.

- Ajuste 14B. Llegar a favor real cero abre un plazo de 24 horas del juego. La advertencia persistente muestra el tiempo restante y permite acceder a tributos y ofrendas. Recuperar favor cancela el plazo y queda registrado.
- Vencer el plazo causa destitución por pérdida de confianza real. Comparte el bloqueo definitivo con los tres impagos. El capítulo final se puede omitir o consultar desde el resumen. La carga desde el menú exige un guardado jugable.
- Narración española automática para todas las escenas, con pausa, repetición, silencio persistente y reproducción manual si el navegador bloquea el audio. Los cambios de página y el cierre cancelan la voz anterior.
- El esquema 6 guarda advertencia, vencimiento, derrota y motivo. Los guardados anteriores con favor cero reciben un día completo desde su fecha guardada. Las recargas conservan el plazo y la derrota.
- Reglas en el [plan](Plan.md#ajuste-14b-la-ira-del-rey) y cobertura en [pruebas](PRUEBAS_AUTOMATIZADAS.md#regresión-de-la-ira-del-rey). Chrome verificó advertencia, recuperación, derrota, voz y guardados en escritorio y móvil.
- Verificación. `npm test` aprobó 353 pruebas y `npm run build` pasó con el aviso habitual de tamaño del paquete de Phaser.
- Narración global. También se lee automáticamente la invitación al tutorial. Chrome verificó las 16 páginas de introducciones y tutoriales de todos los rangos, los relatos reales y una escena genérica, respetando el silencio y cancelando la voz anterior al cambiar de página.

- Etapa 14D. Crónicas del Reino incorpora once acontecimientos con dos relatos cada uno, objetivos reales, decisiones, progreso, vencimiento y resultados. El catálogo y el motor están separados de la interfaz.
- La primera oportunidad llega a las 24 horas del juego. Las siguientes se programan cada 24–48 horas con selección determinista por semilla y estado. Solo hay una misión pendiente y cada tipo tiene enfriamiento propio.
- Se reutiliza el diálogo narrativo con voz automática. Omitir conserva la misión pendiente. Las entregas usan almacenes autorizados, las obras se verifican por casilla y las exportaciones cuentan desde la aceptación. La Corona aplica los cambios de favor.
- El esquema 7 conserva generador, misiones, decisiones, resultados y contadores comerciales. Los guardados anteriores conservan su ciudad y reciben una primera oportunidad futura. Las recompensas se entregan una vez.
- Las [simulaciones de diez días](PRUEBAS_AUTOMATIZADAS.md#crónicas-del-reino-y-simulaciones-de-misiones) con semillas 23, 24 y 1023 completaron 7, 7 y 6 misiones y mantuvieron 48 habitantes. El [plan](Plan.md#etapa-14d-crónicas-del-reino) documenta catálogo, recompensas, riesgos y frecuencia.
- Verificación. `npm test` aprobó 382 pruebas y `npm run build` pasó con el aviso habitual de tamaño de Phaser. Chrome comprobó narración, omisión, aceptación, pago único, favor, historial, pausa, velocidad y recarga en escritorio y móvil.
