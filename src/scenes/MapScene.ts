import { SimulationPanel } from '../ui/SimulationPanel';
import { VillageVoicesPanel } from '../ui/VillageVoicesPanel';
import { ProductConfigurationPanel } from '../ui/ProductConfigurationPanel';
import Phaser from 'phaser';
import { GridMap } from '../map/GridMap';
import { TransportRenderer } from '../map/TransportRenderer';
import { MapCamera, cellSize } from '../map/MapCamera';
import type { CameraView } from '../map/MapCamera';
import { startingCell } from '../map/World';
import { housingArt } from '../map/HousingArt';
import { buildingArt, buildingTexture, upgradedRoadArt } from '../map/BuildingArt';
import type { ConstructionType } from '../map/ConstructionMap';
import { CellSelection } from '../map/CellSelection';
import type { Cell } from '../map/CellSelection';
import { constructionNames } from '../map/ConstructionMap';
import { clearingCosts, constructionCosts } from '../map/ConstructionCosts';
import { obstacleNames } from '../map/Terrain';
import { terrainAuditId } from '../simulation/SettlementSimulation';
import { SelectionPanel } from '../ui/SelectionPanel';
import { ConstructionMenu, formatCost } from '../ui/ConstructionMenu';
import type { ConstructionMode } from '../ui/ConstructionMenu';
import { getRoadMask } from '../map/RoadAppearance';
import { roadMaterials } from '../map/RoadMaterials';
import type { RoadLevel } from '../map/RoadMaterials';
import { ResourceBar } from '../ui/ResourceBar';
import { CityAlerts } from '../ui/CityAlerts';
import { CityTabs } from '../ui/CityTabs';
import { ChapterDialog } from '../ui/ChapterDialog';
import { ChroniclesPanel } from '../ui/ChroniclesPanel';
import { CrownPanel } from '../ui/CrownPanel';
import { TradePanel } from '../ui/TradePanel';
import { KingdomEventsPanel } from '../ui/KingdomEventsPanel';
import { royalDecree, royalDefeat, royalLastWarning } from '../story/RoyalScenes';
import { PopulationPanel } from '../ui/PopulationPanel';
import { Session } from '../persistence/Session';
import { SaveSlots } from '../persistence/SaveSlots';
import { SavePanel } from '../ui/SavePanel';
import { bindMapInput } from './MapInput';

export class MapScene extends Phaser.Scene {
  private session: Session;
  private selectedCell: Cell | null = null;
  private cameraView?: CameraView;
  private readonly saveSlots = new SaveSlots();
  constructor() {
    super('MapScene');
    const previous = this.saveSlots.resumeTab();
    this.session = previous?.session ?? Session.start();
    this.selectedCell = previous?.selection ?? null;
    this.cameraView = previous?.camera;
  }

  preload(): void {
    for (const type of Object.keys(buildingArt) as ConstructionType[]) {
      const texture = buildingTexture(type);
      if (!this.textures.exists(texture)) this.load.image(texture, buildingArt[type]);
    }
    for (const { texture, url } of [...Object.values(housingArt), ...Object.values(upgradedRoadArt)]) {
      if (!this.textures.exists(texture)) this.load.image(texture, url);
    }
  }

