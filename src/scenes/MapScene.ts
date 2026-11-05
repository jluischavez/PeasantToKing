import { SimulationPanel } from '../ui/SimulationPanel';
import { VillageVoicesPanel } from '../ui/VillageVoicesPanel';
import { ProductConfigurationPanel } from '../ui/ProductConfigurationPanel';
import Phaser from 'phaser';
import { GridMap } from '../map/GridMap';
import { MapCamera, cellSize } from '../map/MapCamera';
import type { CameraView } from '../map/MapCamera';
import { startingCell } from '../map/World';
import { housingArt } from '../map/HousingArt';
import { CellSelection } from '../map/CellSelection';
import type { Cell } from '../map/CellSelection';
import { constructionNames } from '../map/ConstructionMap';
import { constructionCosts, demolitionCost } from '../map/ConstructionCosts';
import { SelectionPanel } from '../ui/SelectionPanel';
import { ConstructionMenu, formatCost } from '../ui/ConstructionMenu';
import type { ConstructionMode } from '../ui/ConstructionMenu';
import { getRoadMask } from '../map/RoadAppearance';
import { ResourceBar } from '../ui/ResourceBar';
import { CityAlerts } from '../ui/CityAlerts';
import { CityTabs } from '../ui/CityTabs';
import { populationRules } from '../population/Population';
import { PopulationPanel } from '../ui/PopulationPanel';
import { Session } from '../persistence/Session';
import { SaveSlots } from '../persistence/SaveSlots';
import { SavePanel } from '../ui/SavePanel';
import { bindMapInput } from './MapInput';

export class MapScene extends Phaser.Scene {
  private session = Session.start();
  private selectedCell: Cell | null = null;
  private cameraView?: CameraView;
  private readonly saveSlots = new SaveSlots();
  constructor() {
    super('MapScene');
  }

  preload(): void {
    for (const { texture, url } of Object.values(housingArt)) {
      if (!this.textures.exists(texture)) this.load.image(texture, url);
    }
  }

