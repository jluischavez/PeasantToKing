# Pruebas automatizadas de Peasant to King

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

## Agregar un caso

1. Crea o amplía un archivo con sufijo .test.ts en tests. Importa test desde vitest y usa las aserciones de Node o expect de Vitest.
2. Crea un estado independiente para cada caso. Usa Inventories para comprobar movimientos aislados. Para probar la cadena completa, crea ConstructionMap, RoadConnections, Population, Economy y SettlementSimulation.
3. Avanza SettlementSimulation con milisegundos explícitos. Así puedes verificar el instante anterior a la reposición y el siguiente tick sin esperar tiempo real.
4. Comprueba el resultado observable. Para una transferencia, verifica el saldo de origen y destino, el total y los ingresos cuando procedan. Para un rechazo, verifica ambos saldos.
5. Ejecuta primero el archivo afectado y después npm test y npm run build.

Las unidades enteras de inventario representan fracciones de 1/150 desde 09C. Los movimientos de tesorería que incluyen una fracción más fina indican su escala en unitScale. Usa unitsPerResource para preparar existencias en pruebas de Inventories. Los saldos públicos de Economy se expresan en unidades de comida, madera y oro.