  create(): void {
    const session = this.session;
    const { map: constructions, world, connections, economy, population, simulation } = session;
    const map = new GridMap(this, constructions.terrain);
    const transports = new TransportRenderer(this, economy.storage.logistics);
    const view = new MapCamera(world, constructions.villageCenter ?? this.selectedCell ?? startingCell(world), this.cameraView);
    const camera = this.cameras.main.setBounds(0, 0, world.columns * cellSize, world.rows * cellSize);
    const centerButton = document.querySelector<HTMLButtonElement>('#center-camera')!;
    const syncCamera = (): void => {
      const bounds = view.bounds;
      // Phaser zooms around the center of its viewport.
      const shift = (bounds.size - view.viewport.size) / 2;
      camera.setZoom(view.zoom).setScroll(bounds.x + shift, bounds.y + shift);
      map.updateView(bounds, constructions, connections, population);
    };
    const selection = new CellSelection();
    if (this.selectedCell) selection.select(this.selectedCell);
    const renderMapSelection = (): void => {
      const cell = selection.selected;
      map.renderSelection(cell, cell ? constructions.constructionAt(cell) ?? undefined : undefined);
    };
    const resourceBar = new ResourceBar(economy.currentTaxPolicy, policy => {
      if (simulation.crown.defeated) return;
      economy.setTaxPolicy(policy);
      renderSummary();
    });
    const populationPanel = new PopulationPanel();
    const alerts = new CityAlerts();
    const renderSummary = (): void => {
      const net = resourceBar.render(economy.resources, economy.perSecond, {
        reserve: economy.storage.initialFoodReserve, availableFood: population.connectedCapacity > 0 ? economy.availableFood : 0,
        sales: economy.salesRevenuePerSecond, bootstrap: economy.distribution.bootstrapActive,
        constructionReserve: economy.storage.constructionWoodReserve, constructionWood: economy.availableConstructionWood,
        costs: economy.operatingCostsPerHour(population.employed), taxes: economy.taxIncomePerHour(population.total),
        tributes: simulation.crown.tributeTotal, offerings: simulation.crown.offeringTotal,
        arrears: economy.operatingArrears, defeated: simulation.crown.defeated,
        trade: simulation.trade.totals,
      });
      const city = simulation.wellbeing.summarize(population.residencesSnapshot);
      const migration = simulation.migrationOutlook(city.happiness);
      const needs = simulation.needs.summarize(population.residencesSnapshot);
      populationPanel.render(population, migration, city, economy.distribution.cumulativeFoodShortage, needs,
        simulation.beauty.average(population.residencesSnapshot));
      alerts.render(constructions, connections, needs, economy.storage.fullWarehouseCount, economy.blockedProducers, net);
      menu.renderCosts(cost => simulation.costIssue(cost), type => simulation.progress.buildingLock(type));
      chronicles.render();
      crownPanel.render();
      tradePanel.render(!!constructions.kingdomRoad);
      kingdomPanel.render();
    };
    const renderSelected = (): void => {
      const cell = selection.selected;
      const building = cell ? constructions.constructionAt(cell) : null;
      const entry = constructions.kingdomRoad?.entry.cell;
      const royal = cell && constructions.isKingdomRoad(cell)
        ? (entry?.column === cell.column && entry.row === cell.row ? 'entry' : 'segment') : undefined;
      const tile = cell ? constructions.terrain.at(cell) : undefined;
      const type = cell ? constructions.getConstruction(cell) : null;
      const warehouse = cell && type === 'warehouse' ? economy.storage.warehouseAt(cell) : undefined;
      const market = cell && type === 'market' ? economy.distribution.marketAt(cell) : undefined;
      const home = type === 'house' ? cell : null;
      const connected = !!cell && connections.isConnected(cell);
      const productivity = cell ? economy.productivityAt(cell) : undefined;
      const roadLevel = cell ? constructions.roadLevelAt(cell) : undefined;
      const upgrade = cell && mode === null ? simulation.roadUpgradeAt(cell) : null;
      const capacity = type ? population.capacityFor(type) : 0;
      const workers = cell ? population.workersAt(cell) : 0;
      const employment = cell && type && capacity > 0 ? { workers, capacity, issue: !connected
        ? 'Sin conexión vial al Centro de Aldea.'
        : economy.laborIssue(cell, type) ?? (workers === 0 ? 'Sin empleados asignados.'
          : productivity?.transport.dispatchStopped ? 'Despachos detenidos para completar la demolición.'
          : productivity?.storageBlocked ? 'Esperando transporte: comprueba rutas, personal, permisos y capacidad de almacén.' : null) } : undefined;
      panel.render(cell, tile, type,
        connected, home ? population.residentsAt(home) : 0,
        productivity, warehouse, market,
        home ? economy.distribution.supplyAt(home) : undefined, home ? economy.distribution.foodShortageAt(home) : 0,
        home ? economy.distribution.supplyAt(home, 'wood') : undefined, home ? economy.distribution.woodShortageAt(home) : 0,
        home ? simulation.wellbeing.at(home) : undefined, home ? simulation.water.suppliedAt(home) : 0,
        cell && type === 'well' ? simulation.water.wellAt(cell) : undefined,
        home ? { level: population.housingLevelAt(home), progress: simulation.housing.at(home), beauty: simulation.beauty.at(home),
          needs: simulation.needs.currentAt(home), unemployment: population.unemploymentRate,
          waterIssue: simulation.water.suppliedAt(home) < population.residentsAt(home)
            ? simulation.water.shortageReason(home) : undefined } : undefined,
        royal, employment, building ?? undefined, roadLevel, home ? {
          food: economy.storage.inventories.snapshot(`home-stock:${home.column},${home.row}`)?.goods.food ?? 0,
          wood: economy.storage.inventories.snapshot(`home-stock:${home.column},${home.row}`)?.goods.wood ?? 0,
          purchases: economy.storage.logistics.operations.filter(op => op.kind === 'household-purchase'
            && op.destination.column === home.column && op.destination.row === home.row).length,
          arrivals: economy.storage.logistics.journeys.filter(j => j.kind === 'immigration'
            && j.destination.column === home.column && j.destination.row === home.row).reduce((n, j) => n + j.units, 0),
        } : undefined);
      const demolition = simulation.demolitionTarget;
      const clearing = demolition?.kind === 'obstacle';
      const departing = demolition?.kind === 'building' && demolition.type === 'house'
        ? population.residentsAt(demolition.cell) : 0;
      const departure = departing === 1 ? ' · 1 habitante abandonará la ciudad.'
        : departing > 1 ? ' · ' + departing + ' habitantes abandonarán la ciudad.' : '';
      const target = demolition?.kind === 'obstacle'
        ? 'Limpiar terreno · ' + obstacleNames[demolition.type] + ' · ' + formatCost(clearingCosts[demolition.type])
        : demolition ? constructionNames[demolition.type] + ' · ' + formatCost(simulation.demolitionCostAt(demolition.cell))
          + (demolition.type === 'bridge' ? ' · Retira el cruce completo y puede interrumpir el acceso a la otra orilla.' : departure)
          : null;
      const bridge = simulation.pendingBridgePreview();
      if (upgrade && pendingUpgrade !== null) {
        panel.renderConfirmation(roadMaterials[upgrade.level] + ' → ' + roadMaterials[upgrade.next]
          + ' · ' + formatCost(upgrade.cost), upgrade.issue, 'upgrade');
      } else if (bridge) {
        const description = bridge.cost ? 'Puente de madera · ' + bridge.cells.length + ' casillas · ' + formatCost(bridge.cost)
          : 'Puente de madera';
        panel.renderConfirmation(description, bridge.issue, 'bridge');
      } else panel.renderConfirmation(target, demolition ? simulation.demolitionIssue(demolition.cell) : null,
        clearing ? 'clearing' : 'demolition');
      panel.renderClearing(!!tile?.obstacle && !demolition && !bridge);
      const roadLock = upgrade ? simulation.progress.roadLock(upgrade.next) : null;
      panel.renderRoadUpgrade(upgrade && pendingUpgrade === null
        ? 'Mejorar a ' + roadMaterials[upgrade.next].toLowerCase() + ' · ' + (roadLock ?? formatCost(upgrade.cost)) : null,
      simulation.paused || !!roadLock);
      simulationPanel.render(cell ? (type ? type + ':' + cell.column + ',' + cell.row : terrainAuditId(cell)) : null);
      configuration.render(cell, warehouse, market, simulation.paused);
      tradePanel.renderSelected(type === 'tradeHouse' ? cell : null, population.total, simulation.crown.defeated);
      voicesPanel.render();
    };
    const sceneEvents = new AbortController();
    const syncVisibility = (): void => simulation.setSuspended(document.hidden);
    const visibilityOptions = { signal: sceneEvents.signal };
    document.addEventListener('visibilitychange', syncVisibility, visibilityOptions);
    document.addEventListener('freeze', () => simulation.setSuspended(true), visibilityOptions);
    document.addEventListener('resume', syncVisibility, visibilityOptions);
    syncVisibility();

    const updateSimulation = (_time: number, delta: number): void => {
      mapInput.update(delta);
      const previousPopulation = population.total;
      const previousHousing = simulation.housing.revision;
      if (simulation.advance(this.game.loop.rawDelta)) {
        renderSummary();
        renderSelected();
        updatePointerFeedback();
        if (population.total !== previousPopulation || simulation.housing.revision !== previousHousing) {
          map.renderConstructions(constructions, connections, population);
        }
      } else {
        simulationPanel.renderClock();
      }
      renderRoyalScene();
      transports.update(simulation.renderTimeMs, simulation.simulatedTimeMs);
    };
    let mode: ConstructionMode = null;
    let bridgeOrigin: Cell | null = null;
    let pendingUpgrade: RoadLevel | null = null;
    let hoveredCell: Cell | null = null;
    const updatePointerFeedback = (): void => {
      const canvas = this.game.canvas;
      if (simulation.paused) {
        canvas.title = '';
        map.renderHover(null);
        map.renderPreview(null, null, false);
        return;
      }
      if (mode === 'bridge') {
        const bridge = simulation.pendingBridgePreview()
          ?? (bridgeOrigin && hoveredCell ? simulation.bridgePreview(bridgeOrigin, hoveredCell) : null);
        const status = bridge?.cost ? 'Costo total · ' + formatCost(bridge.cost) : '';
        canvas.title = bridge?.issue ?? (status || (hoveredCell && !bridgeOrigin
          ? simulation.bridgeOriginIssue(hoveredCell) ?? 'Seleccionar orilla' : ''));
        map.renderHover(bridgeOrigin ?? hoveredCell);
        const cells = bridge?.cells.length ? bridge.cells : bridge && hoveredCell ? [hoveredCell] : [];
        map.renderBridgePreview(cells, bridge?.horizontal ?? false, !!bridge && !bridge.issue);
        return;
      }
      const buildType = mode === 'demolish' ? null : mode;
      const issue = hoveredCell && buildType ? simulation.constructionIssue(hoveredCell, buildType) : null;
      canvas.title = issue ?? '';
      map.renderHover(mode ? hoveredCell : null);
      map.renderPreview(hoveredCell, buildType, issue === null,
        buildType === 'road' && hoveredCell ? getRoadMask(constructions, hoveredCell) : 0);
    };
    const clearSelection = (): void => {
      pendingUpgrade = null;
      simulation.cancelDemolition();
      simulation.cancelBridge();
      bridgeOrigin = null;
      selection.clear();
      renderMapSelection();
      renderSelected();
      updatePointerFeedback();
    };
    const requestRemoval = (cell: Cell): void => {
      const issue = simulation.requestDemolition(cell);
      menu.showStatus(issue ?? (simulation.demolitionTarget?.kind === 'obstacle'
        ? 'Revisa el costo y confirma la limpieza en el inspector.'
        : 'Revisa el costo y confirma la demolición en el inspector.'));
    };
    const panel = new SelectionPanel(clearSelection, () => {
      if (pendingUpgrade !== null) {
        const cell = selection.selected;
        const issue = cell ? simulation.upgradeRoad(cell, pendingUpgrade) : 'Selecciona un camino.';
        if (!issue) {
          pendingUpgrade = null;
          map.renderConstructions(constructions, connections, population);
          renderSummary();
        }
        renderSelected();
        menu.showStatus(issue ?? 'Camino mejorado.');
        return;
      }
      if (simulation.bridgeTarget) {
        const issue = simulation.confirmBridge();
        if (!issue) {
          bridgeOrigin = null;
          renderSummary();
          map.renderConstructions(constructions, connections, population);
        }
        renderSelected();
        updatePointerFeedback();
        menu.showStatus(issue ?? 'Puente construido. Puedes extender el camino en la otra orilla.');
        return;
      }
      const target = simulation.demolitionTarget;
      const issue = simulation.confirmDemolition();
      if (issue) {
        menu.showStatus(issue);
        renderSelected();
        return;
      }
      if (target?.kind === 'obstacle') {
        map.redrawTerrain(target.cell);
        renderSelected();
      } else {
        clearSelection();
        map.renderConstructions(constructions, connections, population);
      }
      renderSummary();
      updatePointerFeedback();
      menu.showStatus(target?.kind === 'obstacle' ? 'Terreno despejado.'
        : 'Demolición realizada. Selecciona otra construcción o cancela el modo.');
    }, () => {
      pendingUpgrade = null;
      simulation.cancelDemolition();
      simulation.cancelBridge();
      bridgeOrigin = null;
      renderSelected();
      updatePointerFeedback();
      menu.renderMode(mode);
    }, () => {
      const cell = selection.selected;
      if (!cell || !constructions.terrain.at(cell)?.obstacle) return;
      mode = 'demolish';
      bridgeOrigin = null;
      menu.renderMode(mode);
      requestRemoval(cell);
      renderSelected();
      updatePointerFeedback();
    }, () => {
      const cell = selection.selected;
      const upgrade = cell && mode === null ? simulation.roadUpgradeAt(cell) : null;
      if (!upgrade || simulation.paused || simulation.progress.roadLock(upgrade.next)) return;
      pendingUpgrade = upgrade.level;
      renderSelected();
    });
    const constructionControls = document.querySelector<HTMLElement>('#construction-menu')!;
    const updatePauseControls = (): void => {
      constructionControls.inert = simulation.paused;
    };
    updatePauseControls();
    const simulationPanel = new SimulationPanel(simulation, economy.history, () => {
      this.game.loop.resetDelta();
      updatePauseControls();
      updatePointerFeedback();
      renderSelected();
    });
    const selectExisting = (cell: Cell) => {
      simulation.cancelDemolition();
      simulation.cancelBridge();
      pendingUpgrade = null;
      bridgeOrigin = null;
      selection.select(cell);
      renderMapSelection();
      renderSelected();
      updatePointerFeedback();
    };
    const voicesPanel = new VillageVoicesPanel(simulation.voices, cell => {
      if (constructions.getConstruction(cell) === 'house') selectExisting(cell);
    });
    const tradePanel = new TradePanel(simulation.trade, cell => {
      selectExisting(cell);
      view.focus(cell);
      syncCamera();
    }, () => {
      renderSelected();
      tradePanel.render(!!constructions.kingdomRoad);
    });
    const configuration = new ProductConfigurationPanel((cell, setting, product, enabled) => {
      if (simulation.crown.defeated) return;
      if (constructions.getConstruction(cell) !== (setting === 'sells' ? 'market' : 'warehouse')) return;
      if (setting === 'accepts') economy.setWarehouseAcceptance(cell, product, enabled);
      else if (setting === 'marketDispatch') economy.setWarehouseMarketDispatch(cell, product, enabled);
      else economy.setMarketSale(cell, product, enabled);
      simulation.refreshWorkforce();
      renderSummary();
      renderSelected();
    }, cell => {
      if (simulation.paused) return;
      const warehouse = economy.storage.warehouseAt(cell);
      if (!warehouse) return;
      economy.setWarehouseDraining(cell, !warehouse.draining);
      simulation.refreshWorkforce();
      renderSummary();
      renderSelected();
    });
    const menu = new ConstructionMenu((choice) => {
      mode = choice;
      pendingUpgrade = null;
      simulation.cancelDemolition();
      simulation.cancelBridge();
      bridgeOrigin = null;
      if (mode && mode !== 'demolish') {
        const issue = simulation.costIssue(constructionCosts[mode]);
        if (issue) menu.showStatus(issue);
      }
      renderSelected();
      updatePointerFeedback();
    });

    const chapterDialog = new ChapterDialog(simulation, () => {
      this.game.loop.resetDelta();
      chronicles.render();
      kingdomPanel.render();
    });
    const chronicles = new ChroniclesPanel(simulation, rank => {
      renderSummary();
      renderSelected();
      chapterDialog.open(rank, 'story', true);
    }, (rank, track) => chapterDialog.open(rank, track));
    const kingdomPanel = new KingdomEventsPanel(simulation, chapterDialog, () => {
      renderSummary();
      renderSelected();
      updatePointerFeedback();
    });
    const openDecree = () => {
      simulation.crown.takeDecree();
      chapterDialog.openRoyal(royalDecree, status => simulation.crown.markDecree(status));
    };
    const crownPanel = new CrownPanel(simulation, economy, () => {
      renderSummary();
      renderSelected();
      updatePointerFeedback();
    }, openDecree);
    const tabs = new CityTabs(() => { renderSelected(); tradePanel.render(!!constructions.kingdomRoad); });
    const saves = new SavePanel(this.saveSlots, session, () => selection.selected, () => view.view, (next, cell, savedCamera) => {
      this.session = next;
      this.selectedCell = cell;
      this.cameraView = savedCamera;
      this.game.loop.resetDelta();
      this.scene.restart();
    });
    let defeatShown = false;
    const openDefeat = () => chapterDialog.openRoyal({
      ...royalDefeat, text: royalDefeat.text + '\n\n' + simulation.crown.defeatReason,
    }, () => {}, () => saves.open());
    document.getElementById('royal-summary')!.addEventListener('click', openDefeat, visibilityOptions);
    document.getElementById('royal-new-or-load')!.addEventListener('click', () => saves.open(), visibilityOptions);
    document.getElementById('royal-recover')!.addEventListener('click', () => {
      document.getElementById('tab-chronicles')!.click();
      document.querySelector<HTMLDetailsElement>('#crown-section')!.open = true;
      document.getElementById('crown-section')!.scrollIntoView({ block: 'nearest' });
    }, visibilityOptions);
    const renderRoyalScene = (): void => {
      if (document.querySelector('dialog[open]')) return;
      if (simulation.crown.defeated) {
        if (defeatShown) return;
        defeatShown = true;
        updatePauseControls();
        openDefeat();
      } else if (simulation.crown.takeConfidenceDecree()) {
        chapterDialog.openRoyal(royalLastWarning, status => simulation.crown.markConfidenceDecree(status));
      } else if (simulation.crown.takeDecree()) openDecree();
      else {
        const mission = simulation.kingdomEvents.takeNotice();
        if (mission) kingdomPanel.open(mission);
      }
    };
    window.addEventListener('pagehide', () => this.saveSlots.checkpointTab(session, selection.selected, view.view), visibilityOptions);
    if (constructions.villageCenter) menu.disableVillageCenter();
    centerButton.disabled = !constructions.villageCenter;
    renderSummary();
    renderSelected();

    const clickCell = (cell: Cell): void => {
      pendingUpgrade = null;
      selection.select(constructions.constructionAt(cell)?.cell ?? cell);
      if (mode === 'demolish') {
        requestRemoval(cell);
      } else if (mode === 'bridge' && !simulation.paused) {
        if (!bridgeOrigin || constructions.getConstruction(cell) === 'road') {
          simulation.cancelBridge();
          const issue = simulation.bridgeOriginIssue(cell);
          if (!issue) bridgeOrigin = cell;
          menu.showStatus(issue ?? 'Selecciona una casilla de agua en línea recta para revisar el cruce.');
        } else {
          const issue = simulation.requestBridge(bridgeOrigin, cell);
          menu.showStatus(issue ?? 'Revisa el costo total y confirma el puente en el inspector.');
        }
      } else if (mode && !simulation.paused) {
        const issue = simulation.build(cell, mode);
        if (issue) {
          menu.showStatus(issue);
        } else {
          renderSummary();
          map.renderConstructions(constructions, connections, population);
          if (mode === 'villageCenter') {
            menu.disableVillageCenter();
            centerButton.disabled = false;
            mode = null;
          }
          menu.renderMode(mode);
        }
      }
      renderMapSelection();
      renderSelected();
      hoveredCell = cell;
      updatePointerFeedback();
    };
    const mapInput = bindMapInput(this.game.canvas, view, () => this.scale.gameSize, syncCamera, cell => {
      if (cell?.column === hoveredCell?.column && cell?.row === hoveredCell?.row) return;
      hoveredCell = cell;
      updatePointerFeedback();
    }, clickCell, sceneEvents.signal);
    const layout = (): void => {
      const { width, height } = this.scale.gameSize;
      const headerHeight = Math.min(80, height * 0.25);
      const size = Math.max(1, Math.floor(Math.min(width - 32, height - headerHeight - 32)));
      const x = Math.floor((width - size) / 2);
      const y = Math.floor(headerHeight + (height - headerHeight - size) / 2);
      view.setViewport({ x, y, size });
      camera.setViewport(x, y, size, size);
      syncCamera();
      mapInput.refreshHover();
    };
    centerButton.addEventListener('click', () => {
      const center = constructions.villageCenter;
      if (!center) return;
      view.focus(center);
      syncCamera();
      mapInput.refreshHover();
      this.game.canvas.focus({ preventScroll: true });
    }, visibilityOptions);
    layout();
    renderMapSelection();
    if (session.takeIntroduction()) chapterDialog.open('aldea', 'story', true);
    this.events.on(Phaser.Scenes.Events.UPDATE, updateSimulation);
    this.scale.on(Phaser.Scale.Events.RESIZE, layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, layout);
      this.events.off(Phaser.Scenes.Events.UPDATE, updateSimulation);
      sceneEvents.abort();
      map.destroy();
      transports.destroy();
      resourceBar.destroy();
      tabs.destroy();
      chapterDialog.destroy();
      chronicles.destroy();
      crownPanel.destroy();
      tradePanel.destroy();
      kingdomPanel.destroy();
      simulationPanel.destroy();
      voicesPanel.destroy();
      configuration.destroy();
      panel.destroy();
      menu.destroy();
      saves.destroy();
      if (this.session === session) {
        this.selectedCell = selection.selected;
        this.cameraView = view.view;
      }
    });
  }
}
