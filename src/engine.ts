import { Application, Container, Graphics, Ticker, Text, Sprite, Texture } from "pixi.js";
import { Renderer } from "./renderer";
import { GameSprite, GridCell, Grid, PlanetSprite, ExplosionSprite, createSprite, applyGravityField } from "./sprite";
import { SoundManager } from "./soundManager";
import {
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_SPEED,
  NUM_ASTEROIDS,
  NUM_BLACK_HOLES,
  ASTEROID_RADIUS,
  BLACK_HOLE_RADIUS,
  PLANET_RADIUS,
  ASTEROID_ROTATION_MIN,
  ASTEROID_ROTATION_MAX,
  PLANET_ROTATION_MIN,
  PLANET_ROTATION_MAX,
  BLACK_HOLE_TILES,
  PLANET_TILES,
  TURRET_TILES,
  TILE_SIZE as CONST_TILE_SIZE,
} from "./constants";

type Star = { graphics: Graphics; speed: number; alphaDir: number };

export class Engine {
  private app: Application;
  private world: Container;
  private renderer: Renderer;
  private starArray: Star[];
  private TILE_SIZE: number;
  private GRID_WIDTH: number;
  private GRID_HEIGHT: number;
  private grid: Grid;
  private zoom = MIN_ZOOM;
  private targetZoom = MIN_ZOOM;

  // panning
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  
  // UI elements
  private uiContainer!: Container;
  private toolbar!: Container;
  private tooltipText?: Text;
  private tooltipBg?: Graphics;
  private highlightGraphic!: Graphics;
  
  // Drag/drop state
  private previewSprite: Sprite | null = null;
  private isDraggingFromToolbar = false;
  private selectedTexture: Texture | null = null;
  
  // Toolbar elements
  private trashCan!: Graphics;
  private bunnyTexture: Texture | null = null; // Bunny texture for projectiles
  private turretTexture: Texture | null = null;
  private gunTexture: Texture | null = null; // Gun texture for planet placement
  private explosionTexture: Texture | null = null;
  private missileTexture: Texture | null = null; // Missile projectile for regular turrets
  private laserTexture: Texture | null = null; // Laser projectile for laser turrets
  private gridToggleButton!: Graphics;
  private gridToggleText!: Text;
  
  // Grid visibility toggle
  private showGrid = false;
  private needsOccupiedCellsRedraw = false;
  
  // Bunny launch system
  private isLaunching = false;
  private launchStartPos: { x: number; y: number } | null = null;
  private launchSprite: GameSprite | null = null;
  private aimerGraphics!: Graphics;
  
  // Delete button drag system
  private isDraggingDeleteButton = false;
  private deleteButtonOriginalPos = { x: 460, y: 5 };
  private highlightedBuildingForDelete: GameSprite | null = null;
  
  // Planets for tracking
  private planets: PlanetSprite[] = [];
  
  // Active explosions
  private explosions: GameSprite[] = [];
  
  // Active projectiles (not in grid yet)
  private projectiles: GameSprite[] = [];

  // Sound manager
  private soundManager: SoundManager;

  // Game state
  private gameOver = false;
  private winner: string | null = null;
  private currentPlayer = 1; // 1 or 2
  
  // New resource systems
  private playerOre = [0, 500, 500]; // Ore for building
  private playerEnergy = [0, 100, 100]; // Current energy
  private playerMaxEnergy = [0, 100, 100]; // Max energy capacity
  private playerMineCount = [0, 0, 0]; // Number of mines owned by each player
  private playerSolarCount = [0, 0, 0]; // Number of solar panels owned by each player
  
  // Base planets (for win/loss detection)
  private player1Base: PlanetSprite | null = null;
  private player2Base: PlanetSprite | null = null;
  private shieldRadius: number = 0; // Shield radius for placement restriction
  
  // Game UI
  private gameOverContainer: Container | null = null;
  private gameInfoText: Text | null = null;
  private oreText: Text | null = null;
  private energyText: Text | null = null;
  private energyBarBg: Graphics | null = null;
  private energyBarFill: Graphics | null = null;
  private player1HealthText: Text | null = null;
  private player2HealthText: Text | null = null;
  private player1HealthBarBg: Graphics | null = null;
  private player1HealthBarFill: Graphics | null = null;
  private player2HealthBarBg: Graphics | null = null;
  private player2HealthBarFill: Graphics | null = null;
  private endTurnButton: Graphics | null = null;
  private endTurnText: Text | null = null;
  
  // Info panel
  private infoPanelContainer: Container | null = null;
  private infoPanelVisible: boolean = false;
  
  // New building textures
  private mineTexture: Texture | null = null;
  private solarPanelTexture: Texture | null = null;

  constructor(app: Application) {
    this.soundManager = new SoundManager();
    this.app = app;
    this.TILE_SIZE = CONST_TILE_SIZE;
    
    // Initialize grid dimensions based on screen size and min zoom
    this.GRID_WIDTH = Math.ceil(app.screen.width / (this.TILE_SIZE * MIN_ZOOM));
    this.GRID_HEIGHT = Math.ceil(app.screen.height / (this.TILE_SIZE * MIN_ZOOM));
    
    // Create stars FIRST (background layer)
    this.starArray = [];
    const NUM_STARS = 100;
    for (let i = 0; i < NUM_STARS; i++) {
      const g = new Graphics();
      const x = Math.random() * app.screen.width;
      const y = Math.random() * app.screen.height;
      const radius = Math.random() * 2 + 0.5;
      g.circle(0, 0, radius);
      g.fill(0xffffff);
      g.x = x;
      g.y = y;
      g.alpha = Math.random();
      app.stage.addChild(g);

      this.starArray.push({
        graphics: g,
        speed: Math.random() * 0.2 + 0.05,
        alphaDir: Math.random() < 0.5 ? 0.01 : -0.01,
      });
    }
    
    // Create world container (goes on top of stars)
    this.world = new Container();
    app.stage.addChild(this.world);
    
    // Initialize grid
    this.grid = [];
    for (let y = 0; y < this.GRID_HEIGHT; y++) {
      const row: GridCell[] = [];
      for (let x = 0; x < this.GRID_WIDTH; x++) {
        row.push({ gravity: { ax: 0, ay: 0 }, sprite: null, occupied: false });
      }
      this.grid.push(row);
    }
    
    // Create renderer
    const gridGraphics = new Graphics();
    this.world.addChild(gridGraphics);
    this.renderer = new Renderer(gridGraphics, this.TILE_SIZE, this.GRID_WIDTH, this.GRID_HEIGHT);

    // Create aimer graphics for trajectory preview
    this.aimerGraphics = new Graphics();
    this.world.addChild(this.aimerGraphics);

    // Create UI container (stays on top, doesn't zoom)
    this.uiContainer = new Container();
    app.stage.addChild(this.uiContainer);

    // Create highlight graphic for placement preview
    this.highlightGraphic = new Graphics();
    this.world.addChild(this.highlightGraphic);

    // initialize renderer zoom state (but don't draw grid - starts hidden)
    this.renderer.setZoom(this.zoom);
    this.renderer.hideGrid(); // Start with grid hidden
  }

