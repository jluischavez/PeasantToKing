import { SimulationPanel } from '../ui/SimulationPanel';
import { ProductConfigurationPanel } from '../ui/ProductConfigurationPanel';
import Phaser from 'phaser';
import { GridMap } from '../map/GridMap';
import { CellSelection } from '../map/CellSelection';
import type { Cell } from '../map/CellSelection';
import { ConstructionMap } from '../map/ConstructionMap';
import type { ConstructionType } from '../map/ConstructionMap';
import { SelectionPanel } from '../ui/SelectionPanel';
import { ConstructionMenu } from '../ui/ConstructionMenu';
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
        reserve: economy.storage.initialFoodReserve, availableFood: economy.availableFood,
        blocked: economy.blockedProducers, bootstrap: economy.distribution.bootstrapActive,
      });
      const supply = economy.immigrationSupply(population, populationRules.familySize,
        populationRules.immigrationIntervalSeconds, populationRules.foodPerResidentPerSecond,
        populationRules.residentsPerPlot);
      populationPanel.render(population, economy.availableFood, supply, economy.migrationReason(population, supply));
    };
    renderSummary();
    const renderSelected = (): void => {
      const cell = selection.selected;
      panel.render(cell, cell ? constructions.getConstruction(cell) : null,
        cell !== null && connections.isConnected(cell), cell ? population.residentsAt(cell) : 0,
        cell ? economy.productivityAt(cell) : undefined,
        cell ? economy.storage.warehouseAt(cell) : undefined,
        cell ? economy.distribution.marketAt(cell) : undefined,
        cell && constructions.getConstruction(cell) === 'house' ? economy.distribution.supplyAt(cell) : undefined);
      const type = cell && constructions.getConstruction(cell);
      simulationPanel.render(cell && type ? type + ':' + cell.column + ',' + cell.row : null);
      configuration.render(cell, cell ? economy.storage.warehouseAt(cell) : undefined,
        cell ? economy.distribution.marketAt(cell) : undefined);
    };
    const updateSimulation = (_time: number, delta: number): void => {
      const previousPopulation = population.total;
      if (simulation.advance(delta)) {
        renderSummary();
        renderSelected();
        if (population.total !== previousPopulation) {
          map.renderConstructions(constructions, connections, population);
        }
      }
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, updateSimulation);
    let buildType: ConstructionType | null = null;
    let hoveredCell: Cell | null = null;
    const updatePointerFeedback = (): void => {
      if (simulation.paused) {
        map.renderHover(null);
        map.renderPreview(null, null, false);
        return;
      }
      map.renderHover(buildType ? hoveredCell : null);
      map.renderPreview(hoveredCell, buildType,
        hoveredCell !== null && constructions.canPlace(hoveredCell, buildType ?? undefined),
        buildType === 'road' && hoveredCell ? getRoadMask(constructions, hoveredCell) : 0);
    };
    const panel = new SelectionPanel(() => {
      selection.clear();
      map.renderSelection(selection.selected);
      renderSelected();
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
    });
    const configuration = new ProductConfigurationPanel((cell, kind, product, enabled) => {
      if (simulation.paused || constructions.getConstruction(cell) !== kind) return;
      if (kind === 'warehouse') economy.setWarehouseAcceptance(cell, product, enabled);
      else economy.setMarketSale(cell, product, enabled);
      renderSummary();
      renderSelected();
    });
    const menu = new ConstructionMenu((type) => {
      buildType = type;
      updatePointerFeedback();
    });

    if (constructions.villageCenter) menu.disableVillageCenter();

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
      if (!simulation.paused && buildType && constructions.place(cell, buildType)) {
        simulation.recalculate();
        renderSummary();
        map.renderConstructions(constructions, connections, population);
        if (buildType === 'villageCenter') {
          menu.disableVillageCenter();
          buildType = null;
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
