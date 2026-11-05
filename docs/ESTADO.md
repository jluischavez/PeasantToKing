# Estado del proyecto

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

- 2026-11-05 — Etapa 11A. Alpha 0.1 incluye favicon original local, etiqueta en el HUD y un build con base `/PeasantToKing/`. GitHub Actions valida y publica desde `main`. El README explica la activación y verificación de Pages, y el punto de partida de `develop`.
- Los almacenes configuran la recepción y el envío a mercados por producto. El vaciado a otro almacén y el gasto de madera en construcción conservan sus reglas. Los guardados anteriores habilitan ambos envíos al cargar.
- Voces de la aldea suma 69 plantillas y conserva las 13 anteriores. Los mensajes normales rotan por tema y vivienda. Los eventos residenciales comparten el intervalo general y conservan su propio enfriamiento.
- Verificación. `npm test` aprobó 221 pruebas con cero fallidas. `npm run build` pasó con el aviso de tamaño de Phaser. La vista previa sirvió HTML, SVG, CSS y JavaScript bajo `/PeasantToKing/`. El despliegue público se verifica por separado.
