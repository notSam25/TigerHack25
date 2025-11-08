export class SoundManager {
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private backgroundMusic: HTMLAudioElement | null = null;
  private muted: boolean = false;
  private volume: number = 0.5;
  private musicVolume: number = 0.3;

  constructor() {
    this.loadSounds();
    this.loadBackgroundMusic();
  }

  private loadSounds() {
    const soundFiles = {
      explosion: '/assets/sounds/explosion.mp3',
      invalidPlacement: '/assets/sounds/invalid placement.mp3',
      laser: '/assets/sounds/laser.mp3',
      missileFire: '/assets/sounds/missile fire.mp3',
      pickup: '/assets/sounds/pickup.mp3',
      placeBuilding: '/assets/sounds/place building.mp3',
      trash: '/assets/sounds/trash.mp3',
    };

    for (const [name, path] of Object.entries(soundFiles)) {
      const audio = new Audio(path);
      audio.volume = this.volume;
      this.sounds.set(name, audio);
    }
  }

  private loadBackgroundMusic() {
    this.backgroundMusic = new Audio('/assets/sounds/background noise.mp3');
    this.backgroundMusic.loop = true;
    this.backgroundMusic.volume = this.musicVolume;
  }

  playBackgroundMusic() {
    if (this.backgroundMusic && !this.muted) {
      this.backgroundMusic.play().catch(err => {
        console.warn('Failed to play background music:', err);
      });
    }
  }

  stopBackgroundMusic() {
    if (this.backgroundMusic) {
      this.backgroundMusic.pause();
      this.backgroundMusic.currentTime = 0;
    }
  }

  play(soundName: string) {
    if (this.muted) return;

    const sound = this.sounds.get(soundName);
    if (sound) {
      // Clone the audio to allow overlapping sounds
      const clone = sound.cloneNode() as HTMLAudioElement;
      clone.volume = this.volume;
      clone.play().catch(err => {
        console.warn(`Failed to play sound ${soundName}:`, err);
      });
    } else {
      console.warn(`Sound ${soundName} not found`);
    }
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    for (const sound of this.sounds.values()) {
      sound.volume = this.volume;
    }
  }

  setMusicVolume(volume: number) {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.backgroundMusic) {
      this.backgroundMusic.volume = this.musicVolume;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) {
      this.stopBackgroundMusic();
    } else {
      this.playBackgroundMusic();
    }
    return this.muted;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.muted) {
      this.stopBackgroundMusic();
    } else {
      this.playBackgroundMusic();
    }
  }

  isMuted(): boolean {
    return this.muted;
  }
}
