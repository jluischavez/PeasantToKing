import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { Session } from '../src/persistence/Session';
import { ConstructionMap, constructionDimensions } from '../src/map/ConstructionMap';
import { TerrainMap, terrainCode } from '../src/map/Terrain';
import { BuildingCoverageModel, coverageTarget } from '../src/map/BuildingCoverage';
import type { BuildingCoverage } from '../src/map/BuildingCoverage';
import { CoverageRenderer } from '../src/map/CoverageRenderer';
import { MapCamera, cellSize } from '../src/map/MapCamera';
import { traceRoadCoverage } from '../src/map/MarketCoverage';
import { distanceFromFootprint } from '../src/map/FootprintRange';
import { harvestArea, isWoodland } from '../src/map/Woodland';
import { unitsPerResource as U } from '../src/economy/Inventories';
import { bindMapInput } from '../src/scenes/MapInput';

const c = (column: number, row = 11) => ({ column, row });
const key = (cell: { column: number; row: number }) => `${cell.column},${cell.row}`;
function fixture() {
  const codes = new Uint8Array(10000); codes[18 * 100 + 6] = terrainCode('grass', 'forest');
  const base = new Session(undefined, new TerrainMap(100, 100, codes));
  base.map.place(c(0, 10), 'villageCenter');
  for (let x = 1; x <= 28; x++) base.map.place(c(x, 10), 'road');
  for (let x = 2; x <= 22; x++) base.map.place(c(x, 9), 'house');
  for (const [x, type] of [[1, 'farm'], [5, 'lumberjack'], [8, 'well'], [10, 'market'], [13, 'warehouse']] as const)
    base.map.place(c(x), type, constructionDimensions[type]);
  base.map.terrain.plantTree(c(5, 14)); base.map.terrain.plantTree(c(12, 12)); base.map.terrain.plantTree(c(13, 13));
  base.simulation.recalculate(); const state = base.saveState(null);
  for (const home of state.population.residences) home.residents = 4;
  const game = Session.restore(state).session;
  return { game, model: new BuildingCoverageModel(game), selected: (cell: ReturnType<typeof c>) => coverageTarget(game.map, cell, null, null)! };
}
const find = (report: BuildingCoverage, cell: ReturnType<typeof c>) => report.tiles.find(tile => key(tile.cell) === key(cell));
const saved = (game: Session) => JSON.parse(JSON.stringify(game.saveState(null)));

test('PERMANENT: isolated garden preview, selected coverage and reload agree without source road warnings', () => {
  const { game, model, selected } = fixture(), source = c(8, 8), home = c(8, 9);
  assert.deepEqual([...game.map.borderRoads(source, constructionDimensions.garden)], []);
  const preview = model.calculate(coverageTarget(game.map, null, 'garden', source), 0)!;
  assert.equal(find(preview, home)!.reachable, true);
  assert.equal(find(preview, home)!.gain, 25);
  assert.equal(game.simulation.build(source, 'garden'), null);
  const actual = model.calculate(selected(source), 1)!;
  const loaded = Session.restore(saved(game)).session;
  const restored = new BuildingCoverageModel(loaded).calculate(coverageTarget(loaded.map, source, null, null), 0)!;
  for (const report of [preview, actual, restored]) {
    assert.equal(report.range, 3);
    assert.equal(find(report, home)!.points, 25);
    assert.equal(find(report, home)!.reachable, true);
    assert.match(report.restriction, /No necesita caminos/);
    assert.doesNotMatch(report.restriction, /Sin acceso|inactivo/i);
  }
  assert.deepEqual(restored, actual);
  assert.equal(loaded.connections.isConnected(source), false);
  assert.equal(loaded.simulation.beauty.at(home).sources.garden, 25);
  loaded.map.remove(c(8, 10)); loaded.simulation.recalculate();
  const cut = new BuildingCoverageModel(loaded).calculate(coverageTarget(loaded.map, source, null, null), 1)!;
  assert.equal(find(cut, home)!.benefit, 0);
  assert.match(find(cut, home)!.note!, /La vivienda necesita conexión vial; el jardín no la requiere/);
});