  // Initialize toolbar with bunny, turret, and laser turret sprites
  initToolbar(bunnyTexture: Texture, turretTexture: Texture, laserTurretTexture: Texture, mineTexture: Texture, solarPanelTexture: Texture, missileTexture: Texture, laserTexture: Texture, oreIconTexture: Texture, energyIconTexture: Texture) {
    // Initialize tooltip first
    this.initTooltip();
    
    this.bunnyTexture = bunnyTexture;
    this.turretTexture = turretTexture;
    this.gunTexture = laserTurretTexture; // Reuse gunTexture variable for laser turret
    this.mineTexture = mineTexture;
    this.solarPanelTexture = solarPanelTexture;
    this.missileTexture = missileTexture;
    this.laserTexture = laserTexture;
    const BUNNY_TILES = 1;

    this.toolbar = new Container();
    this.toolbar.position.set(10, this.app.screen.height - 100);
    this.uiContainer.addChild(this.toolbar);

    // Toolbar background (wider to fit all sprites and trash)
    const toolbarBg = new Graphics();
    toolbarBg.rect(0, 0, 550, 90);
    toolbarBg.fill({ color: 0x222222, alpha: 0.9 });
    toolbarBg.stroke({ width: 2, color: 0x666666 });
    this.toolbar.addChild(toolbarBg);

    // Bunny sprite button
    const bunnyScale = ((this.TILE_SIZE * BUNNY_TILES * 0.8) / Math.max(bunnyTexture.width, bunnyTexture.height));
    const toolbarBunny = new Sprite(bunnyTexture);
    toolbarBunny.anchor.set(0.5);
    toolbarBunny.position.set(45, 45);
    toolbarBunny.scale.set(bunnyScale * 0.8);
    toolbarBunny.eventMode = "static";
    toolbarBunny.cursor = "pointer";
    this.toolbar.addChild(toolbarBunny);

    // Turret sprite button (bigger, not rotated)
    const turretScale = ((this.TILE_SIZE * TURRET_TILES) / Math.max(turretTexture.width, turretTexture.height));
    const toolbarTurret = new Sprite(turretTexture);
    toolbarTurret.anchor.set(0.5);
    toolbarTurret.position.set(125, 45);
    toolbarTurret.scale.set(turretScale * 0.8);
    toolbarTurret.eventMode = "static";
    toolbarTurret.cursor = "pointer";
    this.toolbar.addChild(toolbarTurret);
    
    // Laser Turret sprite button
    const laserTurretScale = ((this.TILE_SIZE * TURRET_TILES) / Math.max(laserTurretTexture.width, laserTurretTexture.height));
    const toolbarLaserTurret = new Sprite(laserTurretTexture);
    toolbarLaserTurret.anchor.set(0.5);
    toolbarLaserTurret.position.set(205, 45);
    toolbarLaserTurret.scale.set(laserTurretScale * 0.8);
    toolbarLaserTurret.eventMode = "static";
    toolbarLaserTurret.cursor = "pointer";
    this.toolbar.addChild(toolbarLaserTurret);
    
    // Mine sprite button
    const mineScale = ((this.TILE_SIZE * TURRET_TILES) / Math.max(mineTexture.width, mineTexture.height));
    const toolbarMine = new Sprite(mineTexture);
    toolbarMine.anchor.set(0.5);
    toolbarMine.position.set(285, 45);
    toolbarMine.scale.set(mineScale * 0.8);
    toolbarMine.eventMode = "static";
    toolbarMine.cursor = "pointer";
    this.toolbar.addChild(toolbarMine);
    
    // Solar Panel sprite button
    const solarScale = ((this.TILE_SIZE * TURRET_TILES) / Math.max(solarPanelTexture.width, solarPanelTexture.height));
    const toolbarSolar = new Sprite(solarPanelTexture);
    toolbarSolar.anchor.set(0.5);
    toolbarSolar.position.set(365, 45);
    toolbarSolar.scale.set(solarScale * 0.8);
    toolbarSolar.eventMode = "static";
    toolbarSolar.cursor = "pointer";
    this.toolbar.addChild(toolbarSolar);

    // Delete button (draggable X)
    this.trashCan = new Graphics();
    this.trashCan.rect(0, 0, 80, 80);
    this.trashCan.fill({ color: 0x880000, alpha: 0.8 });
    this.trashCan.stroke({ width: 2, color: 0xff0000 });
    this.trashCan.position.set(460, 5);
    this.trashCan.eventMode = 'static';
    this.trashCan.cursor = 'grab';
    this.toolbar.addChild(this.trashCan);

    // X icon on delete button
    const trashIcon = new Graphics();
    trashIcon.moveTo(20, 20);
    trashIcon.lineTo(60, 60);
    trashIcon.moveTo(60, 20);
    trashIcon.lineTo(20, 60);
    trashIcon.stroke({ width: 4, color: 0xffffff });
    this.trashCan.addChild(trashIcon);

    // Grid toggle button (top-right corner)
    this.gridToggleButton = new Graphics();
    this.gridToggleButton.rect(0, 0, 160, 40);
    this.gridToggleButton.fill({ color: 0xaa0000, alpha: 0.8 });
    this.gridToggleButton.stroke({ width: 2, color: 0xff0000 });
    this.gridToggleButton.position.set(this.app.screen.width - 170, 10);
    this.gridToggleButton.eventMode = "static";
    this.gridToggleButton.cursor = "pointer";
    this.uiContainer.addChild(this.gridToggleButton);

    this.gridToggleText = new Text({
      text: "Graphic Content: OFF",
      style: { fontSize: 14, fill: 0xffffff, fontWeight: "bold" },
    });
    this.gridToggleText.anchor.set(0.5);
    this.gridToggleText.position.set(80, 20);
    this.gridToggleButton.addChild(this.gridToggleText);

    // Grid toggle click handler
    this.gridToggleButton.on("pointerdown", (e: any) => {
      e.stopPropagation();
      this.showGrid = !this.showGrid;
      this.gridToggleText.text = this.showGrid ? "Graphic Content: ON" : "Graphic Content: OFF";
      
      // Update button color
      this.gridToggleButton.clear();
      this.gridToggleButton.rect(0, 0, 160, 40);
      if (this.showGrid) {
        this.gridToggleButton.fill({ color: 0x00aa00, alpha: 0.8 });
        this.gridToggleButton.stroke({ width: 2, color: 0x00ff00 });
      } else {
        this.gridToggleButton.fill({ color: 0xaa0000, alpha: 0.8 });
        this.gridToggleButton.stroke({ width: 2, color: 0xff0000 });
      }
      
      // Update grid visibility
      if (this.showGrid) {
        this.renderer.showGrid();
        this.needsOccupiedCellsRedraw = true;
      } else {
        this.renderer.hideGrid();
        this.needsOccupiedCellsRedraw = true;
      }
    });

    // Bunny click handler
    toolbarBunny.on("pointerdown", (e: any) => {
      e.stopPropagation();
      this.hideTooltip();
      this.isDraggingFromToolbar = true;
      this.selectedTexture = bunnyTexture;
      this.soundManager.play('pickup');

      this.previewSprite = new Sprite(bunnyTexture);
      this.previewSprite.anchor.set(0.5);
      this.previewSprite.alpha = 0.7;
      this.previewSprite.scale.set(bunnyScale);
      this.world.addChild(this.previewSprite);
    });

    // Turret click handler
    toolbarTurret.on("pointerdown", (e: any) => {
      e.stopPropagation();
      this.hideTooltip();
      this.isDraggingFromToolbar = true;
      this.selectedTexture = turretTexture;
      console.log("Selected TURRET from toolbar");
      this.soundManager.play('pickup');

      this.previewSprite = new Sprite(turretTexture);
      this.previewSprite.anchor.set(0.5);
      this.previewSprite.alpha = 0.7;
      this.previewSprite.scale.set(turretScale);
      this.world.addChild(this.previewSprite);
    });
    
    // Laser Turret click handler
    toolbarLaserTurret.on("pointerdown", (e: any) => {
      e.stopPropagation();
      this.hideTooltip();
      this.isDraggingFromToolbar = true;
      this.selectedTexture = laserTurretTexture;
      console.log("Selected LASER TURRET from toolbar");
      this.soundManager.play('pickup');

      this.previewSprite = new Sprite(laserTurretTexture);
      this.previewSprite.anchor.set(0.5);
      this.previewSprite.alpha = 0.7;
      this.previewSprite.scale.set(laserTurretScale);
      this.world.addChild(this.previewSprite);
    });
    
    // Mine click handler
    toolbarMine.on("pointerdown", (e: any) => {
      e.stopPropagation();
      this.hideTooltip();
      this.isDraggingFromToolbar = true;
      this.selectedTexture = mineTexture;
      console.log("Selected MINE from toolbar");
      this.soundManager.play('pickup');

      this.previewSprite = new Sprite(mineTexture);
      this.previewSprite.anchor.set(0.5);
      this.previewSprite.alpha = 0.7;
      this.previewSprite.scale.set(mineScale);
      this.world.addChild(this.previewSprite);
    });
    
    // Solar Panel click handler
    toolbarSolar.on("pointerdown", (e: any) => {
      e.stopPropagation();
      this.hideTooltip();
      this.isDraggingFromToolbar = true;
      this.selectedTexture = solarPanelTexture;
      console.log("Selected SOLAR PANEL from toolbar");
      this.soundManager.play('pickup');

      this.previewSprite = new Sprite(solarPanelTexture);
      this.previewSprite.anchor.set(0.5);
      this.previewSprite.alpha = 0.7;
      this.previewSprite.scale.set(solarScale);
      this.world.addChild(this.previewSprite);
    });
    
    // Delete button drag handler
    this.trashCan.on("pointerdown", (e: any) => {
      e.stopPropagation();
      this.isDraggingDeleteButton = true;
      this.trashCan.cursor = 'grabbing';
      this.deleteButtonOriginalPos = { 
        x: this.trashCan.position.x, 
        y: this.trashCan.position.y 
      };
      console.log("Started dragging delete button");
    });
    
    // Create UI panel in top-left for health and resources
    const uiPanel = new Container();
    uiPanel.position.set(20, 20);
    this.uiContainer.addChild(uiPanel);
    
    // Player 1 Planet health text
    const p1HealthText = new Text({
      text: `Player 1 Planet HP:`,
      style: {
        fontFamily: 'Orbitron',
        fontSize: 16,
        fontWeight: 'bold',
        fill: 0x4CAF50,
        stroke: { color: 0x000000, width: 3 },
      }
    });
    uiPanel.addChild(p1HealthText);
    
    // Player 1 health bar background
    this.player1HealthBarBg = new Graphics();
    this.player1HealthBarBg.rect(0, 0, 200, 20);
    this.player1HealthBarBg.fill({ color: 0x333333, alpha: 0.8 });
    this.player1HealthBarBg.stroke({ width: 2, color: 0x000000 });
    this.player1HealthBarBg.position.set(0, 25);
    uiPanel.addChild(this.player1HealthBarBg);
    
    // Player 1 health bar fill
    this.player1HealthBarFill = new Graphics();
    this.player1HealthBarFill.rect(0, 0, 200, 20);
    this.player1HealthBarFill.fill({ color: 0x4CAF50, alpha: 0.9 });
    this.player1HealthBarFill.position.set(0, 25);
    uiPanel.addChild(this.player1HealthBarFill);
    
    // Player 1 health text
    this.player1HealthText = new Text({
      text: '1000/1000',
      style: {
        fontFamily: 'Orbitron',
        fontSize: 14,
        fontWeight: 'bold',
        fill: 0xFFFFFF,
        stroke: { color: 0x000000, width: 2 },
      }
    });
    this.player1HealthText.position.set(210, 25);
    uiPanel.addChild(this.player1HealthText);
    
    // Player 2 Planet health text
    const p2HealthText = new Text({
      text: `Player 2 Planet HP:`,
      style: {
        fontFamily: 'Orbitron',
        fontSize: 16,
        fontWeight: 'bold',
        fill: 0x2196F3,
        stroke: { color: 0x000000, width: 3 },
      }
    });
    p2HealthText.position.set(0, 55);
    uiPanel.addChild(p2HealthText);
    
    // Player 2 health bar background
    this.player2HealthBarBg = new Graphics();
    this.player2HealthBarBg.rect(0, 0, 200, 20);
    this.player2HealthBarBg.fill({ color: 0x333333, alpha: 0.8 });
    this.player2HealthBarBg.stroke({ width: 2, color: 0x000000 });
    this.player2HealthBarBg.position.set(0, 80);
    uiPanel.addChild(this.player2HealthBarBg);
    
    // Player 2 health bar fill
    this.player2HealthBarFill = new Graphics();
    this.player2HealthBarFill.rect(0, 0, 200, 20);
    this.player2HealthBarFill.fill({ color: 0x2196F3, alpha: 0.9 });
    this.player2HealthBarFill.position.set(0, 80);
    uiPanel.addChild(this.player2HealthBarFill);
    
    // Player 2 health text
    this.player2HealthText = new Text({
      text: '1000/1000',
      style: {
        fontFamily: 'Orbitron',
        fontSize: 14,
        fontWeight: 'bold',
        fill: 0xFFFFFF,
        stroke: { color: 0x000000, width: 2 },
      }
    });
    this.player2HealthText.position.set(210, 80);
    uiPanel.addChild(this.player2HealthText);
    
    // Ore icon
    const oreIcon = new Sprite(oreIconTexture);
    oreIcon.width = 32;
    oreIcon.height = 32;
    oreIcon.position.set(0, 115);
    uiPanel.addChild(oreIcon);
    
    // Ore count text
    this.oreText = new Text({
      text: '500',
      style: {
        fontFamily: 'Orbitron',
        fontSize: 24,
        fontWeight: 'bold',
        fill: 0xFFD700,
        stroke: { color: 0x000000, width: 4 },
      }
    });
    this.oreText.position.set(40, 115);
    uiPanel.addChild(this.oreText);
    
    // Energy icon
    const energyIcon = new Sprite(energyIconTexture);
    energyIcon.width = 32;
    energyIcon.height = 32;
    energyIcon.position.set(0, 155);
    uiPanel.addChild(energyIcon);
    
    // Energy count text with bar
    this.energyText = new Text({
      text: '100',
      style: {
        fontFamily: 'Orbitron',
        fontSize: 24,
        fontWeight: 'bold',
        fill: 0xFFFF00,
        stroke: { color: 0x000000, width: 4 },
      }
    });
    this.energyText.position.set(40, 155);
    uiPanel.addChild(this.energyText);
    
    // Energy bar background
    this.energyBarBg = new Graphics();
    this.energyBarBg.rect(0, 0, 200, 20);
    this.energyBarBg.fill({ color: 0x333333, alpha: 0.8 });
    this.energyBarBg.stroke({ width: 2, color: 0x000000 });
    this.energyBarBg.position.set(40, 190);
    uiPanel.addChild(this.energyBarBg);
    
    // Energy bar fill
    this.energyBarFill = new Graphics();
    this.energyBarFill.rect(0, 0, 200, 20);
    this.energyBarFill.fill({ color: 0xFFFF00, alpha: 0.9 });
    this.energyBarFill.position.set(40, 190);
    uiPanel.addChild(this.energyBarFill);
    
    // Current turn indicator (top center)
    this.gameInfoText = new Text({
      text: `Player 1's Turn`,
      style: {
        fontFamily: 'Orbitron',
        fontSize: 32,
        fontWeight: 'bold',
        fill: 0x4CAF50,
        stroke: { color: 0x000000, width: 5 },
      }
    });
    this.gameInfoText.anchor.set(0.5, 0);
    this.gameInfoText.position.set(this.app.screen.width / 2, 20);
    this.uiContainer.addChild(this.gameInfoText);
    
    // Add end turn button (bottom right corner)
    this.endTurnButton = new Graphics();
    this.endTurnButton.roundRect(0, 0, 120, 40, 5);
    this.endTurnButton.fill({ color: 0xFF9800, alpha: 0.9 });
    this.endTurnButton.stroke({ width: 2, color: 0xFFFFFF });
    this.endTurnButton.position.set(this.app.screen.width - 140, this.app.screen.height - 60);
    this.endTurnButton.eventMode = 'static';
    this.endTurnButton.cursor = 'pointer';
    
    this.endTurnText = new Text({
      text: 'End Turn',
      style: {
        fontFamily: 'Orbitron',
        fontSize: 18,
        fontWeight: 'bold',
        fill: 0xFFFFFF,
      }
    });
    this.endTurnText.anchor.set(0.5);
    this.endTurnText.position.set(60, 20);
    this.endTurnButton.addChild(this.endTurnText);
    
    this.endTurnButton.on('pointerdown', (e: any) => {
      e.stopPropagation();
      this.endTurn();
    });
    
    this.uiContainer.addChild(this.endTurnButton);
    
    // Create info panel (initially hidden)
    this.createInfoPanel();
    
    // Add keyboard listener for 'I' key to toggle info panel
    window.addEventListener('keydown', (e) => {
      if (e.key === 'i' || e.key === 'I') {
        this.toggleInfoPanel();
      }
    });
  }
  
