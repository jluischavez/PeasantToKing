# Pruebas manuales — Etapa 08E

Ejecutar npm run dev y usar una ciudad con producción, almacenes y mercados operativos. Se puede partir del ejemplo de docs/PRUEBAS_08D.md. Cancelar la construcción antes de consultar edificios facilita la prueba.

Las opciones se conservan en memoria por edificio, igual que los inventarios. Cambiar de selección, recalcular conexiones o reconstruir la interfaz no las reinicia. Recargar la página comienza una partida nueva; no se ha implementado guardado.

## Almacenes

1. Seleccionar un almacén: aparecen «Comida (Habilitado)» y «Madera (Habilitado)», ambas casillas marcadas por defecto.
2. Con existencias de comida, desmarcar Comida. El producto cambia a «Deshabilitado» sin borrarse del inventario ni cambiar el total global en ese instante.
3. Con un segundo almacén conectado, empleado y con espacio, comprobar que la nueva comida producida llega al segundo. La aceptación del segundo debe seguir habilitada.
4. Las existencias previas del primer almacén pueden seguir saliendo hacia mercados. Rechazar entradas no prohíbe estas retiradas ni libera el espacio ocupado.
5. Repetir con madera y un campamento con empleados. Debe desviarse a un almacén que acepte madera.
6. Deshabilitar comida en todos los almacenes válidos: la granja queda bloqueada por almacenamiento y su tasa real pasa a 0. Las existencias anteriores se conservan; los mercados todavía pueden retirarlas.
7. Habilitar comida de nuevo en un almacén operativo con espacio: se recupera la tasa y la siguiente producción puede almacenarse.
8. Seleccionar otros edificios y volver: cada almacén conserva sus propias casillas. Su capacidad compartida continúa siendo 300; deshabilitar un producto no amplía la capacidad.

## Mercados

1. Seleccionar un mercado: aparece únicamente Comida, habilitada por defecto. No hay opciones de madera ni productos futuros.
2. Esperar a que tenga inventario y desmarcar Comida. Conserva sus existencias, deja de reponerse y no entrega comida a viviendas.
3. Si era el único mercado autorizado que abastecía viviendas, en el siguiente ciclo no hay ingresos por nuevas entregas y se detiene la inmigración de los solares sin suministro. La reserva cerrada de 08D no se reabre.
4. Con otro mercado operativo, autorizado y con comida dentro de 6 tramos, las viviendas recurren a él aunque el mercado deshabilitado sea más cercano y conserve existencias.
5. Los ingresos globales pueden continuar por las ventas del otro mercado; nunca se descuentan bienes ni se obtiene oro del deshabilitado.
6. Habilitar de nuevo: las existencias conservadas pueden venderse en el siguiente consumo. La reposición sigue su intervalo original de 5 segundos; cambiar casillas no provoca entregas inmediatas ni reinicia el reloj.
7. Volver a seleccionar los dos mercados para comprobar su configuración independiente.
8. Configurar un edificio sin empleados o sin conexión no lo vuelve operativo: siguen siendo obligatorias las reglas de empleo y caminos.

## Interfaz y controles

- Las opciones solo aparecen al consultar un almacén o mercado; se ocultan en otras casillas y al cancelar selección.
- Comprobar clic en toda la etiqueta, navegación con Tab y activación con espacio.
- Mantener el foco en una casilla mientras transcurre la simulación: los controles no se reconstruyen en cada segundo.
- Redimensionar la ventana: las etiquetas se distribuyen en filas flexibles y conservan el estado.
- Comprobar que el menú, la selección, la colocación y los indicadores verde/rojo mantienen sus controles anteriores.

## Verificación automatizada

npm test -- tests/economy.test.ts tests/population.test.ts tests/storage.test.ts tests/distribution.test.ts tests/roadConnections.test.ts tests/roadAppearance.test.ts tests/productConfiguration.test.ts

Products.ts centraliza únicamente food y wood, sus nombres y los productos autorizables en mercados. Inventories conserva y valida las opciones por edificio. No se agregaron productos, cuotas, prioridades de almacenamiento, dependencias ni otras etapas.
