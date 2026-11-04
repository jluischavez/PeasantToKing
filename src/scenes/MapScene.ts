import Phaser from 'phaser';
import { GridMap } from '../map/GridMap';

export class MapScene extends Phaser.Scene {
  constructor() {
    super('MapScene');
  }

  create(): void {
    const title = this.add.text(0, 0, 'Peasant to King', {
      fontFamily: 'Georgia, serif',
      color: '#ecd5a2',
    }).setOrigin(0.5);
    const map = new GridMap(this);

    const layout = (): void => {
      const { width, height } = this.scale;
      const headerHeight = Math.min(80, height * 0.25);
      const size = Math.max(0, Math.min(width - 32, height - headerHeight - 32));
      title.setPosition(width / 2, headerHeight / 2);
      title.setFontSize(Math.min(36, width / 10, headerHeight * 0.55));
      map.layout((width - size) / 2, headerHeight + (height - headerHeight - size) / 2, size);
    };

    layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, layout);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      map.highlightAt(pointer.x, pointer.y);
    });
    this.input.on(Phaser.Input.Events.GAME_OUT, () => map.clearHighlight());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, layout);
    });
  }
}
