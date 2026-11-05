# Pruebas manuales — Etapa 08D

Ejecutar npm run dev. La recarga inicia una partida nueva, todavía sin guardado. Las coordenadas X/Y comienzan en 0.

## Ciudad reproducible

Preparar el mapa siguiente, colocando el centro al final si se desea que la inmigración comience cuando esté todo listo.

| Construcción | Coordenadas |
|---|---|
| Centro de Aldea | (0,0) |
| Caminos | (1,0) hasta (12,0) |
| Almacén | (1,1) |
| Granja | (2,1) |
| Mercado | (3,1) |
| Zonas residenciales | (4,1) hasta (9,1) |

1. Comprobar la comida inicial de 20 y oro inicial de 0. El almacén y el mercado comienzan vacíos.
2. Llegan primero habitantes atendidos por la reserva. El asignador da un empleado al almacén, otro a la granja y otro al mercado cuando hay suficientes activos.
3. Al operar el primer mercado se cierra permanentemente el acceso directo a la reserva. El remanente no desaparece ni se duplica: sigue contado en comida global, identificado como reserva cerrada. No genera ingresos.
4. Seleccionar el mercado: muestra comida/100, empleados, conexión, estado operativo y cinco solares dentro de cobertura.
5. La reposición se evalúa cada 5 segundos; no ocurre al seleccionar, redimensionar o recalcular. La granja entrega al almacén y el mercado retira de este mediante transferencias exactas.
6. En la simulación de referencia, a los 15 segundos el mercado tiene su primer empleado; la primera reposición/venta ocurre a los 20 segundos. Los tiempos visibles dependen de cuándo se conecten las construcciones.
7. Los solares (4,1) a (8,1) reciben habitantes. (9,1) está a 7 casillas de camino y debe permanecer vacío después de cerrarse la reserva.
8. En torno a un minuto se alcanzan 20 habitantes abastecidos. Con población estable y entrega completa, se consumen 2 comida/s y entran 2 oro/s.

## Cobertura vial y falta de suministro

- La distancia cuenta casillas de camino, incluyendo las adyacentes a mercado y vivienda. Compartir una misma casilla vial cuenta como 1 tramo.
- Una ruta con 6 casillas está cubierta; una con 7 no. Los edificios y el centro no actúan como atajos entre caminos para esta cobertura.
- Dos edificios próximos en línea recta pueden quedar fuera de cobertura si el camino hace un desvío largo.
- Seleccionar el solar (9,1): indica falta de acceso a alimentos y detención de inmigración, aunque existan alimentos globales.
- Un mercado aislado o sin empleados no recibe comida ni vende; sus existencias previas se conservan. Los casos de pérdida de conexión o empleo están cubiertos por pruebas automatizadas.
- Una vivienda cubierta elige primero el mercado operativo más cercano con comida. Si este se vacía durante una entrega, puede completar el consumo desde otro mercado cubierto con existencias.

## Balance de comida y oro

- Comida global = reserva inicial restante + comida de todos los almacenes + comida de todos los mercados, incluyendo inventarios temporalmente inactivos.
- Comida disponible para viviendas = mercados operativos con existencias, más reserva mientras siga abierta. Tener comida en un almacén no habilita consumo directo.
- La transferencia almacén → mercado no modifica el total global.
- Por segundo: cambio de comida global = producción almacenada − comida efectivamente consumida.
- El oro aumenta únicamente por comida entregada desde mercados: 0,1 oro por habitante alimentado cada segundo. Demanda no satisfecha y consumo de reserva no pagan oro.
- Un mercado con empleados pero sin existencias ni entregas muestra ingresos por ventas de 0.
- Esta recaudación es provisional: no hay salarios, presupuestos de hogares ni impuestos. Debe revisarse al incorporar esos sistemas, sin añadir otra fuente pasiva de oro.

## Configuración y verificaciones

distributionRules, en src/economy/Distribution.ts, define capacidad 100, reposición cada 5 segundos y cobertura de 6 casillas viales.

La inmigración conserva su evaluación cada 5 segundos, atractivo y límite por desempleo. Solo admite solares cuyo suministro local permite reservar 5 segundos de consumo para residentes actuales y nuevos, sin prometer dos veces las mismas existencias.

Para evitar el ciclo población → empleados → distribución → inmigración, el asignador existente prioriza un trabajador por eslabón y completar la primera granja antes de puestos secundarios. No se crean trabajadores ni alimentos adicionales.

node --test --test-reporter=spec tests/economy.test.ts tests/population.test.ts tests/storage.test.ts tests/distribution.test.ts tests/roadConnections.test.ts tests/roadAppearance.test.ts
