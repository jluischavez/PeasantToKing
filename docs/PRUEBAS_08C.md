# Pruebas manuales — Etapa 08C

Ejecutar npm run dev y abrir la dirección indicada. Recargar inicia una partida nueva, todavía sin guardado. Las coordenadas son X/Y del panel, desde 0.

## Almacenamiento obligatorio y reserva única

1. Colocar Centro de Aldea, caminos, una granja y dos solares conectados, sin almacén.
2. Tras la primera llegada, seleccionar la granja: tendrá empleados, productividad 0 % y el aviso de producción bloqueada por falta de almacenamiento. La comida solo disminuye por consumo; no se guarda la producción descartada.
3. Construir un almacén conectado. Debe empezar con inventario vacío, sin aumentar la reserva ni regalar otras 20 unidades.
4. El primer trabajador se asigna al almacén; el siguiente permite operar la granja. Con 1 trabajador agrícola se almacenan 0,5 comida/s, mientras la población mantiene su consumo.
5. Cancelar construcción y seleccionar el almacén: comprobar comida, madera, capacidad usada/disponible, empleados, conexión y estado operativo.
6. Un almacén aislado o sin empleados debe quedar inactivo, sin recibir bienes. Redimensionar la ventana no modifica inventarios ni reserva.

## Saturación y reparto entre almacenes

Preparar una partida nueva con esta distribución. Se puede colocar el centro al final para comenzar las conexiones después de preparar el mapa.

| Construcción | Coordenadas |
|---|---|
| Centro de Aldea | (0,0) |
| Caminos | (1,0) hasta (10,0) |
| Granja | (1,1) |
| Almacén | (2,1) |
| Campamento maderero | (3,1) |
| Seis zonas residenciales | (4,1) hasta (9,1) |

1. Esperar las llegadas: almacén y granja reciben el mínimo de trabajadores necesario para arrancar; los demás puestos se llenan mediante el asignador existente.
2. Al alcanzar su dotación completa, la granja produce 2 comida/s y el campamento 2 madera/s.
3. Observar el inventario del almacén durante unos 4 minutos. Comida y madera comparten las 300 unidades; nunca deben superarlas. El aviso de bloqueo aparece cuando una entrega completa no cabe, aunque quede un pequeño espacio libre.
4. Construir otro almacén en (10,1). Con población suficiente tendrá empleados y reanudará las entregas bloqueadas.
5. Comprobar que la madera global es la suma de ambos almacenes: una entrega puede completar el espacio del primero y continuar en el segundo, sin duplicarse.

## Consumo y totales reales

1. En la distribución anterior, observar cómo disminuye «Reserva inicial». Mientras quede reserva, el consumo no debe descontarse también del alimento guardado en almacenes.
2. Con reserva en 0, la comida global debe coincidir con la suma de comida almacenada. La reserva debe permanecer en 0, incluso tras construir más almacenes.
3. Con 24 habitantes estables se consumen 2,4 comida/s. Con una granja completa y sin bloqueo, el alimento almacenado disminuye 0,4/s: entran 2 y se consumen 2,4.
4. Al agotarse la comida, ningún inventario debe volverse negativo. No hay mortalidad ni emigración en esta etapa.
5. La barra muestra el total real, incluyendo existencias temporalmente inaccesibles, y por separado la comida disponible. Solo la reserva y los almacenes operativos alimentan habitantes y habilitan inmigración.

## Comprobaciones automatizadas

npm test -- tests/economy.test.ts tests/population.test.ts tests/storage.test.ts tests/roadConnections.test.ts tests/roadAppearance.test.ts

Incluyen fracciones exactas, transferencias inválidas, redes aisladas, pérdida de conexión/empleo sin pérdida de mercancías, saturación, reparto de lotes, reserva única, consumo sin duplicación y arranque con prioridad mínima.
