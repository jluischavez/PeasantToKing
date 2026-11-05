# Peasant to King

Juego medieval de construcción de aldeas para navegador, hecho con Vite, TypeScript y Phaser. Versión actual **Alpha 0.1**.

## Desarrollo local

Usa Node.js 22.12 o posterior de la serie 22.

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

Abre la URL que imprime Vite. La vista previa de producción usa la ruta raíz `/`. La etiqueta de la versión se configura en `.env` y aparece en la pestaña y junto al botón **Partida**.

Las ranuras y el autoguardado usan `localStorage`. Usa el mismo origen y perfil del navegador para recuperar una partida al recargar.

## Flujo de trabajo

El desarrollo continúa en `main`. Ejecuta `npm test` y `npm run build` para verificar los cambios. La publicación web queda aplazada.

## Comprobaciones manuales de Alpha 0.1

- Revisa la etiqueta y el favicon en desarrollo y en la vista previa. Comprueba que carguen el mapa, el HUD y los gráficos.
- Configura un almacén para aceptar madera y reserva sus envíos. Comprueba que recibe madera, que el mercado solo retira los productos autorizados y que la madera se puede usar para construir. Reactiva los envíos y comprueba la siguiente reposición.
- Vacía un almacén de reserva hacia otro que acepte el producto. Guarda la partida, recarga y verifica el inventario y las opciones del inspector.
- En **Voces de la aldea**, cambia los filtros y comprueba que las opiniones de abastecimiento correspondan a la vivienda que las publica.