  create(): void {
    const session = this.session;
    const { map: constructions, world, connections, economy, population, simulation } = session;
    const map = new GridMap(this, world);
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
    const resourceBar = new ResourceBar(economy.currentTaxPolicy, policy => {
      economy.setTaxPolicy(policy);
      renderSummary();
    });
    const populationPanel = new PopulationPanel();
    const alerts = new CityAlerts();
    const renderSummary = (): void => {
      const net = resourceBar.render(economy.resources, economy.perSecond, {
        reserve: economy.storage.initialFoodReserve, availableFood: population.connectedCapacity > 0 ? economy.availableFood : 0,
        sales: economy.distribution.salesByProductPerSecond, bootstrap: economy.distribution.bootstrapActive,
        constructionReserve: economy.storage.constructionWoodReserve, constructionWood: economy.availableConstructionWood,
        costs: economy.operatingCostsPerHour(population.employed), taxes: economy.taxIncomePerHour(population.total),
      });
      const supply = economy.immigrationSupply(population, populationRules.familySize,
        populationRules.immigrationIntervalSeconds, populationRules.foodPerResidentPerSecond,
        populationRules.residentsPerPlot);
      const city = simulation.wellbeing.summarize(population.residencesSnapshot);
      const attraction = simulation.migrationAttractiveness(city.happiness);
      const reason = population.availableHousing > 0
        && !simulation.wellbeing.admissionsOpen(simulation.simulatedTimeMs, city.happiness)
        ? 'Admisiones en pausa hasta que se recupere el bienestar.'
        : economy.migrationReason(population, supply, attraction);
      const needs = simulation.needs.summarize(population.residencesSnapshot);
      populationPanel.render(population, attraction, city, reason, economy.distribution.cumulativeFoodShortage, needs);
      alerts.render(constructions, connections, needs, economy.storage.fullWarehouseCount, economy.blockedProducers, net);
      menu.renderCosts(cost => simulation.costIssue(cost));
    };
    const renderSelected = (): void => {
      const cell = selection.selected;
      const type = cell ? constructions.getConstruction(cell) : null;
      const warehouse = cell && type === 'warehouse' ? economy.storage.warehouseAt(cell) : undefined;
      const market = cell && type === 'market' ? economy.distribution.marketAt(cell) : undefined;
      const home = type === 'house' ? cell : null;
      panel.render(cell, type,
        cell !== null && connections.isConnected(cell), home ? population.residentsAt(home) : 0,
        cell ? economy.productivityAt(cell) : undefined, warehouse, market,
        home ? economy.distribution.supplyAt(home) : undefined, home ? economy.distribution.foodShortageAt(home) : 0,
        home ? economy.distribution.supplyAt(home, 'wood') : undefined, home ? economy.distribution.woodShortageAt(home) : 0,
        home ? simulation.wellbeing.at(home) : undefined, home ? simulation.water.suppliedAt(home) : 0,
        cell && type === 'well' ? simulation.water.wellAt(cell) : undefined,
        home ? { level: population.housingLevelAt(home), progress: simulation.housing.at(home) } : undefined);
      const demolition = simulation.demolitionTarget;
      const departing = demolition?.type === 'house' ? population.residentsAt(demolition.cell) : 0;
      const departure = departing === 1 ? ' · 1 habitante abandonará la ciudad.'
        : departing > 1 ? ' · ' + departing + ' habitantes abandonarán la ciudad.' : '';
      panel.renderDemolition(demolition ? constructionNames[demolition.type] + ' · ' + formatCost(demolitionCost) + departure : null,
        demolition ? simulation.demolitionIssue(demolition.cell) : null);
      simulationPanel.render(cell && type ? type + ':' + cell.column + ',' + cell.row : null);
      configuration.render(cell, warehouse, market, simulation.paused);
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
    };
    let mode: ConstructionMode = null;
    let hoveredCell: Cell | null = null;
    const updatePointerFeedback = (): void => {
      if (simulation.paused) {
        map.renderHover(null);
        map.renderPreview(null, null, false);
        return;
      }
      const buildType = mode === 'demolish' ? null : mode;
      map.renderHover(mode ? hoveredCell : null);
      map.renderPreview(hoveredCell, buildType,
        !!(hoveredCell && buildType && simulation.constructionIssue(hoveredCell, buildType) === null),
        buildType === 'road' && hoveredCell ? getRoadMask(constructions, hoveredCell) : 0);
    };
    const clearSelection = (): void => {
      simulation.cancelDemolition();
      selection.clear();
      map.renderSelection(selection.selected);
      renderSelected();
    };
    const panel = new SelectionPanel(clearSelection, () => {
      const issue = simulation.confirmDemolition();
      if (issue) {
        menu.showStatus(issue);
        renderSelected();
        return;
      }
      clearSelection();
      renderSummary();
      map.renderConstructions(constructions, connections, population);
      updatePointerFeedback();
      menu.showStatus('Demolición realizada. Selecciona otra construcción o cancela el modo.');
    }, () => {
      simulation.cancelDemolition();
      renderSelected();
      menu.renderMode(mode);
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
    const voicesPanel = new VillageVoicesPanel(simulation.voices, cell => {
      if (constructions.getConstruction(cell) !== 'house') return;
      simulation.cancelDemolition();
      selection.select(cell);
      map.renderSelection(selection.selected);
      renderSelected();
    });
    const configuration = new ProductConfigurationPanel((cell, setting, product, enabled) => {
      if (constructions.getConstruction(cell) !== (setting === 'sells' ? 'market' : 'warehouse')) return;
      if (setting === 'accepts') economy.setWarehouseAcceptance(cell, product, enabled);
      else if (setting === 'marketDispatch') economy.setWarehouseMarketDispatch(cell, product, enabled);
      else economy.setMarketSale(cell, product, enabled);
      renderSummary();
      renderSelected();
    }, cell => {
      if (simulation.paused) return;
      const warehouse = economy.storage.warehouseAt(cell);
      if (!warehouse) return;
      economy.setWarehouseDraining(cell, !warehouse.draining);
      renderSummary();
      renderSelected();
    });
    const menu = new ConstructionMenu((choice) => {
      mode = choice;
      simulation.cancelDemolition();
      if (mode && mode !== 'demolish') {
        const issue = simulation.costIssue(constructionCosts[mode]);
        if (issue) menu.showStatus(issue);
      }
      renderSelected();
      updatePointerFeedback();
    });

    const tabs = new CityTabs(renderSelected);
    const saves = new SavePanel(this.saveSlots, session, () => selection.selected, () => view.view, (next, cell, savedCamera) => {
      this.session = next;
      this.selectedCell = cell;
      this.cameraView = savedCamera;
      this.game.loop.resetDelta();
      this.scene.restart();
    });
    if (constructions.villageCenter) menu.disableVillageCenter();
    centerButton.disabled = !constructions.villageCenter;
    renderSummary();
    renderSelected();

    const clickCell = (cell: Cell): void => {
      selection.select(cell);
      if (mode === 'demolish') {
        const issue = simulation.requestDemolition(cell);
        menu.showStatus(issue ?? 'Revisa el costo y confirma la demolición en el inspector.');
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
      map.renderSelection(selection.selected);
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
    map.renderSelection(selection.selected);
    this.events.on(Phaser.Scenes.Events.UPDATE, updateSimulation);
    this.scale.on(Phaser.Scale.Events.RESIZE, layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, layout);
      this.events.off(Phaser.Scenes.Events.UPDATE, updateSimulation);
      sceneEvents.abort();
      resourceBar.destroy();
      tabs.destroy();
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
