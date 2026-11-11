import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { SelectionPanel } from '../src/ui/SelectionPanel';
import { CityAlerts } from '../src/ui/CityAlerts';
import { GridMap } from '../src/map/GridMap';
import { Session } from '../src/persistence/Session';
import { constructionDimensions, constructionNames } from '../src/map/ConstructionMap';
import { TerrainMap } from '../src/map/Terrain';

vi.mock('../src/map/TerrainRenderer', () => ({ TerrainRenderer: class {
  show() {} destroy() {}
} }));

const cell = { column: 10, row: 10 };
// Minimal DOM surface used by the real panels; assertions read their rendered rows.
class Element {
  textContent = ''; id = ''; hidden = false; disabled = false;
  children: Element[] = [];
  addEventListener() {} setAttribute() {}
  replaceChildren(...children: Element[]) { this.children = children; }
}
function dom() {
  const elements = new Map<string, Element>();
  const get = (id: string) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id)!;
  };
  vi.stubGlobal('document', { getElementById: get,
    querySelector: (selector: string) => get(selector.slice(1)), createElement: () => new Element() });
  return get;
}
function isolated(type: keyof typeof constructionNames = 'garden') {
  const game = new Session(undefined, new TerrainMap(100, 100, new Uint8Array(10000)));
  game.map.place(cell, type, constructionDimensions[type]); game.simulation.recalculate();
  assert.equal(game.connections.isConnected(cell), false);
  return game;
}
afterEach(() => vi.unstubAllGlobals());

test('a road-adjacent garden never relays network access to roads or buildings on its other side', () => {
  const game = isolated();
  game.map.place({ column: 0, row: 10 }, 'villageCenter');
  for (let column = 1; column < 10; column++) game.map.place({ column, row: 10 }, 'road');
  const road = { column: 11, row: 10 }, market = { column: 12, row: 10 };
  game.map.place(road, 'road'); game.map.place(market, 'market', constructionDimensions.market);
  game.simulation.recalculate();
  assert.equal(game.connections.isConnected(cell), true);
  assert.equal(game.connections.isConnected(road), false);
  assert.equal(game.connections.isConnected(market), false);
  assert.equal(game.connections.networkFor(road), null);
  assert.equal(game.connections.networkFor(market), null);
});

test.each([false, true])('garden inspector says Conexión vial: No necesaria (physical access %s)', connected => {
  const get = dom(), panel = new SelectionPanel(() => {}, () => {}, () => {}, () => {}, () => {});
  panel.render(cell, undefined, 'garden', connected);
  const rows = get('cell-details').children;
  const index = rows.findIndex(row => row.id === 'cell-connection');
  assert.equal(rows[index - 1].textContent + ': ' + rows[index].textContent, 'Conexión vial: No necesaria');
  assert.ok(rows.every(row => !/Sin conexión|Inactivo/.test(row.textContent)));
  panel.destroy();
});

test.each(Object.keys(constructionNames).filter(type => type !== 'garden'))('%s inspector retains actual disconnected status', type => {
  const get = dom(), panel = new SelectionPanel(() => {}, () => {}, () => {}, () => {}, () => {});
  panel.render(cell, undefined, type as keyof typeof constructionNames, false);
  assert.equal(get('cell-details').children.find(row => row.id === 'cell-connection')!.textContent, 'Sin conexión');
  panel.render(cell, undefined, type as keyof typeof constructionNames, true);
  assert.equal(get('cell-details').children.find(row => row.id === 'cell-connection')!.textContent, 'Conectado');
  panel.destroy();
});

test('city alerts ignore isolated gardens, including after reload, but count markets and wells', () => {
  const get = dom(); let game = isolated(); const alerts = new CityAlerts();
  const render = () => alerts.render(game.map, game.connections, { percentages: undefined } as never, 0, 0, 0);
  render(); assert.equal(get('alert-count').textContent, '0'); assert.equal(get('alert-list').children.length, 0);
  game = Session.restore(JSON.parse(JSON.stringify(game.saveState(null)))).session;
  render(); assert.equal(get('alert-list').children.length, 0);
  game.map.place({ column: 20, row: 20 }, 'market', constructionDimensions.market);
  game.map.place({ column: 30, row: 30 }, 'well'); game.simulation.recalculate(); render();
  assert.deepEqual(get('alert-list').children.map(row => row.textContent), ['Construcciones desconectadas · 2']);
});

test.each(['garden', 'market', 'well', 'park', 'plaza'] as const)('%s map marker follows its real access requirement', type => {
  const game = isolated(type), graphics: ReturnType<typeof graphic>[] = [];
  function graphic() {
    return { setDepth() { return this; }, clear: vi.fn(), fillStyle: vi.fn(), fillCircle: vi.fn() };
  }
  const image = { texture: { key: '' }, setDepth() { return this; },
    setTexture(texture: string) { this.texture.key = texture; return this; },
    setPosition() { return this; }, setDisplaySize() { return this; }, setAngle() { return this; } };
  const scene = { add: { graphics: () => { const g = graphic(); graphics.push(g); return g; }, image: () => image } };
  const grid = new GridMap(scene as never, game.map.terrain);
  grid.updateView({ x: 0, y: 0, size: 1000 }, game.map, game.connections, game.population);
  const indicators = graphics.at(-1)!;
  assert.equal(indicators.fillCircle.mock.calls.length, type === 'garden' ? 0 : 2);
  assert.equal(game.connections.isConnected(cell), false);
  grid.destroy();
});
