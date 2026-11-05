# Corrección del bloqueo económico posterior a 08E

La causa fue un ciclo entre empleo y distribución. El asignador daba el primer trabajador al almacén y el segundo a la granja; con cuatro habitantes y dos activos no quedaba nadie para el mercado. Las 21 vacantes de 23 puestos eran puestos sin cubrir, no trabajadores disponibles.

La inmigración normal consulta la previsión de alimentos accesibles por vivienda. Si la reserva ya no se puede usar y los mercados están inactivos, esa previsión no contiene ningún solar abastecible. El atractivo era 0 incluso con 77,5 comida en almacenes. Además, un mercado vacío podía cerrar prematuramente la reserva con solo recibir un empleado.

## Prioridades de empleo

Las prioridades se configuran internamente en employmentRules de Population.ts. No cambian las capacidades ni crean trabajadores.

- Con dos o más trabajadores y alimentos disponibles, se intenta cubrir un puesto esencial de cada tipo: mercado, almacén y granja, en ese orden.
- Con un solo activo se empieza por almacenamiento. Si la ciudad tiene menos de tres activos y su comida no cubre cinco segundos para la población más un habitante, con dos activos se priorizan granja y almacén para producir existencias reales.
- Para el puesto esencial de mercado se prefieren mercados conectados y autorizados que cubran viviendas ocupadas; si no hay, mercados autorizados con solares en cobertura. Se prefiere un almacén conectado con comida existente; en su ausencia, uno que acepte comida.
- Si quedan trabajadores, otro mercado recibe su puesto mínimo cuando cubre habitantes que no cubre ningún mercado ya empleado.
- Los puestos restantes se cubren por tipo: granjas, almacenes, mercados y campamentos madereros. Los empates de candidatos elegibles se resuelven por fila y luego columna. Los cupos de cada edificio siguen siendo máximos.
- El reparto se evalúa en el ciclo existente y al recalcular el mapa. Los permisos de productos no cambian por reasignar personal.

## Reserva, recuperación y consecuencias

La reserva inicial se consume normalmente hasta que haya un mercado conectado, empleado, autorizado y con existencias. Después se cierra sin desaparecer ni regenerarse. Un mercado vacío ya no corta el arranque.

Cuando no hay una oferta migratoria normal, la recuperación admite como máximo un habitante por evaluación de cinco segundos mientras la población sea menor de 12. Exige espacio conectado, cobertura vial de un mercado autorizado aunque aún no tenga empleados, y comida real accesible en la logística equivalente al consumo de un habitante durante esa evaluación. Sigue vigente el límite de desempleo. El límite de población y la cuota de llegadas están en economyRules.recovery.

Esto flexibiliza solo la admisión inicial: las viviendas continúan consumiendo de mercados o de la reserva aún abierta, con la tasa de 0,1 por habitante/s. La comida de almacenes no se entrega directamente, no se agrega a existencias de mercados sin una transferencia y no genera oro hasta una venta real. Sin comida accesible, o sin cobertura autorizada, la recuperación tampoco admite habitantes.

## Cómo comprobarlo

1. Ejecutar la prueba reproducible con la reserva agotada mediante npm test -- tests/economicRecovery.test.ts.
2. El primer caso prepara cuatro habitantes, dos activos, 23 puestos, dos mercados sin empleados y 77,5 comida almacenada. Comprueba el atractivo normal en 0. Tras recalcular, un activo se asigna a un mercado y otro al almacén con existencias. En la siguiente reposición llega comida al mercado y en las evaluaciones siguientes crece la población.
3. Las pruebas también arrancan con la reserva y almacenes vacíos: granja y almacén producen primero con empleados reales, se activa la distribución y la ciudad se recupera. Otro caso parte de un único activo y alimentos existentes para comprobar la llegada limitada antes de poder emplear un mercado.
4. Para observar el comportamiento en navegador, usar npm run dev y la ciudad de docs/PRUEBAS_08D.md. Con poca población, consultar el personal de los edificios y los mensajes junto al atractivo migratorio. Un mercado vacío con empleados no debe cerrar la reserva.
5. En una ciudad con la situación descrita y solares en cobertura, verificar venta de comida habilitada, conexión, empleo del almacén con comida y del mercado útil. Esperar un ciclo de reposición de cinco segundos: el inventario pasa de almacén a mercado sin aumentar el total.
6. Seleccionar un mercado sin empleados o desconectado para leer su causa. Si no hay alternativas autorizadas, deshabilitar Comida debe detener reposición, ventas e inmigración por falta de suministro, conservando las existencias. Habilitarla permite que el reparto y la reposición vuelvan a evaluar ese mercado.
7. La recarga inicia una partida nueva: no hay guardado. La reproducción automatizada comprueba exactamente el estado con 77,5 de comida sin tener que recrearlo mediante la interfaz.