  // Create the info panel with building information
  createInfoPanel() {
    this.infoPanelContainer = new Container();
    this.infoPanelContainer.visible = false;
    
    // Background
    const bg = new Graphics();
    bg.rect(0, 0, 400, 450);
    bg.fill({ color: 0x000000, alpha: 0.9 });
    bg.stroke({ width: 3, color: 0x00FF00 });
    this.infoPanelContainer.addChild(bg);
    
    // Title
    const title = new Text({
      text: 'BUILDING INFO (Press I to close)',
      style: {
        fontFamily: 'Orbitron',
        fontSize: 18,
        fontWeight: 'bold',
        fill: 0x00FF00,
      }
    });
    title.position.set(10, 10);
    this.infoPanelContainer.addChild(title);
    
    // Building info text
    const infoText = new Text({
      text: [
        '',
        'TURRET',
        'Cost: 200 Ore + 30 Energy',
        'Damage: 200',
        'Ammo: 3 max, +1/turn',
        'Click and drag to fire',
        '',
        'LASER TURRET',
        'Cost: 300 Ore + 40 Energy',
        'Damage: 75 (faster projectile)',
        'Ammo: 6 max, +2/turn',
        'Click and drag to fire',
        '',
        'MINE',
        'Cost: 150 Ore + 20 Energy',
        'Generates +25 ore per turn',
        '',
        'SOLAR PANEL',
        'Cost: 100 Ore + 15 Energy',
        'Increases max energy by 50',
        '',
        'CONTROLS:',
        '- Left-click & drag to place/fire',
        '- Drag X button to delete buildings',
        '- Buildings must be in shield',
        '- Press I to toggle this panel',
      ].join('\n'),
      style: {
        fontFamily: 'Orbitron',
        fontSize: 13,
        fill: 0xFFFFFF,
        lineHeight: 20,
      }
    });
    infoText.position.set(15, 45);
    this.infoPanelContainer.addChild(infoText);
    
    // Position in center of screen
    this.infoPanelContainer.position.set(
      (this.app.screen.width - 400) / 2,
      (this.app.screen.height - 450) / 2
    );
    
    this.uiContainer.addChild(this.infoPanelContainer);
    
    // Add help text at bottom center
    const helpText = new Text({
      text: 'Press I for Building Info & Controls',
      style: {
        fontFamily: 'Orbitron',
        fontSize: 14,
        fontWeight: 'bold',
        fill: 0xFFFF00,
        stroke: { color: 0x000000, width: 3 },
      }
    });
    helpText.anchor.set(0.5, 1);
    helpText.position.set(this.app.screen.width / 2, this.app.screen.height - 10);
    this.uiContainer.addChild(helpText);
  }
  
  // Toggle info panel visibility
  toggleInfoPanel() {
    if (this.infoPanelContainer) {
      this.infoPanelVisible = !this.infoPanelVisible;
      this.infoPanelContainer.visible = this.infoPanelVisible;
    }
  }

  // Generate asteroids and planets
  generateWorld(asteroidTexture: Texture, planetTexture: Texture, shieldTexture?: Texture, blackHoleTexture?: Texture) {
    // Calculate scales based on TILE_SIZE
    const blackHoleScale = blackHoleTexture ? (this.TILE_SIZE * BLACK_HOLE_TILES) / blackHoleTexture.width : 1;
    const planetScale = (this.TILE_SIZE * PLANET_TILES) / planetTexture.width;

    // Shield radius is 2x the planet radius (expanded from 1.4x)
    this.shieldRadius = Math.round(PLANET_RADIUS * 2.0);

    // Generate planets FIRST (so asteroids can avoid them)
    const sharedRotationSpeed =
      (Math.random() * (PLANET_ROTATION_MAX - PLANET_ROTATION_MIN) +
        PLANET_ROTATION_MIN) *
      (Math.random() < 0.5 ? 1 : -1);
    
    // Random starting rotations for visual variety
    const planet1StartRotation = Math.random() * Math.PI * 2;
    const planet2StartRotation = Math.random() * Math.PI * 2;

    // Planet 1 (left side - close to edge, not in leftmost third)
    // Place in the range of 10-25% from left edge
    for (let attempt = 0; attempt < 100; attempt++) {
      const x = Math.floor(this.GRID_WIDTH * 0.1 + Math.random() * (this.GRID_WIDTH * 0.15));
      const y = Math.floor(Math.random() * this.GRID_HEIGHT);

      if (this.canPlaceInRadius(x, y, PLANET_RADIUS)) {
        const planet1 = createSprite("planet", {
          texture: planetTexture,
          rotationSpeed: sharedRotationSpeed,
          name: "Player 1 Base",
          centerX: x,
          centerY: y,
          shieldTexture: shieldTexture,
          initialRotation: planet1StartRotation,
        });
        (planet1.getDisplay() as Container).scale.set(planetScale);

        this.placeSprite(x, y, planet1);
        this.player1Base = planet1 as PlanetSprite; // Store reference
        
        // Create gravity field for planet
        applyGravityField(this.grid, x, y, 35, 0.5);
        
        break;
      }
    }

    // Planet 2 (right side - close to edge, mirror of planet 1)
    // Place in the range of 75-90% from left edge
    for (let attempt = 0; attempt < 100; attempt++) {
      const x = Math.floor(this.GRID_WIDTH * 0.75 + Math.random() * (this.GRID_WIDTH * 0.15));
      const y = Math.floor(Math.random() * this.GRID_HEIGHT);

      if (this.canPlaceInRadius(x, y, PLANET_RADIUS)) {
        const planet2 = createSprite("planet", {
          texture: planetTexture,
          rotationSpeed: sharedRotationSpeed,
          name: "Player 2 Base",
          centerX: x,
          centerY: y,
          shieldTexture: shieldTexture,
          initialRotation: planet2StartRotation,
        });
        (planet2.getDisplay() as Container).scale.set(planetScale);

        this.placeSprite(x, y, planet2);
        this.player2Base = planet2 as PlanetSprite; // Store reference
        
        // Create gravity field for planet
        applyGravityField(this.grid, x, y, 35, 0.5);
        
        break;
      }
    }

    // Generate asteroids (avoiding planet shields)
    let placed = 0;
    let attempts = 0;
    const maxAttempts = NUM_ASTEROIDS * 10;

    while (placed < NUM_ASTEROIDS && attempts < maxAttempts) {
      attempts++;
      const x = Math.floor(Math.random() * this.GRID_WIDTH);
      const y = Math.floor(Math.random() * this.GRID_HEIGHT);

      // Check if position is valid and not within shield radius of any planet
      let tooCloseToShield = false;
      for (const planet of this.planets) {
        const dx = x - planet.centerX;
        const dy = y - planet.centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < this.shieldRadius) {
          tooCloseToShield = true;
          break;
        }
      }

      if (!tooCloseToShield && this.canPlaceInRadius(x, y, ASTEROID_RADIUS)) {
        const rotationSpeed =
          (Math.random() * (ASTEROID_ROTATION_MAX - ASTEROID_ROTATION_MIN) +
            ASTEROID_ROTATION_MIN) *
          (Math.random() < 0.5 ? 1 : -1);

        // Random scale between 0.5 and 1.5
        const randomScale = 0.5 + Math.random();

        const asteroid = createSprite("asteroid", {
          texture: asteroidTexture,
          rotationSpeed,
          scale: randomScale,
        });

        this.placeSprite(x, y, asteroid);
        
        // Create weak gravity field for asteroid
        applyGravityField(this.grid, x, y, 10, 0.1);
        
        placed++;
      }
    }
    console.log(`Placed ${placed} asteroids out of ${NUM_ASTEROIDS} attempts`);

