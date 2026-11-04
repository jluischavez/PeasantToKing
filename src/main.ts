import Phaser from 'phaser';
import './style.css';

class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create(): void {
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    this.add.text(centerX, centerY - 35, 'Peasant to King', {
      fontFamily: 'Georgia, serif',
      fontSize: '56px',
      color: '#ecd5a2',
    }).setOrigin(0.5);

    this.add.text(centerX, centerY + 40, 'Prototipo — Etapa 00', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '24px',
      color: '#c1c7b7',
    }).setOrigin(0.5);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 540,
  backgroundColor: '#1c211d',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: TitleScene,
});