test('an isolated garden preview is potential and does not mutate any simulation state', () => {
  const { game, model } = fixture(), source = c(8, 8);
  const target = coverageTarget(game.map, null, 'garden', source)!;
  assert.equal(game.connections.isConnected(source), false);
  const before = saved(game), report = model.calculate(target, 0)!;
  assert.equal(report.range, 3); assert.equal(report.target.preview, true);
  assert.ok(report.reachableHomes > 0); assert.equal(report.benefitedHomes, 0);
  assert.equal(find(report, c(8, 9))!.points, 25); assert.equal(find(report, c(6, 9))!.points, 8);
  assert.match(report.restriction, /No necesita caminos/); assert.match(report.summary, /Potencial/);
  for (let i = 0; i < 100; i++) assert.equal(model.calculate(target, 0), report);
  assert.deepEqual(saved(game), before);
});

test('built garden colors agree with the actual decaying beauty bonus and keep recipient access rules', () => {
  const { game, model, selected } = fixture(); game.map.place(c(8, 8), 'garden'); game.simulation.recalculate();
  const report = model.calculate(selected(c(8, 8)), 1)!;
  for (const tile of report.tiles.filter(tile => tile.kind === 'home' && tile.reachable)) {
    assert.equal(tile.points, game.simulation.beauty.at(tile.cell).sources.garden);
    assert.equal(tile.benefit, 1);
  }
  game.map.remove(c(8, 10)); game.simulation.recalculate();
  const cut = model.calculate(selected(c(8, 8)), 2)!;
  assert.equal(find(cut, c(8, 9))!.benefit, 0);
  assert.equal(game.connections.isConnected(c(8, 8)), false);
});

test('park coverage reaches six tiles from the far edge of its full 3x3 footprint', () => {
  const { game, model, selected } = fixture();
  game.map.place(c(20), 'park', constructionDimensions.park);
  game.map.place(c(28), 'road'); game.map.place(c(28, 12), 'house'); game.simulation.recalculate();
  const report = model.calculate(selected(c(22, 13)), 1)!;
  assert.deepEqual(report.target.cell, c(20)); assert.equal(report.target.size.width, 3);
  assert.equal(distanceFromFootprint(c(20), constructionDimensions.park, c(28, 12)), 6);
  assert.equal(find(report, c(28, 12))!.points, 6); assert.equal(find(report, c(28, 12))!.benefit, 1);
  assert.equal(find(report, c(29, 12)), undefined);
});

test('a fountain plaza displays beauty only and never changes water assignment', () => {
  const { game, model, selected } = fixture(); game.map.place(c(20), 'plaza', constructionDimensions.plaza); game.simulation.recalculate();
  const water = structuredClone(game.simulation.water.assignments), before = saved(game);
  const report = model.calculate(selected(c(20)), 0)!;
  assert.equal(report.range, 5); assert.match(report.restriction, /no da agua/);
  assert.deepEqual(game.simulation.water.assignments, water); assert.deepEqual(saved(game), before);
});

test('market road tiles and reachable houses are exactly the current simulation coverage', () => {
  const { game, model, selected } = fixture();
  game.map.place(c(10, 14), 'house'); game.simulation.recalculate();
  const report = model.calculate(selected(c(10)), 0)!;
  const actual = game.economy.distribution.coverage.area(c(10))!;
  assert.deepEqual(report.tiles.filter(tile => tile.kind === 'home' && tile.reachable).map(tile => key(tile.cell)).sort(), [...actual.homes.keys()].sort());
  assert.equal(report.reachableHomes, game.economy.distribution.coverage.coveredHomes(c(10)));
  assert.equal(report.benefitedHomes, 0); assert.match(report.restriction, /no atribuye/);
  assert.ok(report.tiles.some(tile => tile.kind === 'home' && !tile.reachable));
  assert.equal(report.tiles.some(tile => game.map.getConstruction(tile.cell) === null), false); // No painted geometric service circle.
});

test('a virtual market starts at all perimeter accesses without temporarily constructing a building', () => {
  const { game, model } = fixture(), target = coverageTarget(game.map, null, 'market', c(20))!;
  const before = saved(game), report = model.calculate(target, 0)!;
  const trace = traceRoadCoverage(game.map, game.connections, c(20), constructionDimensions.market, 6);
  assert.equal(report.reachableHomes, trace.homes.size); assert.equal(report.benefitedHomes, 0);
  assert.equal(game.map.getConstruction(c(20)), null); assert.deepEqual(saved(game), before);
});

