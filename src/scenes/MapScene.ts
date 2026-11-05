import { SimulationPanel } from '../ui/SimulationPanel';
import { ProductConfigurationPanel } from '../ui/ProductConfigurationPanel';
import Phaser from 'phaser';
import { GridMap } from '../map/GridMap';
import { CellSelection } from '../map/CellSelection';
import type { Cell } from '../map/CellSelection';
import { ConstructionMap, constructionNames } from '../map/ConstructionMap';
import { constructionCosts, demolitionCost } from '../map/ConstructionCosts';
import { SelectionPanel } from '../ui/SelectionPanel';
import { ConstructionMenu, formatCost } from '../ui/ConstructionMenu';
import type { ConstructionMode } from '../ui/ConstructionMenu';
import { RoadConnections } from '../map/RoadConnections';
import { getRoadMask } from '../map/RoadAppearance';
import { Economy } from '../economy/Economy';
import { ResourceBar } from '../ui/ResourceBar';
import { Population, populationRules } from '../population/Population';
import { PopulationPanel } from '../ui/PopulationPanel';
import { SettlementSimulation } from '../simulation/SettlementSimulation';

export class MapScene extends Phaser.Scene {
  // Settlement state survives scene/UI reconstruction; a new scene starts a new game.
  private readonly economy = new Economy();
  private readonly population = new Population();
  private readonly connections = new RoadConnections();
  private constructions: ConstructionMap | null = null;
  private simulation: SettlementSimulation | null = null;
  constructor() {
    super('MapScene');
  }

  create(): void {
    const title = this.add.text(0, 0, 'Peasant to King', {
      fontFamily: 'Georgia, serif',
      color: '#ecd5a2',
    }).setOrigin(0.5);
    const map = new GridMap(this);
    const selection = new CellSelection();
    const constructions = this.constructions ??= new ConstructionMap(map.columns, map.rows);
    const { connections, economy, population } = this;
    const simulation = this.simulation ??= new SettlementSimulation(
      economy, population, populationRules.immigrationIntervalSeconds, constructions, connections);
    simulation.recalculate();
    const resourceBar = new ResourceBar();
    const populationPanel = new PopulationPanel();
    const renderSummary = (): void => {
      resourceBar.render(economy.resources, economy.perSecond, {
        reserve: economy.storage.initialFoodReserve, availableFood: population.connectedCapacity > 0 ? economy.availableFood : 0,
        blocked: economy.blockedProducers, bootstrap: economy.distribution.bootstrapActive,
        constructionReserve: economy.storage.constructionWoodReserve, constructionWood: economy.availableConstructionWood,
      });
      const supply = economy.immigrationSupply(population, populationRules.familySize,
        populationRules.immigrationIntervalSeconds, populationRules.foodPerResidentPerSecond,
        populationRules.residentsPerPlot);
      populationPanel.render(population, economy.availableFood, supply, economy.migrationReason(population, supply),
        economy.distribution.cumulativeFoodShortage);
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
        home ? economy.distribution.supplyAt(home) : undefined, home ? economy.distribution.foodShortageAt(home) : 0);
      const demolition = simulation.demolitionTarget;
      const departing = demolition?.type === 'house' ? population.residentsAt(demolition.cell) : 0;
      const departure = departing === 1 ? ' · 1 habitante abandonará la ciudad.'
        : departing > 1 ? ' · ' + departing + ' habitantes abandonarán la ciudad.' : '';
      panel.renderDemolition(demolition ? constructionNames[demolition.type] + ' · ' + formatCost(demolitionCost) + departure : null,
        demolition ? simulation.demolitionIssue(demolition.cell) : null);
      simulationPanel.render(cell && type ? type + ':' + cell.column + ',' + cell.row : null);
      configuration.render(cell, warehouse, market);
    };
    const updateSimulation = (_time: number, delta: number): void => {
      const previousPopulation = population.total;
      if (simulation.advance(delta)) {
        renderSummary();
        renderSelected();
        updatePointerFeedback();
        if (population.total !== previousPopulation) {
          map.renderConstructions(constructions, connections, population);
        }
      }
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, updateSimulation);
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
    const settings = document.querySelector<HTMLFieldSetElement>('#product-configuration')!;
    const constructionControls = document.querySelector<HTMLElement>('#construction-menu')!;
    const updatePauseControls = (): void => {
      settings.disabled = simulation.paused;
      constructionControls.inert = simulation.paused;
    };
    updatePauseControls();
    const simulationPanel = new SimulationPanel(simulation, economy.history, () => {
      updatePauseControls();
      updatePointerFeedback();
      renderSelected();
    });
    const configuration = new ProductConfigurationPanel((cell, kind, product, enabled) => {
      if (simulation.paused || constructions.getConstruction(cell) !== kind) return;
      if (kind === 'warehouse') economy.setWarehouseAcceptance(cell, product, enabled);
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

    if (constructions.villageCenter) menu.disableVillageCenter();
    renderSummary();

    const layout = (): void => {
      const { width, height } = this.scale;
      const headerHeight = Math.min(80, height * 0.25);
      const size = Math.max(0, Math.min(width - 32, height - headerHeight - 32));
      title.setPosition(width / 2, headerHeight / 2);
      title.setFontSize(Math.min(36, width / 10, headerHeight * 0.55));
      map.layout((width - size) / 2, headerHeight + (height - headerHeight - size) / 2, size);
      map.renderConstructions(constructions, connections, population);
      map.renderSelection(selection.selected);
      hoveredCell = null;
      updatePointerFeedback();
    };

    layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, layout);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      hoveredCell = map.getCellAt(pointer.x, pointer.y);
      updatePointerFeedback();
    });
    this.input.on(Phaser.Input.Events.GAME_OUT, () => {
      hoveredCell = null;
      updatePointerFeedback();
    });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) return;
      const cell = map.getCellAt(pointer.x, pointer.y);
      if (!cell) return;
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
            mode = null;
          }
          menu.renderMode(mode);
        }
      }
      map.renderSelection(selection.selected);
      renderSelected();
      hoveredCell = cell;
      updatePointerFeedback();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, layout);
      this.events.off(Phaser.Scenes.Events.UPDATE, updateSimulation);
      simulationPanel.destroy();
      configuration.destroy();
      panel.destroy();
      menu.destroy();
    });
  }
}
