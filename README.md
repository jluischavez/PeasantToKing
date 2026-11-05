# Peasant to King

Juego medieval de construcción de aldeas para navegador, hecho con Vite, TypeScript y Phaser. La primera versión pública prevista es **Alpha 0.1**.

## Desarrollo local

Usa Node.js 22.12 o posterior de la serie 22.

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

Abre la URL que imprime Vite. La vista previa de producción usa la ruta `/PeasantToKing/`. La etiqueta de la versión se configura en `.env` y aparece en la pestaña y junto al botón **Partida**.

Las ranuras y el autoguardado usan `localStorage`. Las partidas de localhost y de GitHub Pages se guardan por separado porque tienen orígenes distintos. Usa el mismo origen y perfil del navegador para recuperar una partida al recargar.

## GitHub Pages

1. En [Settings → Pages](https://github.com/jluischavez/PeasantToKing/settings/pages), elige **Build and deployment → Source → GitHub Actions**.
2. El workflow **Deploy GitHub Pages** se ejecuta al actualizar `main`. Para desplegar manualmente con permisos de escritura, abre [Actions](https://github.com/jluischavez/PeasantToKing/actions), elige el workflow, pulsa **Run workflow** y selecciona `main`. Si el entorno `github-pages` pide una revisión, espera la aprobación de un revisor autorizado.
3. Comprueba que el job `deploy` terminó correctamente para el SHA de lanzamiento. Abre la [URL del juego](https://jluischavez.github.io/PeasantToKing/) y comprueba la versión, el mapa y la carga de una partida al recargar la página.

El job de compilación comprueba que la referencia sea `main`, instala dependencias con el archivo de bloqueo, ejecuta las pruebas y publica el artefacto de `dist/`. Los cambios de `develop` pueden pasar pruebas en un Pull Request.

## Ramas y lanzamientos

- `main` contiene versiones estables de producción.
- `develop` recibe el trabajo de las próximas etapas.

### Primera publicación y creación de `develop`

Con el commit de lanzamiento de Alpha 0.1 validado en `main`, revisa el estado del árbol y del remoto. Si el remoto sigue siendo la base del lanzamiento, publica con `git push origin main`. Si Git rechaza el push, revisa la autenticación, los permisos y el estado de `origin/main` antes de reintentarlo.

Después de verificar que el despliegue de ese mismo commit fue exitoso, guarda su SHA completo y comprueba las referencias:

```sh
git fetch origin
git rev-parse origin/main
git branch --list develop
git ls-remote --heads origin develop
```

Si `origin/main` coincide con el SHA desplegado y `develop` aún no existe, crea la rama desde ese commit exacto. Sustituye `SHA_ALPHA_0_1` por su SHA.

```sh
git switch -c develop SHA_ALPHA_0_1
git push -u origin develop
```

Si la rama ya existe en el remoto, verifica que parta del commit estable antes de usar `git switch --track origin/develop`. Si ya existe localmente, revisa su historial antes de usar `git switch develop`.

### Versiones posteriores

```sh
git switch develop
git pull --ff-only origin develop
# Después de hacer los cambios
npm test
npm run build
git add -- RUTAS_REVISADAS
git commit -m "Describe el cambio"
git push origin develop
```

Para publicar una versión, abre un Pull Request con base `main` y origen `develop`. Revisa el diff, ejecuta las pruebas correspondientes y espera a que pase el workflow **Check release pull requests**. Integra el PR tras su aprobación y comprueba el despliegue del nuevo SHA de `main`.

En [Settings → Rules → Rulesets](https://github.com/jluischavez/PeasantToKing/rules), se recomienda proteger `main`, exigir Pull Requests y el check `test-and-build`, y bloquear borrados y actualizaciones forzadas.

## Comprobaciones manuales de Alpha 0.1

- Revisa la etiqueta y el favicon en desarrollo y en la vista previa. Comprueba que carguen el mapa, el HUD y los gráficos.
- Configura un almacén para aceptar madera y reserva sus envíos. Comprueba que recibe madera, que el mercado solo retira los productos autorizados y que la madera se puede usar para construir. Reactiva los envíos y comprueba la siguiente reposición.
- Vacía un almacén de reserva hacia otro que acepte el producto. Guarda la partida, recarga y verifica el inventario y las opciones del inspector.
- En **Voces de la aldea**, cambia los filtros y comprueba que las opiniones de abastecimiento correspondan a la vivienda que las publica.