test('market road cuts and a valid alternative update both actual coverage and overlay', () => {
  const base = new Session(); base.map.place(c(0, 1), 'villageCenter');
  for (let x = 1; x <= 10; x++) base.map.place(c(x, 1), 'road');
  base.map.place(c(2, 2), 'market', constructionDimensions.market); base.map.place(c(6, 2), 'house'); base.simulation.recalculate();
  const model = new BuildingCoverageModel(base), target = coverageTarget(base.map, c(2, 2), null, null)!;
  assert.equal(model.calculate(target, 0)!.reachableHomes, 1);
  base.map.remove(c(5, 1)); base.simulation.recalculate(); assert.equal(model.calculate(target, 1)!.reachableHomes, 0);
  for (let x = 4; x <= 6; x++) base.map.place(c(x, 0), 'road');
  base.simulation.recalculate();
  const restored = model.calculate(target, 2)!;
  assert.equal(restored.reachableHomes, 1); assert.ok(restored.tiles.some(tile => tile.cell.row === 0));
  assert.equal(base.economy.distribution.coverage.distance(c(2, 2), c(6, 2)), 6);
});

test('market observations, partial products and permissions never invent deliveries or attribute another market stock', () => {
  const { game, model, selected } = fixture();
  const inventory = game.economy.storage.inventories.saveState();
  inventory.find(entry => entry.id === 'market:10,11')!.goods = { food: 5 * U, wood: 3 * U };
  game.economy.storage.inventories.restoreState(inventory);
  game.simulation.needs.recordSecond(game.population.residencesSnapshot, () => ({ food: 1, wood: 0, water: 1 }));
  const before = saved(game), target = selected(c(10)), report = model.calculate(target, 0)!;
  assert.ok(report.benefitedHomes > 0);
  assert.ok(report.tiles.some(tile => tile.kind === 'home' && tile.benefit === 0.5));
  assert.match(report.summary, /cualquier origen/); assert.deepEqual(saved(game), before);
  assert.match(report.restriction, /Comida libre para comprar: 5; madera: 3/);
  game.economy.setMarketSale(c(10), 'food', false);
  assert.equal(model.calculate(target, 1)!.benefitedHomes, 0);
  assert.match(model.calculate(target, 1)!.restriction, /Comida libre para comprar: 0; madera: 3/);
});

test('well range agrees with the same road traversal; green ratios exactly match limited live assignments', () => {
  const { game, model, selected } = fixture(), report = model.calculate(selected(c(8)), 0)!;
  const assignments = game.simulation.water.assignments.filter(a => key(a.well) === key(c(8)));
  assert.equal(assignments.reduce((sum, a) => sum + a.residents, 0), 30);
  assert.ok(report.tiles.some(tile => tile.benefit > 0 && tile.benefit < 1));
  for (const tile of report.tiles.filter(tile => tile.kind === 'home')) {
    const residents = assignments.find(a => key(a.home) === key(tile.cell))?.residents ?? 0;
    assert.equal(tile.benefit, residents / game.population.residentsAt(tile.cell));
  }
  assert.equal(find(report, c(14, 9)), undefined);
  const before = saved(game); model.calculate(selected(c(8)), 1); assert.deepEqual(saved(game), before);
});

test('well preview promises no capacity and refreshes after workers or population change', () => {
  const { game, model, selected } = fixture();
  const preview = model.calculate(coverageTarget(game.map, null, 'well', c(18))!, 0)!;
  assert.equal(preview.benefitedHomes, 0); assert.match(preview.restriction, /aún|Potencial/);
  const state = game.saveState(null); for (const home of state.population.residences) home.residents = 0;
  state.population.workers = state.population.workers.map(([id]) => [id, 0] as const);
  const empty = Session.restore(state).session, emptyModel = new BuildingCoverageModel(empty);
  const report = emptyModel.calculate(coverageTarget(empty.map, c(8), null, null), 0)!;
  assert.equal(report.benefitedHomes, 0); assert.match(report.restriction, /Sin aguador/);
  assert.ok(model.calculate(selected(c(8)), 1)!.benefitedHomes > 0);
});

test('woodland display uses the shared harvest iterator and counts actual tree and forest tiles', () => {
  const { game, model, selected } = fixture(), report = model.calculate(selected(c(5)), 0)!;
  const expected = [...harvestArea(game.map.terrain, c(5), constructionDimensions.lumberjack)].filter(cell => isWoodland(game.map.terrain, cell));
  assert.deepEqual(report.tiles.filter(tile => tile.kind === 'woodland').map(tile => key(tile.cell)), expected.map(key));
  assert.ok(find(report, c(6, 18))?.kind === 'woodland'); assert.ok(find(report, c(12, 12))?.kind === 'woodland');
  assert.equal(find(report, c(13, 13)), undefined);
  assert.ok(game.map.terrain.clear(c(12, 12), 'tree'));
  assert.equal(find(model.calculate(selected(c(5)), 1)!, c(12, 12))!.kind, 'area');
});