    // Generate black holes as large obstacles in the middle zone between planets
    if (blackHoleTexture) {
      let blackHolesPlaced = 0;
      for (let attempt = 0; attempt < 100 && blackHolesPlaced < NUM_BLACK_HOLES; attempt++) {
        // Bias black holes to spawn in the middle 60% of the map (20-80% from left edge)
        const x = Math.floor(this.GRID_WIDTH * 0.2 + Math.random() * (this.GRID_WIDTH * 0.6));
        const y = Math.floor(Math.random() * this.GRID_HEIGHT);

        // Check if position is not within shield radius of any planet
        let tooCloseToShield = false;
        for (const planet of this.planets) {
          const dx = x - planet.centerX;
          const dy = y - planet.centerY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < this.shieldRadius) {
            tooCloseToShield = true;
            break;
          }
        }

        if (!tooCloseToShield && this.canPlaceInRadius(x, y, BLACK_HOLE_RADIUS)) {
          const rotationSpeed = Math.random() * 0.003 + 0.001; // Slow rotation
          const blackHole = createSprite("blackhole", {
            texture: blackHoleTexture,
            rotationSpeed,
          });
          (blackHole.getDisplay() as Sprite).scale.set(blackHoleScale);

          this.placeSprite(x, y, blackHole);
          
          // Create stronger gravity field for black hole
          applyGravityField(this.grid, x, y, 30, 1.0);
          
          blackHolesPlaced++;
        }
      }
      console.log(`Placed ${blackHolesPlaced} black holes out of ${NUM_BLACK_HOLES} attempts`);
    }
  }

  // Initialize tooltip UI
  initTooltip() {
    this.tooltipBg = new Graphics();
    this.tooltipBg.visible = false;
    this.uiContainer.addChild(this.tooltipBg);

    this.tooltipText = new Text({
      text: "",
      style: { 
        fontFamily: 'Orbitron',
        fontSize: 14, 
        fill: 0xffffff 
      },
    });
    this.tooltipText.visible = false;
    this.uiContainer.addChild(this.tooltipText);
  }

  // Set explosion texture for creating explosion sprites
  setExplosionTexture(texture: Texture) {
    this.explosionTexture = texture;
  }

  // Show tooltip at cursor position with sprite info
  showTooltip(x: number, y: number, sprite: GameSprite) {
    if (!this.tooltipBg || !this.tooltipText) return;

    const lines = [
      `Name: ${sprite.name}`,
      `Type: ${sprite.type}`,
    ];

    // Only show health if the sprite has health (not black holes)
    if (sprite.health > 0) {
      lines.splice(1, 0, `Health: ${sprite.health}`);
    }
    
    // Show owner if owned by a player
    if (sprite.owner > 0) {
      lines.push(`Owner: Player ${sprite.owner}`);
    }
    
    // Show ammo and damage for turrets
    const turret = sprite as any;
    if (turret.ammo !== undefined && turret.maxAmmo !== undefined) {
      lines.push(`Ammo: ${turret.ammo}/${turret.maxAmmo}`);
    }
    if (turret.damage !== undefined) {
      lines.push(`Damage: ${turret.damage}`);
    }

    this.tooltipText.text = lines.join("\n");

    const padding = 5;
    const bgWidth = this.tooltipText.width + padding * 2;
    const bgHeight = this.tooltipText.height + padding * 2;

    this.tooltipBg.clear();
    this.tooltipBg.rect(0, 0, bgWidth, bgHeight);
    this.tooltipBg.fill({ color: 0x000000, alpha: 0.8 });

    this.tooltipBg.position.set(x + 10, y + 10);
    this.tooltipText.position.set(x + 10 + padding, y + 10 + padding);

    this.tooltipBg.visible = true;
    this.tooltipText.visible = true;
  }

  // Hide tooltip
  hideTooltip() {
    if (this.tooltipBg) this.tooltipBg.visible = false;
    if (this.tooltipText) this.tooltipText.visible = false;
  }

  // Draw orange highlights for occupied cells (development)
  drawOccupiedCells() {
    this.highlightGraphic.clear();
    
    if (!this.showGrid) return; // Only draw when grid is visible
    
    // Draw occupied cells
    for (let y = 0; y < this.GRID_HEIGHT; y++) {
      for (let x = 0; x < this.GRID_WIDTH; x++) {
        const cell = this.grid[y][x];
        if (cell.occupied) {
          this.highlightGraphic.rect(
            x * this.TILE_SIZE,
            y * this.TILE_SIZE,
            this.TILE_SIZE,
            this.TILE_SIZE
          );
        }
      }
    }
    
    this.highlightGraphic.fill({ color: 0xff8800, alpha: 0.3 });
    
    // Draw gravity field arrows (sample every few cells to avoid clutter)
    const arrowSpacing = 8; // Draw arrow every N cells
    const arrowScale = 3; // Scale factor for arrow length
    const minArrowMagnitude = 0.01; // Only draw arrows above this threshold
    
    for (let y = 0; y < this.GRID_HEIGHT; y += arrowSpacing) {
      for (let x = 0; x < this.GRID_WIDTH; x += arrowSpacing) {
        const cell = this.grid[y][x];
        const ax = cell.gravity.ax;
        const ay = cell.gravity.ay;
        const magnitude = Math.sqrt(ax * ax + ay * ay);
        
        if (magnitude > minArrowMagnitude) {
          const worldPos = this.gridToWorld(x, y);
          const endX = worldPos.x + ax * arrowScale * this.TILE_SIZE;
          const endY = worldPos.y + ay * arrowScale * this.TILE_SIZE;
          
          // Draw arrow shaft
          this.highlightGraphic.moveTo(worldPos.x, worldPos.y);
          this.highlightGraphic.lineTo(endX, endY);
          
          // Draw arrowhead
          const angle = Math.atan2(ay, ax);
          const headLen = 4;
          const headAngle = Math.PI / 6;
          
          this.highlightGraphic.lineTo(
            endX - headLen * Math.cos(angle - headAngle),
            endY - headLen * Math.sin(angle - headAngle)
          );
          this.highlightGraphic.moveTo(endX, endY);
          this.highlightGraphic.lineTo(
            endX - headLen * Math.cos(angle + headAngle),
            endY - headLen * Math.sin(angle + headAngle)
          );
          
          // Color by intensity (yellow for weak, red for strong)
          const intensity = Math.min(magnitude / 0.5, 1); // Normalize to 0-1
          const color = intensity > 0.5 ? 0xff0000 : 0xffff00;
          this.highlightGraphic.stroke({ width: 2, color: color, alpha: 0.6 });
        }
      }
    }
    
    // Draw gravity radius circles for objects with gravity
    for (let y = 0; y < this.GRID_HEIGHT; y++) {
      for (let x = 0; x < this.GRID_WIDTH; x++) {
        const cell = this.grid[y][x];
        // Only draw for center cells to avoid duplicates
        if (cell.sprite && (!cell.centerX || (cell.centerX === x && cell.centerY === y))) {
          const sprite = cell.sprite;
          const worldPos = this.gridToWorld(x, y);
          
          // Determine gravity radius based on sprite type
          let gravityRadius = 0;
          
          if (sprite.type === "Planet") {
            gravityRadius = 35; // tiles
          } else if (sprite.type === "Black Hole") {
            gravityRadius = 30; // tiles
          } else if (sprite.type === "Asteroid") {
            gravityRadius = 10; // tiles
          }
          
          if (gravityRadius > 0) {
            // Draw gravity radius circle (outer, lighter green)
            this.highlightGraphic.circle(worldPos.x, worldPos.y, gravityRadius * this.TILE_SIZE);
            this.highlightGraphic.stroke({ width: 3, color: 0x00ff00, alpha: 0.4 });
            
            // Draw physical radius circle (inner, brighter green)
            this.highlightGraphic.circle(worldPos.x, worldPos.y, sprite.radius * this.TILE_SIZE);
            this.highlightGraphic.stroke({ width: 3, color: 0x00ff00, alpha: 0.9 });
          }
        }
      }
    }
  }

  start() {
    // Start background music
    this.soundManager.playBackgroundMusic();

    // wheel for zoom
    window.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        this.targetZoom += -event.deltaY * 0.001;
        this.targetZoom = Math.max(
          MIN_ZOOM,
          Math.min(MAX_ZOOM, this.targetZoom),
        );
      },
      { passive: false },
    );

    // panning via mouse on canvas
    const canvas =
      (this.app as any).canvas ?? (this.app.renderer as any).view ?? (this.app as any).view;

    canvas.addEventListener("mousedown", (e: MouseEvent) => {
      if (!this.isDraggingFromToolbar) {
        const { gridX, gridY } = this.screenToGrid(e.clientX, e.clientY);
        
        // First check if clicking on a gun
        if (gridX >= 0 && gridX < this.GRID_WIDTH && gridY >= 0 && gridY < this.GRID_HEIGHT) {
          const cell = this.grid[gridY][gridX];
          
          if (cell.occupied) {
            // For multi-tile sprites, get sprite from center cell
            let sprite = cell.sprite;
            let centerX = gridX;
            let centerY = gridY;
            
            if (!sprite && cell.centerX !== undefined && cell.centerY !== undefined) {
              centerX = cell.centerX;
              centerY = cell.centerY;
              sprite = this.grid[centerY][centerX].sprite;
            }

            if (sprite) {
              console.log(`Clicked sprite: ${sprite.name}, type: ${sprite.type}, immutable: ${sprite.immutable}, owner: ${sprite.owner}`);
              if (sprite.type === "Weapon") {
                // Check if player owns this turret
                if (sprite.owner !== this.currentPlayer) {
                  console.log(`Cannot fire enemy turret!`);
                  this.soundManager.play('invalidPlacement');
                  return;
                }
                
                // Turrets fire projectiles instead of being launched
                this.isLaunching = true;
                this.launchStartPos = { x: e.clientX, y: e.clientY };
                this.launchSprite = sprite; // Store turret reference to get position
                console.log(`Click and drag to fire projectile from ${sprite.name}`);
              } else if (sprite.immutable) {
                console.log(`Cannot move ${sprite.name} - it's immutable`);
                this.isDragging = true;
                this.dragStart.x = e.clientX - this.world.x;
                this.dragStart.y = e.clientY - this.world.y;
              } else {
                // Start launch mode for bunnies
                this.isLaunching = true;
                this.launchStartPos = { x: e.clientX, y: e.clientY };
                this.launchSprite = sprite;
                console.log(`Click and drag to launch ${sprite.name}`);
              }
            } else {
              // Start panning
              this.isDragging = true;
              this.dragStart.x = e.clientX - this.world.x;
              this.dragStart.y = e.clientY - this.world.y;
            }
          } else {
            // Start panning
            this.isDragging = true;
            this.dragStart.x = e.clientX - this.world.x;
            this.dragStart.y = e.clientY - this.world.y;
          }
        } else {
          // Start panning
          this.isDragging = true;
          this.dragStart.x = e.clientX - this.world.x;
          this.dragStart.y = e.clientY - this.world.y;
        }
      }
    });

    canvas.addEventListener("mouseup", (e: MouseEvent) => {
      if (this.gameOver) {
        // Allow dragging camera even when game is over, but prevent other actions
        this.isDragging = false;
        this.isLaunching = false;
        this.launchStartPos = null;
        this.launchSprite = null;
        this.aimerGraphics.clear();
        this.isDraggingFromToolbar = false;
        if (this.previewSprite) {
          this.world.removeChild(this.previewSprite);
          this.previewSprite = null;
        }
        this.selectedTexture = null;
        return;
      }
      
      if (this.isLaunching && this.launchStartPos && this.launchSprite) {
        // Calculate launch velocity based on drag distance
        const dx = this.launchStartPos.x - e.clientX;
        const dy = this.launchStartPos.y - e.clientY;
        
        // Check if launching from a turret (fire projectile) or launching a bunny
        if (this.launchSprite.type === "Weapon") {
          // Check if player has energy remaining
          const energyCost = 20;
          if (this.playerEnergy[this.currentPlayer] < energyCost) {
            console.log("Not enough energy to fire!");
            this.soundManager.play('invalidPlacement');
            this.isLaunching = false;
            this.launchStartPos = null;
            this.launchSprite = null;
            this.aimerGraphics.clear();
            return;
          }
          
          // Fire a projectile from turret instead of launching the turret
          if (this.bunnyTexture) {
            // Check if turret has ammo
            const turret = this.launchSprite as any;
            if (turret.ammo !== undefined && turret.ammo <= 0) {
              console.log(`${this.launchSprite.name} has no ammo!`);
              this.soundManager.play('invalidPlacement');
              this.isLaunching = false;
              this.launchStartPos = null;
              this.launchSprite = null;
              this.aimerGraphics.clear();
              return;
            }
            
            // Choose projectile texture and sound based on turret type
            const isLaserTurret = this.launchSprite.name === "Laser Turret";
            const projectileTexture = isLaserTurret ? this.laserTexture : this.missileTexture;
            const soundEffect = isLaserTurret ? 'laser' : 'missileFire';
            
            const projectile = createSprite("bunny", {
              texture: projectileTexture || this.bunnyTexture,
              name: "Projectile",
            });
            
            // Scale the projectile
            const BUNNY_TILES = 1;
            const projectileScale = ((this.TILE_SIZE * BUNNY_TILES) / Math.max((projectileTexture || this.bunnyTexture).width, (projectileTexture || this.bunnyTexture).height));
            (projectile.getDisplay() as Sprite).scale.set(projectileScale);
            
            // Position at turret location
            const turretPos = this.launchSprite.getDisplay().position;
            projectile.getDisplay().position.set(turretPos.x, turretPos.y);
            
            // Set velocity based on drag (lasers are faster)
            const velocityScale = isLaserTurret ? 0.15 : 0.1;
            projectile.vx = dx * velocityScale;
            projectile.vy = dy * velocityScale;
            
            // Store reference to firing turret and damage
            (projectile as any).firingTurret = this.launchSprite;
            (projectile as any).damage = turret.damage || 50; // Use turret's damage value
            
            // Add to world and projectiles array (will be added to grid when it moves)
            this.world.addChild(projectile.getDisplay());
            this.projectiles.push(projectile);
            
            // Decrement turret ammo
            if (turret.ammo !== undefined) {
              turret.ammo--;
            }
            
            // Deduct energy cost
            this.playerEnergy[this.currentPlayer] -= energyCost;
            this.updateGameInfo();
            
            this.soundManager.play(soundEffect);
            console.log(`Turret fired projectile with velocity (${projectile.vx.toFixed(2)}, ${projectile.vy.toFixed(2)})`);
          }
        } else {
          // Launch the sprite itself (bunnies)
          const velocityScale = 0.1;
          this.launchSprite.vx = dx * velocityScale;
          this.launchSprite.vy = dy * velocityScale;
          
          console.log(`Launched ${this.launchSprite.name} with velocity (${this.launchSprite.vx.toFixed(2)}, ${this.launchSprite.vy.toFixed(2)})`);
        }
        
        // Reset launch state and clear aimer
        this.isLaunching = false;
        this.launchStartPos = null;
        this.launchSprite = null;
        this.aimerGraphics.clear();
      } else if (this.isDraggingFromToolbar && this.previewSprite && this.selectedTexture) {
        if (this.gameOver) return; // Prevent placement when game is over
        
        const { gridX, gridY } = this.screenToGrid(e.clientX, e.clientY);

        if (gridX >= 0 && gridX < this.GRID_WIDTH && gridY >= 0 && gridY < this.GRID_HEIGHT) {
          const isTurret = this.selectedTexture === this.turretTexture;
          const isLaserTurret = this.selectedTexture === this.gunTexture; // gunTexture now holds laser turret
          
          if (isTurret) {
            // Turret placement - fires bunny projectiles
            const turretCost = 200;
            const turretEnergyCost = 30;
            
            if (this.playerOre[this.currentPlayer] < turretCost) {
              console.log("Not enough ore to buy turret!");
              this.soundManager.play('invalidPlacement');
            } else if (this.playerEnergy[this.currentPlayer] < turretEnergyCost) {
              console.log("Not enough energy to build turret!");
              this.soundManager.play('invalidPlacement');
            } else if (!this.isWithinPlayerShield(gridX, gridY)) {
              console.log("Cannot place turret - must be within your shield!");
              this.soundManager.play('invalidPlacement');
            } else {
              const sprite = createSprite("turret", {
                texture: this.selectedTexture,
                name: "Turret",
              });
              sprite.owner = this.currentPlayer; // Set ownership
              
              if (this.canPlaceInRadius(gridX, gridY, sprite.radius)) {
                const spriteScale = ((this.TILE_SIZE * TURRET_TILES) / Math.max(this.selectedTexture.width, this.selectedTexture.height));
                (sprite.getDisplay() as Sprite).scale.set(spriteScale);

                this.placeSprite(gridX, gridY, sprite);
                this.playerOre[this.currentPlayer] -= turretCost;
                this.playerEnergy[this.currentPlayer] -= turretEnergyCost;
                this.updateGameInfo();
                this.soundManager.play('placeBuilding');
                console.log(`Placed turret at grid (${gridX}, ${gridY}) with radius ${sprite.radius}`);
              } else {
                this.soundManager.play('invalidPlacement');
                console.log("Cannot place turret - cells occupied or out of bounds");
              }
            }
          } else if (isLaserTurret) {
            // Laser Turret placement
            const laserTurretCost = 300;
            const laserTurretEnergyCost = 40;
            
            if (this.playerOre[this.currentPlayer] < laserTurretCost) {
              console.log("Not enough ore to buy laser turret!");
              this.soundManager.play('invalidPlacement');
            } else if (this.playerEnergy[this.currentPlayer] < laserTurretEnergyCost) {
              console.log("Not enough energy to build laser turret!");
              this.soundManager.play('invalidPlacement');
            } else if (!this.isWithinPlayerShield(gridX, gridY)) {
              console.log("Cannot place laser turret - must be within your shield!");
              this.soundManager.play('invalidPlacement');
            } else {
              const sprite = createSprite("laserTurret", {
                texture: this.selectedTexture,
                name: "Laser Turret",
              });
              sprite.owner = this.currentPlayer; // Set ownership
              
              if (this.canPlaceInRadius(gridX, gridY, sprite.radius)) {
                const spriteScale = ((this.TILE_SIZE * TURRET_TILES) / Math.max(this.selectedTexture.width, this.selectedTexture.height));
                (sprite.getDisplay() as Sprite).scale.set(spriteScale);

                this.placeSprite(gridX, gridY, sprite);
                this.playerOre[this.currentPlayer] -= laserTurretCost;
                this.playerEnergy[this.currentPlayer] -= laserTurretEnergyCost;
                this.updateGameInfo();
                this.soundManager.play('placeBuilding');
                console.log(`Placed laser turret at grid (${gridX}, ${gridY}) with radius ${sprite.radius}`);
              } else {
                this.soundManager.play('invalidPlacement');
                console.log("Cannot place laser turret - cells occupied or out of bounds");
              }
            }
          } else if (this.selectedTexture === this.mineTexture) {
            // Mine placement - generates ore per turn
            const mineCost = 150;
            const mineEnergyCost = 20;
            
            if (this.playerOre[this.currentPlayer] < mineCost) {
              console.log("Not enough ore to buy mine!");
              this.soundManager.play('invalidPlacement');
            } else if (this.playerEnergy[this.currentPlayer] < mineEnergyCost) {
              console.log("Not enough energy to build mine!");
              this.soundManager.play('invalidPlacement');
            } else if (!this.isWithinPlayerShield(gridX, gridY)) {
              console.log("Cannot place mine - must be within your shield!");
              this.soundManager.play('invalidPlacement');
            } else {
              const sprite = createSprite("mine", {
                texture: this.selectedTexture,
                name: "Mine",
              });
              sprite.owner = this.currentPlayer; // Set ownership
              
              if (this.canPlaceInRadius(gridX, gridY, sprite.radius)) {
                const spriteScale = ((this.TILE_SIZE * TURRET_TILES) / Math.max(this.selectedTexture.width, this.selectedTexture.height));
                (sprite.getDisplay() as Sprite).scale.set(spriteScale);

                this.placeSprite(gridX, gridY, sprite);
                this.playerOre[this.currentPlayer] -= mineCost;
                this.playerEnergy[this.currentPlayer] -= mineEnergyCost;
                this.playerMineCount[this.currentPlayer]++;
                this.updateGameInfo();
                this.soundManager.play('placeBuilding');
                console.log(`Placed mine at grid (${gridX}, ${gridY})`);
              } else {
                this.soundManager.play('invalidPlacement');
                console.log("Cannot place mine - cells occupied or out of bounds");
              }
            }
          } else if (this.selectedTexture === this.solarPanelTexture) {
            // Solar Panel placement - increases max energy
            const solarCost = 100;
            const solarEnergyCost = 15;
            
            if (this.playerOre[this.currentPlayer] < solarCost) {
              console.log("Not enough ore to buy solar panel!");
              this.soundManager.play('invalidPlacement');
            } else if (this.playerEnergy[this.currentPlayer] < solarEnergyCost) {
              console.log("Not enough energy to build solar panel!");
              this.soundManager.play('invalidPlacement');
            } else if (!this.isWithinPlayerShield(gridX, gridY)) {
              console.log("Cannot place solar panel - must be within your shield!");
              this.soundManager.play('invalidPlacement');
            } else {
              const sprite = createSprite("solarPanel", {
                texture: this.selectedTexture,
                name: "Solar Panel",
              });
              sprite.owner = this.currentPlayer; // Set ownership
              
              if (this.canPlaceInRadius(gridX, gridY, sprite.radius)) {
                const spriteScale = ((this.TILE_SIZE * TURRET_TILES) / Math.max(this.selectedTexture.width, this.selectedTexture.height));
                (sprite.getDisplay() as Sprite).scale.set(spriteScale);

                this.placeSprite(gridX, gridY, sprite);
                this.playerOre[this.currentPlayer] -= solarCost;
                this.playerEnergy[this.currentPlayer] -= solarEnergyCost;
                this.playerSolarCount[this.currentPlayer]++;
                this.playerMaxEnergy[this.currentPlayer] += 50; // +50 max energy per solar panel
                this.updateGameInfo();
                this.soundManager.play('placeBuilding');
                console.log(`Placed solar panel at grid (${gridX}, ${gridY})`);
              } else {
                this.soundManager.play('invalidPlacement');
                console.log("Cannot place solar panel - cells occupied or out of bounds");
              }
            }
          } else {
            // Bunny placement
            const sprite = createSprite("bunny", {
              texture: this.selectedTexture,
              name: "Building",
            });
            
            if (this.canPlaceInRadius(gridX, gridY, sprite.radius)) {
              const SPRITE_TILES = 1;
              const spriteScale = ((this.TILE_SIZE * SPRITE_TILES) / Math.max(this.selectedTexture.width, this.selectedTexture.height));
              (sprite.getDisplay() as Sprite).scale.set(spriteScale);

              this.placeSprite(gridX, gridY, sprite);
              this.soundManager.play('placeBuilding');
              console.log(`Placed bunny at grid (${gridX}, ${gridY}) with radius ${sprite.radius}`);
            } else {
              this.soundManager.play('invalidPlacement');
              console.log("Cannot place bunny - cells occupied or out of bounds");
            }
          }
        }

        this.world.removeChild(this.previewSprite);
        this.previewSprite = null;
        this.highlightGraphic.clear();
        this.selectedTexture = null;
      } else if (this.isDraggingDeleteButton) {
        // Handle deletion if released over a building
        if (this.highlightedBuildingForDelete) {
          const sprite = this.highlightedBuildingForDelete;
          
          // Find the sprite's grid position
          let spriteGridX = -1;
          let spriteGridY = -1;
          outerLoop: for (let y = 0; y < this.GRID_HEIGHT; y++) {
            for (let x = 0; x < this.GRID_WIDTH; x++) {
              if (this.grid[y][x].sprite === sprite) {
                spriteGridX = x;
                spriteGridY = y;
                break outerLoop;
              }
            }
          }
          
          if (spriteGridX >= 0 && spriteGridY >= 0) {
            // Calculate refund (1/4 of build cost)
            let refund = 0;
            if (sprite.name === "Turret") {
              refund = Math.floor(200 / 4);
            } else if (sprite.name === "Laser Turret") {
              refund = Math.floor(300 / 4);
            } else if (sprite.name === "Mine") {
              refund = Math.floor(150 / 4);
              this.playerMineCount[this.currentPlayer]--;
            } else if (sprite.name === "Solar Panel") {
              refund = Math.floor(100 / 4);
              this.playerSolarCount[this.currentPlayer]--;
              this.playerMaxEnergy[this.currentPlayer] -= 50;
              // Cap current energy to new max
              this.playerEnergy[this.currentPlayer] = Math.min(
                this.playerEnergy[this.currentPlayer],
                this.playerMaxEnergy[this.currentPlayer]
              );
            }
            
            // Remove tint before deletion
            (sprite.getDisplay() as Sprite).tint = 0xffffff;
            
            // Delete the building
            this.removeSprite(spriteGridX, spriteGridY);
            
            // Give refund
            this.playerOre[this.currentPlayer] += refund;
            this.updateGameInfo();
            
            this.soundManager.play('explosion');
            console.log(`Deleted ${sprite.name}, refunded ${refund} ore`);
          }
          
          this.highlightedBuildingForDelete = null;
        }
        
        // Reset delete button to original position
        this.trashCan.position.set(this.deleteButtonOriginalPos.x, this.deleteButtonOriginalPos.y);
        this.trashCan.cursor = 'grab';
        this.isDraggingDeleteButton = false;
      }

      this.isDraggingFromToolbar = false;
      this.isDragging = false;
    });

    canvas.addEventListener("mousemove", (e: MouseEvent) => {
      if (this.isDraggingDeleteButton) {
        // Move delete button with cursor
        const toolbarRelativeX = e.clientX - this.toolbar.position.x;
        const toolbarRelativeY = e.clientY - this.toolbar.position.y;
        this.trashCan.position.set(toolbarRelativeX - 40, toolbarRelativeY - 40);
        
        // Check if hovering over a building that can be deleted
        const { gridX, gridY } = this.screenToGrid(e.clientX, e.clientY);
        if (gridX >= 0 && gridX < this.GRID_WIDTH && gridY >= 0 && gridY < this.GRID_HEIGHT) {
          const cell = this.grid[gridY][gridX];
          let sprite = cell.sprite;
          if (!sprite && cell.centerX !== undefined && cell.centerY !== undefined) {
            sprite = this.grid[cell.centerY][cell.centerX].sprite;
          }
          
          // Can only delete buildings owned by current player (turrets, mines, solar panels - not planets, asteroids, black holes)
          const isDeletableBuilding = sprite && sprite.owner === this.currentPlayer && 
            (sprite.type === "Weapon" || sprite.type === "Resource");
          
          if (isDeletableBuilding && sprite) {
            if (this.highlightedBuildingForDelete !== sprite) {
              this.highlightedBuildingForDelete = sprite;
              // Highlight the building with red tint
              (sprite.getDisplay() as Sprite).tint = 0xff8888;
            }
          } else {
            if (this.highlightedBuildingForDelete) {
              (this.highlightedBuildingForDelete.getDisplay() as Sprite).tint = 0xffffff;
              this.highlightedBuildingForDelete = null;
            }
          }
        } else {
          if (this.highlightedBuildingForDelete) {
            (this.highlightedBuildingForDelete.getDisplay() as Sprite).tint = 0xffffff;
            this.highlightedBuildingForDelete = null;
          }
        }
      } else if (this.isDraggingFromToolbar && this.previewSprite) {
        const { gridX, gridY } = this.screenToGrid(e.clientX, e.clientY);

        if (gridX >= 0 && gridX < this.GRID_WIDTH && gridY >= 0 && gridY < this.GRID_HEIGHT) {
          const worldPos = this.gridToWorld(gridX, gridY);
          this.previewSprite.position.set(worldPos.x, worldPos.y);

          this.highlightGraphic.clear();
          const canPlace = this.canPlaceInRadius(gridX, gridY, 0);
          const color = canPlace ? 0x00ff00 : 0xff0000;

          this.highlightGraphic.rect(gridX * this.TILE_SIZE, gridY * this.TILE_SIZE, this.TILE_SIZE, this.TILE_SIZE);
          this.highlightGraphic.fill({ color, alpha: 0.3 });
        }
      } else if (this.isLaunching && this.launchStartPos && this.launchSprite) {
        // Draw aimer trajectory
        this.drawTrajectory(e.clientX, e.clientY);
      } else if (this.isDragging) {
        this.world.x = e.clientX - this.dragStart.x;
        this.world.y = e.clientY - this.dragStart.y;
        this.hideTooltip();
      } else {
        // Show tooltip on hover for grid sprites
        const { gridX, gridY } = this.screenToGrid(e.clientX, e.clientY);
        if (
          gridX >= 0 &&
          gridX < this.GRID_WIDTH &&
          gridY >= 0 &&
          gridY < this.GRID_HEIGHT
        ) {
          const cell = this.grid[gridY][gridX];
          if (cell.occupied) {
            // For multi-tile sprites, get sprite from center cell
            let sprite = cell.sprite;
            if (!sprite && cell.centerX !== undefined && cell.centerY !== undefined) {
              sprite = this.grid[cell.centerY][cell.centerX].sprite;
            }
            if (sprite) {
              this.showTooltip(e.clientX, e.clientY, sprite);
              return;
            }
          }
        }
        this.hideTooltip();
      }
    });

    // click -> grid conversion example
    canvas.addEventListener("click", (e: MouseEvent) => {
      if (!this.isDraggingFromToolbar) {
        const { gridX, gridY } = this.screenToGrid(e.clientX, e.clientY);
        if (
          gridX >= 0 &&
          gridX < this.GRID_WIDTH &&
          gridY >= 0 &&
          gridY < this.GRID_HEIGHT
        ) {
          const cell = this.grid[gridY][gridX];
          if (cell.occupied) {
            // For multi-tile sprites, get sprite from center cell
            let sprite = cell.sprite;
            if (!sprite && cell.centerX !== undefined && cell.centerY !== undefined) {
              sprite = this.grid[cell.centerY][cell.centerX].sprite;
            }
            if (sprite) {
              console.log(`Cell (${gridX}, ${gridY}) contains: ${sprite.name} (Type: ${sprite.type}, Health: ${sprite.health}, Radius: ${sprite.radius} tiles)`);
            } else {
              console.log(`Cell (${gridX}, ${gridY}) is occupied but sprite reference missing`);
            }
          } else {
            console.log(`Cell (${gridX}, ${gridY}) is empty - valid for placement: ${this.canPlaceInRadius(gridX, gridY, 0)}`);
          }
        }
      }
    });

    // ticker
    this.app.ticker.add((time) => this.tick(time));

    const resizeWindow = (_ev?: UIEvent) => {
      this.app.renderer.resize(window.innerWidth, window.innerHeight);

      // Get the center point of the grid in world coordinates
      const gridCenterX = (this.GRID_WIDTH * this.TILE_SIZE) / 2;
      const gridCenterY = (this.GRID_HEIGHT * this.TILE_SIZE) / 2;

      // Center the world container on the screen, accounting for zoom
      this.world.x = this.app.screen.width / 2 - gridCenterX * this.zoom;
      this.world.y = this.app.screen.height / 2 - gridCenterY * this.zoom;

      // Update toolbar position
      if (this.toolbar) {
        this.toolbar.position.set(10, this.app.screen.height - 100);
      }
      
      // Update grid toggle button position
      if (this.gridToggleButton) {
        this.gridToggleButton.position.set(this.app.screen.width - 170, 10);
      }
    }

    // resize handling
    window.addEventListener("resize", resizeWindow);
    resizeWindow();
  }

  private tick(time: Ticker) {
    const prevZoom = this.zoom;
    this.zoom += (this.targetZoom - this.zoom) * ZOOM_SPEED;

    const centerX = this.app.screen.width / 2;
    const centerY = this.app.screen.height / 2;

    this.world.x = centerX - (centerX - this.world.x) * (this.zoom / prevZoom);
    this.world.y = centerY - (centerY - this.world.y) * (this.zoom / prevZoom);
    this.world.scale.set(this.zoom);

    // Constrain panning to grid boundaries
    const gridPixelWidth = this.GRID_WIDTH * this.TILE_SIZE * this.zoom;
    const gridPixelHeight = this.GRID_HEIGHT * this.TILE_SIZE * this.zoom;

    const minX = this.app.screen.width - gridPixelWidth;
    const maxX = 0;
    const minY = this.app.screen.height - gridPixelHeight;
    const maxY = 0;

    this.world.x = Math.max(minX, Math.min(maxX, this.world.x));
    this.world.y = Math.max(minY, Math.min(maxY, this.world.y));

    if (prevZoom !== this.zoom) {
      this.renderer.setZoom(this.zoom);
      this.needsOccupiedCellsRedraw = true;
    }

    // Draw orange highlights for occupied cells (only when needed)
    if (this.needsOccupiedCellsRedraw) {
      this.drawOccupiedCells();
      this.needsOccupiedCellsRedraw = false;
    }

    // Update all sprites (only update center cells to avoid duplicates)
    for (let y = 0; y < this.GRID_HEIGHT; y++) {
      for (let x = 0; x < this.GRID_WIDTH; x++) {
        const cell = this.grid[y][x];
        // Only update if this is the center cell (has the sprite reference)
        if (cell.sprite && (!cell.centerX || (cell.centerX === x && cell.centerY === y))) {
          const sprite = cell.sprite;
          
          // For moving sprites (with velocity), get gravity from current world position
          if (sprite.vx !== 0 || sprite.vy !== 0) {
            const worldPos = sprite.getDisplay().position;
            const currentGridX = Math.floor(worldPos.x / this.TILE_SIZE);
            const currentGridY = Math.floor(worldPos.y / this.TILE_SIZE);
            
            let ax = 0;
            let ay = 0;
            if (currentGridX >= 0 && currentGridX < this.GRID_WIDTH && 
                currentGridY >= 0 && currentGridY < this.GRID_HEIGHT) {
              ax = this.grid[currentGridY][currentGridX].gravity.ax;
              ay = this.grid[currentGridY][currentGridX].gravity.ay;
              
              // If sprite should ignore gravity from a specific planet, calculate and subtract it
              if (sprite.ignorePlanetGravity) {
                const planetInfo = sprite.ignorePlanetGravity;
                const dx = currentGridX - planetInfo.centerX;
                const dy = currentGridY - planetInfo.centerY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                // Only subtract if within the planet's gravity radius (35 tiles for planets)
                if (dist > 0 && dist <= 35) {
                  // Calculate what the planet's gravity contribution would be
                  const force = 0.5 * (1 - dist / 35); // Planet strength is 0.5, radius is 35
                  const planetAx = (-dx / dist) * force;
                  const planetAy = (-dy / dist) * force;
                  
                  // Subtract the planet's gravity
                  ax -= planetAx;
                  ay -= planetAy;
                }
              }
            }
            
            sprite.update(time.deltaTime, ax, ay);
            
            // Check for collision with immutable objects
            // Use worldPos already declared above
            let collision = false;
            
            // Check all grid cells for immutable sprites
            for (let checkY = 0; checkY < this.GRID_HEIGHT && !collision; checkY++) {
              for (let checkX = 0; checkX < this.GRID_WIDTH && !collision; checkX++) {
                const checkCell = this.grid[checkY][checkX];
                // Only check center cells with immutable sprites
                if (checkCell.sprite && checkCell.sprite.immutable && 
                    (!checkCell.centerX || (checkCell.centerX === checkX && checkCell.centerY === checkY))) {
                  const targetSprite = checkCell.sprite;
                  const targetPos = targetSprite.getDisplay().position;
                  
                  // Calculate distance between sprites
                  const dx = worldPos.x - targetPos.x;
                  const dy = worldPos.y - targetPos.y;
                  const distance = Math.sqrt(dx * dx + dy * dy);
                  
                  // Check if moving sprite is within target's radius
                  const collisionRadius = targetSprite.radius * this.TILE_SIZE;
                  if (distance < collisionRadius) {
                    collision = true;
                    
                    // Create explosion at collision point
                    this.createExplosion(worldPos.x, worldPos.y, 1.0);
                    this.soundManager.play('explosion');
                    
                    // Apply damage to the target (100 damage from bunny/turret projectile)
                    // Skip damage for black holes - they are invulnerable
                    let targetDestroyed = false;
                    if (targetSprite.name !== "Black Hole") {
                      targetDestroyed = targetSprite.takeDamage(100);
                    }
                    
                    // Remove the target if health reached 0
                    if (targetDestroyed) {
                      // Find the target's grid position
                      const targetCells = this.getCellsInRadius(checkX, checkY, targetSprite.radius);
                      for (const targetCell of targetCells) {
                        if (targetCell.x >= 0 && targetCell.x < this.GRID_WIDTH && 
                            targetCell.y >= 0 && targetCell.y < this.GRID_HEIGHT) {
                          const cell = this.grid[targetCell.y][targetCell.x];
                          // Only clear if this cell belongs to the target sprite
                          if (cell.centerX === checkX && cell.centerY === checkY) {
                            this.grid[targetCell.y][targetCell.x].occupied = false;
                            this.grid[targetCell.y][targetCell.x].sprite = null;
                            this.grid[targetCell.y][targetCell.x].centerX = undefined;
                            this.grid[targetCell.y][targetCell.x].centerY = undefined;
                          }
                        }
                      }
                      this.world.removeChild(targetSprite.getDisplay());
                      
                      // Remove from planets array if it was a planet
                      const planetIndex = this.planets.indexOf(targetSprite as any);
                      if (planetIndex > -1) {
                        this.planets.splice(planetIndex, 1);
                      }
                      
                      console.log(`${targetSprite.name} destroyed!`);
                    } else {
                      console.log(`${targetSprite.name} took 100 damage. Health: ${targetSprite.health}/${targetSprite.maxHealth}`);
                    }
                    
                    // Remove the moving sprite (projectile) - only clear cells that belong to this sprite
                    const oldCells = this.getCellsInRadius(x, y, sprite.radius);
                    for (const oldCell of oldCells) {
                      if (oldCell.x >= 0 && oldCell.x < this.GRID_WIDTH && 
                          oldCell.y >= 0 && oldCell.y < this.GRID_HEIGHT) {
                        const cell = this.grid[oldCell.y][oldCell.x];
                        // Only clear if this cell belongs to the moving sprite (not to an immutable object)
                        if (cell.centerX === x && cell.centerY === y) {
                          this.grid[oldCell.y][oldCell.x].occupied = false;
                          this.grid[oldCell.y][oldCell.x].sprite = null;
                          this.grid[oldCell.y][oldCell.x].centerX = undefined;
                          this.grid[oldCell.y][oldCell.x].centerY = undefined;
                        }
                      }
                    }
                    this.world.removeChild(sprite.getDisplay());
                    this.needsOccupiedCellsRedraw = true;
                    break;
                  }
                }
              }
            }
            
            // Only update grid position if no collision occurred
            if (!collision) {
              // Update grid position if sprite has moved to a new cell
              if (currentGridX !== x || currentGridY !== y) {
                // Clear old position
                const oldCells = this.getCellsInRadius(x, y, sprite.radius);
                for (const oldCell of oldCells) {
                  if (oldCell.x >= 0 && oldCell.x < this.GRID_WIDTH && 
                      oldCell.y >= 0 && oldCell.y < this.GRID_HEIGHT) {
                    this.grid[oldCell.y][oldCell.x].occupied = false;
                    this.grid[oldCell.y][oldCell.x].sprite = null;
                    this.grid[oldCell.y][oldCell.x].centerX = undefined;
                    this.grid[oldCell.y][oldCell.x].centerY = undefined;
                  }
                }
                
                // Set new position (only if still in bounds)
                if (currentGridX >= 0 && currentGridX < this.GRID_WIDTH && 
                    currentGridY >= 0 && currentGridY < this.GRID_HEIGHT) {
                  const newCells = this.getCellsInRadius(currentGridX, currentGridY, sprite.radius);
                  for (const newCell of newCells) {
                    if (newCell.x >= 0 && newCell.x < this.GRID_WIDTH && 
                        newCell.y >= 0 && newCell.y < this.GRID_HEIGHT) {
                      this.grid[newCell.y][newCell.x].occupied = true;
                      this.grid[newCell.y][newCell.x].centerX = currentGridX;
                      this.grid[newCell.y][newCell.x].centerY = currentGridY;
                      // Only add sprite reference to the center cell
                      if (newCell.x === currentGridX && newCell.y === currentGridY) {
                        this.grid[newCell.y][newCell.x].sprite = sprite;
                      }
                    }
                  }
                  this.needsOccupiedCellsRedraw = true;
                }
              }
            }
          } else {
            // Static sprites (no velocity) - don't apply gravity, just update
            sprite.update(time.deltaTime, 0, 0);
          }
        }
      }
    }

    // Update and clean up explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const explosion = this.explosions[i];
      explosion.update(time.deltaTime);
      
      // Remove finished explosions
      if ((explosion as ExplosionSprite).isFinished()) {
        this.world.removeChild(explosion.getDisplay());
        this.explosions.splice(i, 1);
      }
    }
    
    // Update projectiles that aren't in the grid yet
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i];
      const worldPos = projectile.getDisplay().position;
      const currentGridX = Math.floor(worldPos.x / this.TILE_SIZE);
      const currentGridY = Math.floor(worldPos.y / this.TILE_SIZE);
      
      // Get gravity
      let ax = 0;
      let ay = 0;
      if (currentGridX >= 0 && currentGridX < this.GRID_WIDTH && 
          currentGridY >= 0 && currentGridY < this.GRID_HEIGHT) {
        ax = this.grid[currentGridY][currentGridX].gravity.ax;
        ay = this.grid[currentGridY][currentGridX].gravity.ay;
      }
      
      // Update projectile physics
      projectile.update(time.deltaTime, ax, ay);
      
      // Add to grid once it starts moving away from turret
      const newGridX = Math.floor(projectile.getDisplay().position.x / this.TILE_SIZE);
      const newGridY = Math.floor(projectile.getDisplay().position.y / this.TILE_SIZE);
      
      if (newGridX >= 0 && newGridX < this.GRID_WIDTH && newGridY >= 0 && newGridY < this.GRID_HEIGHT) {
        const newCell = this.grid[newGridY][newGridX];
        const firingTurret = (projectile as any).firingTurret;
        
        // Check if we're still inside the turret that fired us - just keep moving
        if (newCell.occupied && newCell.sprite === firingTurret) {
          // Still inside firing turret, don't add to grid yet
          continue;
        }
        
        // Check if we hit another sprite
        if (newCell.occupied && newCell.sprite && newCell.sprite !== projectile) {
          const hitSprite = newCell.sprite;
          
          // Black holes are indestructible - projectile is destroyed but black hole takes no damage
          if (hitSprite.name === "Black Hole") {
            console.log(`COLLISION! Projectile absorbed by ${hitSprite.name} (indestructible)`);
            
            // Create explosion at projectile location
            const projectileWorldPos = projectile.getDisplay().position;
            this.createExplosion(projectileWorldPos.x, projectileWorldPos.y, 0.5);
            this.soundManager.play('explosion');
            
            // Remove projectile
            this.world.removeChild(projectile.getDisplay());
            this.projectiles.splice(i, 1);
            
            this.needsOccupiedCellsRedraw = true;
            // Continue to next projectile
            continue;
          }
          
          // Collision! Deal damage to the sprite we hit
          const damage = (projectile as any).damage || 50; // Use projectile's stored damage
          hitSprite.health -= damage;
          console.log(`Projectile hit ${hitSprite.name} for ${damage} damage (${hitSprite.health} HP remaining)`);
          
          // Create explosion at projectile location
          const projectileWorldPos = projectile.getDisplay().position;
          this.createExplosion(projectileWorldPos.x, projectileWorldPos.y, 0.5);
          this.soundManager.play('explosion');
          
          // Remove projectile
          this.world.removeChild(projectile.getDisplay());
          this.projectiles.splice(i, 1);
          
          // Check if sprite was destroyed
          if (hitSprite.health <= 0) {
            console.log(`${hitSprite.name} destroyed!`);
            // Use the center coordinates to properly remove multi-tile sprites
            const centerX = newCell.centerX !== undefined ? newCell.centerX : newGridX;
            const centerY = newCell.centerY !== undefined ? newCell.centerY : newGridY;
            this.removeSprite(centerX, centerY);
          }
          this.needsOccupiedCellsRedraw = true;
          // Continue to next projectile
          continue;
        }
        // If cell is empty, projectile continues flying (don't add to grid)
      }
      
      // Remove if out of bounds
      if (newGridX < 0 || newGridX >= this.GRID_WIDTH || newGridY < 0 || newGridY >= this.GRID_HEIGHT) {
        this.world.removeChild(projectile.getDisplay());
        this.projectiles.splice(i, 1);
      }
    }

    // update stars
    this.starArray.forEach((star) => {
      star.graphics.y += star.speed;
      if (star.graphics.y > this.app.screen.height) star.graphics.y = 0;

      // twinkle
      star.graphics.alpha += star.alphaDir;
      if (star.graphics.alpha > 1) star.alphaDir = -star.alphaDir;
      if (star.graphics.alpha < 0.2) star.alphaDir = -star.alphaDir;
    });
  }

  screenToGrid(screenX: number, screenY: number) {
    const local = this.world.toLocal({ x: screenX, y: screenY });
    const gridX = Math.floor(local.x / this.TILE_SIZE);
    const gridY = Math.floor(local.y / this.TILE_SIZE);
    return { gridX, gridY };
  }

  gridToWorld(gridX: number, gridY: number) {
    return {
      x: gridX * this.TILE_SIZE + this.TILE_SIZE / 2,
      y: gridY * this.TILE_SIZE + this.TILE_SIZE / 2,
    };
  }

  // Helper to get all cells within a circular radius
  getCellsInRadius(centerX: number, centerY: number, radius: number, shape: "circle" | "square" = "circle"): { x: number; y: number }[] {
    const cells: { x: number; y: number }[] = [];
    
    if (shape === "square") {
      // For square mode:
      // radius 0 = 2x2 square starting at (centerX, centerY)
      // radius 1 = 3x3 square centered on (centerX, centerY)
      if (radius === 0) {
        // 2x2 square: (x, y), (x+1, y), (x, y+1), (x+1, y+1)
        for (let dy = 0; dy <= 1; dy++) {
          for (let dx = 0; dx <= 1; dx++) {
            cells.push({ x: centerX + dx, y: centerY + dy });
          }
        }
      } else {
        // NxN square centered on (centerX, centerY)
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            cells.push({ x: centerX + dx, y: centerY + dy });
          }
        }
      }
    } else {
      // Circle shape (original behavior)
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy <= radius * radius) {
            cells.push({ x: centerX + dx, y: centerY + dy });
          }
        }
      }
    }
    
    return cells;
  }

  // Check if all cells in radius are available
  canPlaceInRadius(centerX: number, centerY: number, radius: number, shape: "circle" | "square" = "circle"): boolean {
    const cells = this.getCellsInRadius(centerX, centerY, radius, shape);
    for (const cell of cells) {
      if (
        cell.x < 0 ||
        cell.x >= this.GRID_WIDTH ||
        cell.y < 0 ||
        cell.y >= this.GRID_HEIGHT
      ) {
        return false;
      }
      if (this.grid[cell.y][cell.x].occupied) {
        return false;
      }
    }
    return true;
  }

  // Check if position is within current player's shield
  isWithinPlayerShield(gridX: number, gridY: number): boolean {
    const playerBase = this.currentPlayer === 1 ? this.player1Base : this.player2Base;
    if (!playerBase) return false;
    
    const dx = gridX - playerBase.centerX;
    const dy = gridY - playerBase.centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    return distance <= this.shieldRadius;
  }

  // Place sprite with radius occupation
  placeSprite(gridX: number, gridY: number, sprite: GameSprite): boolean {
    console.log(`placeSprite called: gridX=${gridX}, gridY=${gridY}, sprite=${sprite.name}, radius=${sprite.radius}, shape=${sprite.shape}`);
    if (!this.canPlaceInRadius(gridX, gridY, sprite.radius, sprite.shape)) {
      return false;
    }

    // Occupy all cells in radius
    const cells = this.getCellsInRadius(gridX, gridY, sprite.radius, sprite.shape);
    console.log(`Occupying ${cells.length} cells for ${sprite.name} with radius ${sprite.radius} and shape ${sprite.shape}`);
    for (const cell of cells) {
      this.grid[cell.y][cell.x].occupied = true;
      this.grid[cell.y][cell.x].centerX = gridX;
      this.grid[cell.y][cell.x].centerY = gridY;
      this.grid[cell.y][cell.x].sprite = sprite; // Add sprite reference to ALL cells
    }

    // Position sprite
    const worldPos = this.gridToWorld(gridX, gridY);
    sprite.getDisplay().position.set(worldPos.x, worldPos.y);
    this.world.addChild(sprite.getDisplay());

    // Track planets
    if (sprite instanceof PlanetSprite) {
      this.planets.push(sprite);
      // Create gravity field for planet
      applyGravityField(this.grid, gridX, gridY, 35, 0.5);
    }
    
    // Create gravity field for black holes
    if (sprite.type === "blackhole") {
      applyGravityField(this.grid, gridX, gridY, 30, 1.0);
    }
    
    // Create gravity field for asteroids
    if (sprite.type === "Asteroid") {
      applyGravityField(this.grid, gridX, gridY, 10, 0.1);
    }

    // Mark that occupied cells need redrawing
    this.needsOccupiedCellsRedraw = true;

    return true;
  }

  // Remove sprite from grid
  removeSprite(gridX: number, gridY: number): boolean {
    const cell = this.grid[gridY][gridX];
    if (!cell.sprite) {
      return false;
    }

    const sprite = cell.sprite;
    const radius = sprite.radius;
    const shape = sprite.shape;

    // Clear all cells in radius
    const cells = this.getCellsInRadius(gridX, gridY, radius, shape);
    for (const cellPos of cells) {
      this.grid[cellPos.y][cellPos.x].occupied = false;
      this.grid[cellPos.y][cellPos.x].sprite = null;
      this.grid[cellPos.y][cellPos.x].centerX = undefined;
      this.grid[cellPos.y][cellPos.x].centerY = undefined;
    }

    // Remove from world
    this.world.removeChild(sprite.getDisplay());

    // Create explosion at the sprite's position
    const worldPos = this.gridToWorld(gridX, gridY);
    this.createExplosion(worldPos.x, worldPos.y, Math.max(radius / 3, 1));
    this.soundManager.play('explosion');

    // Remove from planets array if it's a planet
    if (sprite instanceof PlanetSprite) {
      const index = this.planets.indexOf(sprite);
      if (index > -1) {
        this.planets.splice(index, 1);
      }
      
      // Check if a base was destroyed (win condition)
      if (sprite === this.player1Base) {
        this.endGame("Player 2");
      } else if (sprite === this.player2Base) {
        this.endGame("Player 1");
      }
    }
    
    // Decrement mine count if a mine was destroyed
    if (sprite.name === "Mine" && sprite.owner > 0) {
      this.playerMineCount[sprite.owner]--;
      console.log(`Player ${sprite.owner} lost a mine. Remaining: ${this.playerMineCount[sprite.owner]}`);
    }
    
    // Decrement solar panel count and max energy if a solar panel was destroyed
    if (sprite.name === "Solar Panel" && sprite.owner > 0) {
      this.playerSolarCount[sprite.owner]--;
      this.playerMaxEnergy[sprite.owner] -= 50;
      // Also reduce current energy if it exceeds new max
      if (this.playerEnergy[sprite.owner] > this.playerMaxEnergy[sprite.owner]) {
        this.playerEnergy[sprite.owner] = this.playerMaxEnergy[sprite.owner];
      }
      console.log(`Player ${sprite.owner} lost a solar panel. Max energy: ${this.playerMaxEnergy[sprite.owner]}`);
    }
    
    // Reward ore for destroying asteroids (scales with health/size)
    if (sprite.type === "Debris") {
      // Max health ranges from 250-750
      // Ore reward: 100-300 based on size, with some randomness
      const baseReward = Math.floor(sprite.maxHealth * 0.3); // 75-225
      const randomBonus = Math.floor(Math.random() * 75); // 0-75
      const oreReward = baseReward + randomBonus; // 75-300
      this.playerOre[this.currentPlayer] += oreReward;
      console.log(`Player ${this.currentPlayer} destroyed asteroid (${sprite.maxHealth} HP) and gained ${oreReward} ore!`);
      this.updateGameInfo();
    }

    // Mark that occupied cells need redrawing
    this.needsOccupiedCellsRedraw = true;

    return true;
  }

  // Move sprite from one position to another
  moveSprite(fromX: number, fromY: number, toX: number, toY: number): boolean {
    const fromCell = this.grid[fromY][fromX];
    if (!fromCell.sprite) {
      return false;
    }

    const sprite = fromCell.sprite;
    const radius = sprite.radius;
    const shape = sprite.shape;

    // Check if we can place at destination (temporarily clear source cells for check)
    const sourceCells = this.getCellsInRadius(fromX, fromY, radius, shape);
    for (const cell of sourceCells) {
      this.grid[cell.y][cell.x].occupied = false;
    }

    const canPlace = this.canPlaceInRadius(toX, toY, radius, shape);

    // Restore source cells
    for (const cell of sourceCells) {
      this.grid[cell.y][cell.x].occupied = true;
    }

    if (!canPlace) {
      return false;
    }

    // Remove from old position
    for (const cell of sourceCells) {
      this.grid[cell.y][cell.x].occupied = false;
      this.grid[cell.y][cell.x].sprite = null;
      this.grid[cell.y][cell.x].centerX = undefined;
      this.grid[cell.y][cell.x].centerY = undefined;
    }

    // Place at new position
    const destCells = this.getCellsInRadius(toX, toY, radius, shape);
    for (const cell of destCells) {
      this.grid[cell.y][cell.x].occupied = true;
      this.grid[cell.y][cell.x].centerX = toX;
      this.grid[cell.y][cell.x].centerY = toY;
      if (cell.x === toX && cell.y === toY) {
        this.grid[cell.y][cell.x].sprite = sprite;
      }
    }

    // Update sprite position
    const worldPos = this.gridToWorld(toX, toY);
    sprite.getDisplay().position.set(worldPos.x, worldPos.y);

    // Mark that occupied cells need redrawing
    this.needsOccupiedCellsRedraw = true;

    return true;
  }

  // Create explosion effect
  createExplosion(x: number, y: number, scale: number = 1) {
    if (!this.explosionTexture) {
      console.warn("No explosion texture loaded");
      return;
    }
    
    // Sprite sheet layout: 8 columns × 6 rows = 48 frames
    const cols = 8;
    const rows = 6;
    const frameWidth = this.explosionTexture.width / cols;
    const frameHeight = this.explosionTexture.height / rows;
    
    // Parameters: texture, x, y, scale, totalFrames, frameWidth, frameHeight, framesPerRow, animationSpeed
    // 48 frames at 24 fps = animationSpeed of 24/60 = 0.4 (since game runs at 60 fps)
    const explosion = new ExplosionSprite(
      this.explosionTexture,
      x,
      y,
      scale,
      48,         // totalFrames - 48 frame sprite sheet
      frameWidth, // frameWidth - calculated from texture
      frameHeight, // frameHeight - calculated from texture
      cols,       // framesPerRow - 8 columns
      0.4         // animationSpeed - 24 fps (24 frames per second / 60 ticks per second = 0.4)
    );
    this.world.addChild(explosion.getDisplay());
    this.explosions.push(explosion);
  }

  /**
   * Draw trajectory prediction when launching a sprite
   */
  private drawTrajectory(mouseX: number, mouseY: number) {
    if (!this.launchStartPos || !this.launchSprite) return;

    this.aimerGraphics.clear();

    // Calculate initial velocity
    const dx = this.launchStartPos.x - mouseX;
    const dy = this.launchStartPos.y - mouseY;
    const velocityScale = 0.1;
    let vx = dx * velocityScale;
    let vy = dy * velocityScale;

    // Get sprite's current grid position
    const spriteWorldPos = this.launchSprite.getDisplay().position;
    let posX = spriteWorldPos.x;
    let posY = spriteWorldPos.y;

    // Simulate trajectory
    const maxSteps = 200;
    const deltaTime = 1.0; // Simulation delta
    const points: { x: number; y: number }[] = [{ x: posX, y: posY }];

    for (let i = 0; i < maxSteps; i++) {
      // Get grid position
      const gridX = Math.floor(posX / this.TILE_SIZE);
      const gridY = Math.floor(posY / this.TILE_SIZE);

      // Get gravity at this position
      let ax = 0;
      let ay = 0;
      if (gridX >= 0 && gridX < this.GRID_WIDTH && gridY >= 0 && gridY < this.GRID_HEIGHT) {
        ax = this.grid[gridY][gridX].gravity.ax;
        ay = this.grid[gridY][gridX].gravity.ay;
      }

      // Apply gravity
      vx += ax * deltaTime;
      vy += ay * deltaTime;

      // Clamp velocity
      const MAX_VELOCITY = 8;
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed > MAX_VELOCITY) {
        vx = (vx / speed) * MAX_VELOCITY;
        vy = (vy / speed) * MAX_VELOCITY;
      }

      // Update position
      posX += vx * deltaTime;
      posY += vy * deltaTime;

      // Stop if out of bounds
      if (posX < 0 || posX > this.GRID_WIDTH * this.TILE_SIZE || 
          posY < 0 || posY > this.GRID_HEIGHT * this.TILE_SIZE) {
        break;
      }

      points.push({ x: posX, y: posY });
    }

    // Draw trajectory with dots (Angry Birds style)
    for (let i = 0; i < points.length; i += 5) {
      const point = points[i];
      // Draw white dot with black outline
      this.aimerGraphics.circle(point.x, point.y, 4);
      this.aimerGraphics.fill({ color: 0xffffff, alpha: 0.9 });
      this.aimerGraphics.circle(point.x, point.y, 4);
      this.aimerGraphics.stroke({ width: 2, color: 0x000000, alpha: 0.6 });
    }

    // Draw line from sprite to mouse (drag direction indicator)
    const { gridX: mouseGridX, gridY: mouseGridY } = this.screenToGrid(mouseX, mouseY);
    const mouseWorld = this.gridToWorld(mouseGridX, mouseGridY);
    this.aimerGraphics.moveTo(spriteWorldPos.x, spriteWorldPos.y);
    this.aimerGraphics.lineTo(mouseWorld.x, mouseWorld.y);
    this.aimerGraphics.stroke({ width: 3, color: 0xff0000, alpha: 0.8 });
  }

  // Game management functions
  
  endGame(winnerName: string) {
    if (this.gameOver) return; // Already ended
    
    this.gameOver = true;
    this.winner = winnerName;
    console.log(`${winnerName} wins!`);
    
    // Create game over overlay
    this.showGameOver();
  }
  
  showGameOver() {
    if (!this.winner) return;
    
    // Create semi-transparent overlay
    this.gameOverContainer = new Container();
    
    const overlay = new Graphics();
    overlay.rect(0, 0, this.app.screen.width, this.app.screen.height);
    overlay.fill({ color: 0x000000, alpha: 0.7 });
    this.gameOverContainer.addChild(overlay);
    
    // Winner text
    const winnerText = new Text({
      text: `${this.winner} Wins!`,
      style: {
        fontFamily: 'Orbitron',
        fontSize: 72,
        fontWeight: 'bold',
        fill: 0xFFD700,
        stroke: { color: 0x000000, width: 6 },
      }
    });
    winnerText.anchor.set(0.5);
    winnerText.position.set(this.app.screen.width / 2, this.app.screen.height / 2 - 50);
    this.gameOverContainer.addChild(winnerText);
    
    // Restart button
    const buttonBg = new Graphics();
    buttonBg.roundRect(-100, -30, 200, 60, 10);
    buttonBg.fill({ color: 0x4CAF50 });
    buttonBg.stroke({ width: 3, color: 0xFFFFFF });
    buttonBg.position.set(this.app.screen.width / 2, this.app.screen.height / 2 + 80);
    buttonBg.eventMode = 'static';
    buttonBg.cursor = 'pointer';
    
    const buttonText = new Text({
      text: 'Restart Game',
      style: {
        fontFamily: 'Orbitron',
        fontSize: 32,
        fontWeight: 'bold',
        fill: 0xFFFFFF,
      }
    });
    buttonText.anchor.set(0.5);
    buttonBg.addChild(buttonText);
    
    buttonBg.on('pointerdown', () => {
      window.location.reload();
    });
    
    this.gameOverContainer.addChild(buttonBg);
    this.uiContainer.addChild(this.gameOverContainer);
  }
  
  endTurn() {
    if (this.gameOver) return;
    
    // Switch player
    this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
    
    // Reset energy to max capacity (based on solar panels)
    this.playerEnergy[this.currentPlayer] = this.playerMaxEnergy[this.currentPlayer];
    
    // Add base ore income + ore from mines
    const baseOreIncome = 50;
    const orePerMine = 25;
    const totalOreIncome = baseOreIncome + (this.playerMineCount[this.currentPlayer] * orePerMine);
    this.playerOre[this.currentPlayer] += totalOreIncome;
    
    // Refill ammo for all turrets owned by current player
    for (let y = 0; y < this.GRID_HEIGHT; y++) {
      for (let x = 0; x < this.GRID_WIDTH; x++) {
        const cell = this.grid[y][x];
        if (cell.sprite && cell.sprite.owner === this.currentPlayer) {
          const turret = cell.sprite as any;
          if (turret.ammo !== undefined && turret.maxAmmo !== undefined && turret.ammoRegenRate !== undefined) {
            turret.ammo = Math.min(turret.ammo + turret.ammoRegenRate, turret.maxAmmo);
          }
        }
      }
    }
    
    console.log(`Player ${this.currentPlayer}'s turn - Energy: ${this.playerEnergy[this.currentPlayer]}/${this.playerMaxEnergy[this.currentPlayer]}, Ore gained: ${totalOreIncome} (${baseOreIncome} base + ${this.playerMineCount[this.currentPlayer] * orePerMine} from mines)`);
    this.updateGameInfo();
  }
  
  updateGameInfo() {
    if (!this.gameInfoText || !this.oreText || !this.energyText || !this.energyBarFill) return;
    if (!this.player1HealthBarFill || !this.player2HealthBarFill) return;
    if (!this.player1HealthText || !this.player2HealthText) return;
    
    // Update turn indicator
    const playerColor = this.currentPlayer === 1 ? 0x4CAF50 : 0x2196F3;
    this.gameInfoText.text = `Player ${this.currentPlayer}'s Turn`;
    this.gameInfoText.style.fill = playerColor;
    
    // Update planet health bars
    const player1Health = this.player1Base ? this.player1Base.health : 0;
    const player2Health = this.player2Base ? this.player2Base.health : 0;
    
    // Player 1 health bar
    const p1Percent = player1Health / 1000;
    this.player1HealthBarFill.clear();
    this.player1HealthBarFill.rect(0, 0, 200 * p1Percent, 20);
    this.player1HealthBarFill.fill({ color: 0x4CAF50, alpha: 0.9 });
    this.player1HealthText.text = `${player1Health}/1000`;
    
    // Player 2 health bar
    const p2Percent = player2Health / 1000;
    this.player2HealthBarFill.clear();
    this.player2HealthBarFill.rect(0, 0, 200 * p2Percent, 20);
    this.player2HealthBarFill.fill({ color: 0x2196F3, alpha: 0.9 });
    this.player2HealthText.text = `${player2Health}/1000`;
    
    // Update ore text with current player's color
    this.oreText.text = this.playerOre[this.currentPlayer].toString();
    this.oreText.style.fill = playerColor;
    
    // Update energy text
    this.energyText.text = `${this.playerEnergy[this.currentPlayer]}/${this.playerMaxEnergy[this.currentPlayer]}`;
    this.energyText.style.fill = 0xFFFF00;
    
    // Update energy bar
    const energyPercent = this.playerEnergy[this.currentPlayer] / this.playerMaxEnergy[this.currentPlayer];
    this.energyBarFill.clear();
    this.energyBarFill.rect(0, 0, 200 * energyPercent, 20);
    this.energyBarFill.fill({ color: 0xFFFF00, alpha: 0.9 });
  }

  // Draw trajectory for gun firing (ignoring launch planet gravity)
}
