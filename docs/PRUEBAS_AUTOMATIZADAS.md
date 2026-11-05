# Pruebas automatizadas de Peasant to King

Desde la raíz del proyecto, ejecuta npm ci para instalar las versiones del archivo de bloqueo. Después ejecuta npm test para correr toda la suite una vez. Para ejecutar solo la regresión de recuperación económica, usa npm test -- tests/economicRecovery.test.ts. Ejecuta npm run build para validar TypeScript y el paquete de producción.

Vitest usa Vite y el TypeScript del proyecto. Las pruebas se ejecutan en Node e importan los modelos económicos directamente. La escena de Phaser, el DOM y el dibujo real del mapa quedan fuera de estas pruebas.

| Sistema | Casos principales |
| --- | --- |
| Empleo y población | Límites de población activa y puestos, desempleo, conexión, capacidad residencial e inmigración |
| Producción | Proporción por trabajador, máximo, productores desconectados o sin personal |
| Almacenes y transferencias | Capacidad, permisos, operación, inventarios separados y saldos exactos, incluso tras rechazar una transferencia |
| Mercados | Empleo, permisos, cobertura vial, existencias e ingresos por comida entregada |
| Simulación y auditoría | Pausa, reanudación, velocidades, saldos por evento, filtros, rechazos y límite del historial |
| Integración | Granja → almacén → mercado → vivienda y recuperación con dos trabajadores, mercados inactivos y reserva agotada |

## Agregar un caso

1. Crea o amplía un archivo con sufijo .test.ts en tests. Importa test desde vitest y usa las aserciones de Node o expect de Vitest.
2. Crea un estado independiente para cada caso. Usa Inventories para comprobar movimientos aislados. Para probar la cadena completa, crea ConstructionMap, RoadConnections, Population, Economy y SettlementSimulation.
3. Avanza SettlementSimulation con milisegundos explícitos. Así puedes verificar el instante anterior a la reposición y el siguiente tick sin esperar tiempo real.
4. Comprueba el resultado observable. Para una transferencia, verifica el saldo de origen y destino, el total y los ingresos cuando procedan. Para un rechazo, verifica ambos saldos.
5. Ejecuta primero el archivo afectado y después npm test y npm run build.

Las unidades enteras de inventario representan fracciones de 1/30. Usa unitsPerResource para preparar existencias en pruebas de Inventories. Los saldos públicos de Economy se expresan en unidades de comida, madera y oro.