test.each(['farm', 'warehouse', 'house', 'villageCenter', 'tradeHouse', 'bridge'] as const)('%s has no invented coverage radius', type => {
  const map = new ConstructionMap(100, 100); map.place(c(20), type);
  assert.equal(coverageTarget(map, c(20), null, null), null);
  assert.equal(coverageTarget(map, null, type, c(25)), null);
});

test('selection, construction priority, cancellation, demolition and clearing have no stale overlay target', () => {
  const { game } = fixture();
  assert.equal(coverageTarget(game.map, c(10, 12), null, null)!.type, 'market');
  assert.equal(coverageTarget(game.map, c(10), 'garden', c(8, 8))!.preview, true);
  assert.equal(coverageTarget(game.map, c(10), 'warehouse', c(20)), null);
  assert.equal(coverageTarget(game.map, c(10), 'demolish', c(20)), null);
  assert.equal(coverageTarget(game.map, c(10), null, null, null, true), null);
  assert.equal(coverageTarget(game.map, null, null, null), null);
  assert.equal(coverageTarget(game.map, c(10), 'garden', null), null);
});

function rendererFixture() {
  const commands: { method: string; args: any[] }[] = []; let created = 0;
  const g: any = new Proxy({}, { get: (_target, method) => (...args: any[]) => { commands.push({ method: String(method), args }); return g; } });
  const scene = { add: { graphics: () => { created++; return g; } } };
  return { renderer: new CoverageRenderer(scene as never), commands, created: () => created };
}

test('rendering 1000 cursor moves uses one graphics object and no sprites, then clears/destroys it', () => {
  const { game, model } = fixture(), f = rendererFixture(), before = saved(game);
  for (let i = 0; i < 1000; i++) f.renderer.render(model.calculate(coverageTarget(game.map, null, 'garden', c(30 + i % 50, 30 + Math.floor(i / 50)))!, 0));
  assert.equal(f.created(), 1); assert.deepEqual(saved(game), before);
  f.renderer.render(null); assert.equal(f.commands.at(-1)!.method, 'clear');
  f.renderer.destroy(); assert.equal(f.commands.at(-1)!.method, 'destroy');
});

test('unchanged frames reuse calculation and drawing; invalid placements are red without any temporary building', () => {
  const { game, model } = fixture(), f = rendererFixture();
  const target = coverageTarget(game.map, null, 'market', c(20), 'Sin oro')!;
  const spy = vi.spyOn(game.map, 'roadTouches'), report = model.calculate(target, 0)!;
  const count = spy.mock.calls.length;
  f.renderer.render(report); const draws = f.commands.length;
  for (let i = 0; i < 1000; i++) { assert.equal(model.calculate(target, 0), report); f.renderer.render(report); }
  assert.equal(spy.mock.calls.length, count); assert.equal(f.commands.length, draws);
  assert.ok(f.commands.some(command => command.method === 'lineStyle' && command.args[1] === 0xf05252));
  assert.equal(game.map.getConstruction(c(20)), null); spy.mockRestore();
});

test('world coordinates stay aligned with cells at both zoom limits and after pan', () => {
  const { game, model } = fixture(), f = rendererFixture();
  const report = model.calculate(coverageTarget(game.map, null, 'garden', c(40, 40)), 0)!;
  f.renderer.render(report);
  assert.ok(f.commands.some(command => command.method === 'strokeRect' && command.args[0] === 40 * cellSize && command.args[1] === 40 * cellSize));
  const camera = new MapCamera(game.world, c(40, 40)); camera.setViewport({ x: 20, y: 80, size: 400 });
  for (const zoom of [0.5, 2.5]) {
    camera.zoomAt({ x: 220, y: 280 }, zoom / camera.view.zoom); camera.pan(12, 19);
    const x = 20 + ((40.5 * cellSize) - camera.bounds.x) * camera.zoom;
    const y = 80 + ((40.5 * cellSize) - camera.bounds.y) * camera.zoom;
    assert.deepEqual(camera.cellAt({ x, y }), c(40, 40));
  }
});

test('existing saves restore identical services and coverage; overlays never enter the save state', () => {
  const { game, model, selected } = fixture(), before = saved(game);
  const reports = [c(5), c(8), c(10)].map(cell => model.calculate(selected(cell), 0));
  const restored = Session.restore(before).session, newModel = new BuildingCoverageModel(restored);
  assert.deepEqual([c(5), c(8), c(10)].map(cell => newModel.calculate(coverageTarget(restored.map, cell, null, null), 0)), reports);
  assert.deepEqual(saved(game), before); assert.deepEqual(saved(restored), before);
});

test('improved roads display their real beauty radius while plain road previews do not', () => {
  const { game, model } = fixture();
  assert.equal(coverageTarget(game.map, c(8, 10), null, null), null);
  assert.equal(coverageTarget(game.map, null, 'road', c(25)), null);
  assert.ok(game.map.upgradeRoad(c(8, 10), 2)); game.simulation.recalculate();
  const report = model.calculate(coverageTarget(game.map, c(8, 10), null, null), 0)!;
  assert.equal(report.range, 2); assert.equal(find(report, c(8, 9))!.points, 5);
});

test('garden previews do not promise stacking beyond the existing best contribution or the beauty cap', () => {
  const { game, model } = fixture(); game.map.place(c(8, 8), 'garden'); game.simulation.recalculate();
  const report = model.calculate(coverageTarget(game.map, null, 'garden', c(7, 8)), 0)!;
  assert.equal(find(report, c(8, 9))!.gain, 0);
  assert.ok(report.tiles.some(tile => (tile.gain ?? 0) > 0));
  assert.equal(report.benefitedHomes, 0); assert.match(report.summary, /mejora estimada/);
});

test.each([false, true])('preview and actual coverage cross bridges only along their axis (vertical %s)', vertical => {
  const at = (x: number, y: number) => vertical ? c(y, x) : c(x, y);
  const codes = new Uint8Array(10000);
  for (let y = 0; y < 100; y++) { const cell = at(4, y); codes[cell.row * 100 + cell.column] = terrainCode('river'); }
  const game = new Session(undefined, new TerrainMap(100, 100, codes));
  game.map.place(at(0, 4), 'villageCenter');
  for (const x of [1, 2, 3, 5, 6]) game.map.place(at(x, 4), 'road');
  game.map.place(at(2, 3), 'well'); game.map.place(at(6, 3), 'house');
  assert.ok(game.map.placeBridge({ from: at(3, 4), to: at(5, 4) })); game.simulation.recalculate();
  const model = new BuildingCoverageModel(game), target = coverageTarget(game.map, at(2, 3), null, null)!;
  assert.equal(model.calculate(target, 0)!.reachableHomes, 1);
  assert.ok(game.map.remove(at(4, 4))); game.simulation.recalculate();
  assert.equal(model.calculate(target, 1)!.reachableHomes, 0);
});

test('touch-down previews immediately, cancellation clears it and no click or economic action occurs', () => {
  const { game, model } = fixture(), before = saved(game);
  const win = new EventTarget(), doc = Object.assign(new EventTarget(), { activeElement: null as unknown, body: {}, hidden: false });
  const captures = new Set<number>();
  const canvas = Object.assign(new EventTarget(), {
    tabIndex: 0, setAttribute() {}, focus() { doc.activeElement = this; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
    setPointerCapture: (id: number) => captures.add(id), hasPointerCapture: (id: number) => captures.has(id),
  });
  vi.stubGlobal('window', win); vi.stubGlobal('document', doc);
  const camera = new MapCamera(game.world, c(8, 8)); camera.setViewport({ x: 0, y: 0, size: 400 });
  let report: BuildingCoverage | null = null, clicks = 0;
  const abort = new AbortController();
  try {
    bindMapInput(canvas as unknown as HTMLCanvasElement, camera, () => ({ width: 400, height: 400 }), () => {}, cell => {
      report = model.calculate(cell ? coverageTarget(game.map, null, 'garden', cell) : null, 0);
    }, () => { clicks++; }, abort.signal);
    const event = (type: string) => Object.assign(new Event(type, { cancelable: true }),
      { isPrimary: true, pointerId: 1, pointerType: 'touch', button: 0, clientX: 120, clientY: 120 });
    canvas.dispatchEvent(event('pointerdown')); assert.ok(report); assert.equal(clicks, 0);
    canvas.dispatchEvent(event('pointercancel')); assert.equal(report, null); assert.equal(clicks, 0);
    assert.deepEqual(saved(game), before);
    abort.abort(); canvas.dispatchEvent(event('pointerdown')); assert.equal(report, null);
  } finally { abort.abort(); vi.unstubAllGlobals(); }
});
