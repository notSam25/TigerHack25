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
  
  // Particle trails
  private particleTrails: Map<GameSprite, Graphics[]> = new Map();
  
  // Floating damage numbers
  private damageTexts: { text: Text; life: number; vy: number }[] = [];

  // Sound manager
  private soundManager: SoundManager;

  // Game state
  private gameOver = false;
  private winner: string | null = null;
  private currentPlayer = 1; // 1 or 2
  
  // Screen shake
  private shakeAmount = 0;
  private shakeDecay = 0.9;
  
  // New resource systems
  private playerOre = [0, 200, 200]; // Ore for building - reduced to encourage building mines
  private playerEnergy = [0, 50, 50]; // Current energy - reduced to encourage building solar panels
  private playerMaxEnergy = [0, 50, 50]; // Max energy capacity
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
  private domeShieldTexture: Texture | null = null;
  
  // Main menu
  private mainMenuContainer: Container | null = null;
  private gameStarted: boolean = false;
  
  // AI mode
  private isAIMode: boolean = false;
  private aiThinkingDelay: number = 0;

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
  initToolbar(bunnyTexture: Texture, turretTexture: Texture, laserTurretTexture: Texture, mineTexture: Texture, solarPanelTexture: Texture, domeShieldTexture: Texture, missileTexture: Texture, laserTexture: Texture, oreIconTexture: Texture, energyIconTexture: Texture) {
    // Initialize tooltip first
    this.initTooltip();
    
    this.bunnyTexture = bunnyTexture;
    this.turretTexture = turretTexture;
    this.gunTexture = laserTurretTexture; // Reuse gunTexture variable for laser turret
    this.mineTexture = mineTexture;
    this.solarPanelTexture = solarPanelTexture;
    this.domeShieldTexture = domeShieldTexture;
    this.missileTexture = missileTexture;
    this.laserTexture = laserTexture;
    const BUNNY_TILES = 1;

    this.toolbar = new Container();
    this.toolbar.position.set(10, this.app.screen.height - 100);
    this.uiContainer.addChild(this.toolbar);

    // Toolbar background (wider to fit all sprites and trash)
    const toolbarBg = new Graphics();
    toolbarBg.rect(0, 0, 630, 90);
    toolbarBg.fill({ color: 0x222222, alpha: 0.9 });
    toolbarBg.stroke({ width: 2, color: 0x666666 });
    this.toolbar.addChild(toolbarBg);

    // Bunny sprite button
    const bunnyScale = ((this.TILE_SIZE * BUNNY_TILES * 0.8) / Math.max(bunnyTexture.width, bunnyTexture.height));
    const toolbarBunny = new Sprite(bunnyTexture);
    toolbarBunny.anchor.set(0.5);
    toolbarBunny.position.set(45, 35);
    toolbarBunny.scale.set(bunnyScale * 0.8);
    toolbarBunny.eventMode = "static";
    toolbarBunny.cursor = "pointer";
    this.toolbar.addChild(toolbarBunny);
    
    const bunnyLabel = new Text({
      text: 'Bunny',
      style: {
        fontFamily: 'Orbitron',
        fontSize: 10,
        fill: 0xffffff,
      }
    });
    bunnyLabel.anchor.set(0.5);
    bunnyLabel.position.set(45, 70);
    this.toolbar.addChild(bunnyLabel);

    // Turret sprite button (bigger, not rotated)
    const turretScale = ((this.TILE_SIZE * TURRET_TILES) / Math.max(turretTexture.width, turretTexture.height));
    const toolbarTurret = new Sprite(turretTexture);
    toolbarTurret.anchor.set(0.5);
    toolbarTurret.position.set(125, 35);
    toolbarTurret.scale.set(turretScale * 0.8);
    toolbarTurret.eventMode = "static";
    toolbarTurret.cursor = "pointer";
    this.toolbar.addChild(toolbarTurret);
    
    const turretLabel = new Text({
      text: 'Missile',
      style: {
        fontFamily: 'Orbitron',
        fontSize: 10,
        fill: 0xffffff,
      }
    });
    turretLabel.anchor.set(0.5);
    turretLabel.position.set(125, 70);
    this.toolbar.addChild(turretLabel);
    
    // Laser Turret sprite button
    const laserTurretScale = ((this.TILE_SIZE * TURRET_TILES) / Math.max(laserTurretTexture.width, laserTurretTexture.height));
    const toolbarLaserTurret = new Sprite(laserTurretTexture);
    toolbarLaserTurret.anchor.set(0.5);
    toolbarLaserTurret.position.set(205, 35);
    toolbarLaserTurret.scale.set(laserTurretScale * 0.8);
    toolbarLaserTurret.eventMode = "static";
    toolbarLaserTurret.cursor = "pointer";
    this.toolbar.addChild(toolbarLaserTurret);
    
    const laserLabel = new Text({
      text: 'Laser',
      style: {
        fontFamily: 'Orbitron',
        fontSize: 10,
        fill: 0xffffff,
      }
    });
    laserLabel.anchor.set(0.5);
    laserLabel.position.set(205, 70);
    this.toolbar.addChild(laserLabel);
    
    // Mine sprite button
    const mineScale = ((this.TILE_SIZE * TURRET_TILES) / Math.max(mineTexture.width, mineTexture.height));
    const toolbarMine = new Sprite(mineTexture);
    toolbarMine.anchor.set(0.5);
    toolbarMine.position.set(285, 35);
    toolbarMine.scale.set(mineScale * 0.8);
    toolbarMine.eventMode = "static";
    toolbarMine.cursor = "pointer";
    this.toolbar.addChild(toolbarMine);
    
    const mineLabel = new Text({
      text: 'Mine',
      style: {
        fontFamily: 'Orbitron',
        fontSize: 10,
        fill: 0xffffff,
      }
    });
    mineLabel.anchor.set(0.5);
    mineLabel.position.set(285, 70);
    this.toolbar.addChild(mineLabel);
    
    // Solar Panel sprite button
    const solarScale = ((this.TILE_SIZE * TURRET_TILES) / Math.max(solarPanelTexture.width, solarPanelTexture.height));
    const toolbarSolar = new Sprite(solarPanelTexture);
    toolbarSolar.anchor.set(0.5);
    toolbarSolar.position.set(365, 35);
    toolbarSolar.scale.set(solarScale * 0.8);
    toolbarSolar.eventMode = "static";
    toolbarSolar.cursor = "pointer";
    this.toolbar.addChild(toolbarSolar);
    
    const solarLabel = new Text({
      text: 'Solar',
      style: {
        fontFamily: 'Orbitron',
        fontSize: 10,
        fill: 0xffffff,
      }
    });
    solarLabel.anchor.set(0.5);
    solarLabel.position.set(365, 70);
    this.toolbar.addChild(solarLabel);
    
    // Dome Shield sprite button
    const domeShieldScale = ((this.TILE_SIZE * TURRET_TILES) / Math.max(domeShieldTexture.width, domeShieldTexture.height));
    const toolbarDomeShield = new Sprite(domeShieldTexture);
    toolbarDomeShield.anchor.set(0.5);
    toolbarDomeShield.position.set(445, 35);
    toolbarDomeShield.scale.set(domeShieldScale * 0.8);
    toolbarDomeShield.eventMode = "static";
    toolbarDomeShield.cursor = "pointer";
    this.toolbar.addChild(toolbarDomeShield);
    
    const domeShieldLabel = new Text({
      text: 'Dome',
      style: {
        fontFamily: 'Orbitron',
        fontSize: 10,
        fill: 0xffffff,
      }
    });
    domeShieldLabel.anchor.set(0.5);
    domeShieldLabel.position.set(445, 70);
    this.toolbar.addChild(domeShieldLabel);

    // Delete button (draggable X)
    this.trashCan = new Graphics();
    this.trashCan.rect(0, 0, 80, 80);
    this.trashCan.fill({ color: 0x880000, alpha: 0.8 });
    this.trashCan.stroke({ width: 2, color: 0xff0000 });
    this.trashCan.position.set(540, 5);
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
    
    toolbarDomeShield.on("pointerdown", (e: any) => {
      e.stopPropagation();
      this.hideTooltip();
      this.isDraggingFromToolbar = true;
      this.selectedTexture = domeShieldTexture;
      console.log("Selected DOME SHIELD from toolbar");
      this.soundManager.play('pickup');

      this.previewSprite = new Sprite(domeShieldTexture);
      this.previewSprite.anchor.set(0.5);
      this.previewSprite.alpha = 0.7;
      this.previewSprite.scale.set(domeShieldScale);
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
      text: '1200/1200',
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
      text: '1200/1200',
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
    
    const boxWidth = 400;
    const boxHeight = 600;
    const gap = 20;
    
    // Left Box - Buildings
    const leftBox = new Container();
    
    const leftBg = new Graphics();
    leftBg.rect(0, 0, boxWidth, boxHeight);
    leftBg.fill({ color: 0x000000, alpha: 0.9 });
    leftBg.stroke({ width: 3, color: 0x00FF00 });
    leftBox.addChild(leftBg);
    
    const leftTitle = new Text({
      text: 'BUILDINGS',
      style: {
        fontFamily: 'Orbitron',
        fontSize: 20,
        fontWeight: 'bold',
        fill: 0x00FF00,
      }
    });
    leftTitle.anchor.set(0.5, 0);
    leftTitle.position.set(boxWidth / 2, 15);
    leftBox.addChild(leftTitle);
    
    const buildingsText = new Text({
      text: [
        'MISSILE TURRET',
        'Cost: 150 Ore + 20 Energy',
        'Heavy kinetic payload.',
        'Slow reload, devastating impact.',
        'Dmg: 250 | Ammo: 1',
        '',
        'LASER TURRET',
        'Cost: 100 Ore + 20 Energy',
        'Rapid-fire energy weapon.',
        'Lower damage, higher rate.',
        'Dmg: 100 | Ammo: 3',
        '',
        'MINE',
        'Cost: 100 Ore + 15 Energy',
        'Extracts precious ore from',
        'asteroids. +75 ore/turn',
        '',
        'SOLAR PANEL',
        'Cost: 75 Ore + 10 Energy',
        'Harvests stellar energy.',
        'Max energy +50',
        '',
        'DOME SHIELD',
        'Cost: 75 Ore + 15 Energy',
        'Defensive barrier. Absorbs',
        'incoming fire. HP: 500',
      ].join('\n'),
      style: {
        fontFamily: 'Orbitron',
        fontSize: 13,
        fill: 0xFFFFFF,
        lineHeight: 20,
      }
    });
    buildingsText.position.set(20, 60);
    leftBox.addChild(buildingsText);
    
    // Right Box - Controls
    const rightBox = new Container();
    
    const rightBg = new Graphics();
    rightBg.rect(0, 0, boxWidth, boxHeight);
    rightBg.fill({ color: 0x000000, alpha: 0.9 });
    rightBg.stroke({ width: 3, color: 0x00FF00 });
    rightBox.addChild(rightBg);
    
    const rightTitle = new Text({
      text: 'CONTROLS',
      style: {
        fontFamily: 'Orbitron',
        fontSize: 20,
        fontWeight: 'bold',
        fill: 0x00FF00,
      }
    });
    rightTitle.anchor.set(0.5, 0);
    rightTitle.position.set(boxWidth / 2, 15);
    rightBox.addChild(rightTitle);
    
    const controlsText = new Text({
      text: [
        'PLACEMENT',
        '• Click toolbar item to select',
        '• Click grid to place building',
        '• Must be inside your shield',
        '  (glowing atmosphere)',
        '',
        'COMBAT',
        '• Click & drag from turret',
        '  to aim and fire',
        '• Weapons use 20 energy',
        '• Ammo regenerates per turn',
        '',
        'NAVIGATION',
        '• Mouse wheel to zoom',
        '• Click-drag to pan camera',
        '• Press I to toggle this info',
        '',
        'TURNS',
        '• Click "End Turn" to switch',
        '• Energy resets each turn',
        '• Ore accumulates',
      ].join('\n'),
      style: {
        fontFamily: 'Orbitron',
        fontSize: 14,
        fill: 0xFFFFFF,
        lineHeight: 22,
      }
    });
    controlsText.position.set(20, 60);
    rightBox.addChild(controlsText);
    
    // Position boxes side by side
    const totalWidth = boxWidth * 2 + gap;
    leftBox.position.set((this.app.screen.width - totalWidth) / 2, (this.app.screen.height - boxHeight) / 2);
    rightBox.position.set((this.app.screen.width - totalWidth) / 2 + boxWidth + gap, (this.app.screen.height - boxHeight) / 2);
    
    this.infoPanelContainer.addChild(leftBox);
    this.infoPanelContainer.addChild(rightBox);
    
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
        // Add asteroid radius to shield radius to ensure no overlap
        if (distance < this.shieldRadius + ASTEROID_RADIUS) {
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
        
        // Create stronger gravity field for asteroid to affect projectiles more
        applyGravityField(this.grid, x, y, 15, 0.35);
        
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
          // Add black hole radius to shield radius to ensure no overlap
          if (distance < this.shieldRadius + BLACK_HOLE_RADIUS) {
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
  
  // Create and show main menu
  showMainMenu() {
    this.mainMenuContainer = new Container();
    this.uiContainer.addChild(this.mainMenuContainer);
    
    // Fully opaque background overlay
    const overlay = new Graphics();
    overlay.rect(0, 0, this.app.screen.width, this.app.screen.height);
    overlay.fill({ color: 0x000000, alpha: 1.0 });
    this.mainMenuContainer.addChild(overlay);
    
    // Title
    const title = new Text({
      text: 'STELLAR SPITE',
      style: {
        fontFamily: 'Orbitron',
        fontSize: 72,
        fill: 0xffffff,
        stroke: { color: 0x00ffff, width: 4 },
        align: 'center',
      }
    });
    title.anchor.set(0.5);
    title.position.set(this.app.screen.width / 2, 150);
    this.mainMenuContainer.addChild(title);
    
    // Subtitle
    const subtitle = new Text({
      text: 'Turn-Based Space Combat',
      style: {
        fontFamily: 'Orbitron',
        fontSize: 24,
        fill: 0x00ffff,
        align: 'center',
      }
    });
    subtitle.anchor.set(0.5);
    subtitle.position.set(this.app.screen.width / 2, 230);
    this.mainMenuContainer.addChild(subtitle);
    
    // Play Button
    const playButton = this.createMenuButton('LOCAL MULTIPLAYER', this.app.screen.width / 2, 320, () => {
      this.isAIMode = false;
      this.showStoryScreen();
    });
    this.mainMenuContainer.addChild(playButton);
    
    // AI Button
    const aiButton = this.createMenuButton('VS AI', this.app.screen.width / 2, 420, () => {
      this.isAIMode = true;
      this.showStoryScreen();
    });
    this.mainMenuContainer.addChild(aiButton);
    
    // Instructions Button
    const instructionsButton = this.createMenuButton('HOW TO PLAY', this.app.screen.width / 2, 520, () => {
      this.showInstructions();
    });
    this.mainMenuContainer.addChild(instructionsButton);
  }
  
  // Helper to create menu buttons
  private createMenuButton(text: string, x: number, y: number, onClick: () => void): Container {
    const button = new Container();
    button.position.set(x, y);
    
    const bg = new Graphics();
    bg.rect(-200, -35, 400, 70);
    bg.fill({ color: 0x003366, alpha: 0.8 });
    bg.stroke({ width: 3, color: 0x00ffff });
    button.addChild(bg);
    
    const label = new Text({
      text: text,
      style: {
        fontFamily: 'Orbitron',
        fontSize: 28,
        fill: 0xffffff,
      }
    });
    label.anchor.set(0.5);
    button.addChild(label);
    
    button.eventMode = 'static';
    button.cursor = 'pointer';
    
    button.on('pointerover', () => {
      bg.clear();
      bg.rect(-200, -35, 400, 70);
      bg.fill({ color: 0x0066cc, alpha: 1 });
      bg.stroke({ width: 3, color: 0x00ffff });
      label.style.fill = 0x00ffff;
    });
    
    button.on('pointerout', () => {
      bg.clear();
      bg.rect(-200, -35, 400, 70);
      bg.fill({ color: 0x003366, alpha: 0.8 });
      bg.stroke({ width: 3, color: 0x00ffff });
      label.style.fill = 0xffffff;
    });
    
    button.on('pointerdown', onClick);
    
    return button;
  }
  
  // Show humorous story screen before starting game
  private showStoryScreen() {
    const storyContainer = new Container();
    this.uiContainer.addChild(storyContainer);
    
    // Full opacity background
    const overlay = new Graphics();
    overlay.rect(0, 0, this.app.screen.width, this.app.screen.height);
    overlay.fill({ color: 0x000000, alpha: 1.0 });
    storyContainer.addChild(overlay);
    
    // Story panel
    const panelWidth = 750;
    const panelHeight = 600;
    const panelX = (this.app.screen.width - panelWidth) / 2;
    const panelY = (this.app.screen.height - panelHeight) / 2;
    
    const panel = new Graphics();
    panel.rect(0, 0, panelWidth, panelHeight);
    panel.fill({ color: 0x001122, alpha: 1 });
    panel.stroke({ width: 4, color: 0x00ffff });
    panel.position.set(panelX, panelY);
    storyContainer.addChild(panel);
    
    // Title
    const title = new Text({
      text: 'THE GREAT SPACE FEUD',
      style: {
        fontFamily: 'Orbitron',
        fontSize: 36,
        fill: 0x00ffff,
        fontWeight: 'bold',
      }
    });
    title.anchor.set(0.5, 0);
    title.position.set(panelWidth / 2, 30);
    panel.addChild(title);
    
    // Story text
    const story = new Text({
      text: [
        'INCIDENT REPORT #2157-TH',
        '',
        'Subject: Neighborly Dispute',
        '',
        'They said moving to space would mean',
        'peace and quiet. They were wrong.',
        '',
        'Someone played their music too loud.',
        'Someone else refused to return a',
        'borrowed cup of antimatter.',
        '',
        'Words were exchanged. Lawyers were',
        'hired. Orbital cannons were built.',
        '',
        'Now it\'s come to this: two fortresses,',
        'infinite pettiness, zero chill.',
        '',
        '',
        '— Galactic Conflict Resolution Dept.',
      ].join('\n'),
      style: {
        fontFamily: 'Orbitron',
        fontSize: 14,
        fill: 0xffffff,
        align: 'left',
        lineHeight: 21,
      }
    });
    story.position.set(50, 90);
    panel.addChild(story);
    
    // Begin button
    const beginButton = this.createMenuButton('ENGAGE IN PETTINESS', panelWidth / 2, panelHeight - 60, () => {
      this.uiContainer.removeChild(storyContainer);
      this.startGame();
    });
    panel.addChild(beginButton);
  }
  
  // Start the actual game
  private startGame() {
    if (this.mainMenuContainer) {
      this.uiContainer.removeChild(this.mainMenuContainer);
      this.mainMenuContainer = null;
    }
    this.gameStarted = true;
    
    // Make game elements visible
    this.world.visible = true;
    this.toolbar.visible = true;
    if (this.gameInfoText) this.gameInfoText.visible = true;
    if (this.oreText) this.oreText.visible = true;
    if (this.energyText) this.energyText.visible = true;
    if (this.energyBarBg) this.energyBarBg.visible = true;
    if (this.energyBarFill) this.energyBarFill.visible = true;
    if (this.player1HealthText) this.player1HealthText.visible = true;
    if (this.player2HealthText) this.player2HealthText.visible = true;
    if (this.player1HealthBarBg) this.player1HealthBarBg.visible = true;
    if (this.player1HealthBarFill) this.player1HealthBarFill.visible = true;
    if (this.player2HealthBarBg) this.player2HealthBarBg.visible = true;
    if (this.player2HealthBarFill) this.player2HealthBarFill.visible = true;
    if (this.endTurnButton) this.endTurnButton.visible = true;
    if (this.endTurnText) this.endTurnText.visible = true;
  }
  
  // Show instructions overlay
  private showInstructions() {
    const instructionsContainer = new Container();
    this.uiContainer.addChild(instructionsContainer);
    
    // Semi-transparent background
    const overlay = new Graphics();
    overlay.rect(0, 0, this.app.screen.width, this.app.screen.height);
    overlay.fill({ color: 0x000000, alpha: 0.9 });
    instructionsContainer.addChild(overlay);
    
    // Content panel
    const panelWidth = 800;
    const panelHeight = 600;
    const panelX = (this.app.screen.width - panelWidth) / 2;
    const panelY = (this.app.screen.height - panelHeight) / 2;
    
    const panel = new Graphics();
    panel.rect(0, 0, panelWidth, panelHeight);
    panel.fill({ color: 0x001122, alpha: 1 });
    panel.stroke({ width: 3, color: 0x00ffff });
    panel.position.set(panelX, panelY);
    instructionsContainer.addChild(panel);
    
    // Title
    const title = new Text({
      text: 'HOW TO PLAY',
      style: {
        fontFamily: 'Orbitron',
        fontSize: 42,
        fill: 0x00ffff,
        align: 'center',
      }
    });
    title.anchor.set(0.5, 0);
    title.position.set(this.app.screen.width / 2, panelY + 20);
    instructionsContainer.addChild(title);
    
    // Scrollable content area
    const scrollAreaY = panelY + 80;
    const scrollAreaHeight = panelHeight - 160; // Leave room for title and button
    
    // Create mask for scroll area
    const scrollMask = new Graphics();
    scrollMask.rect(panelX + 20, scrollAreaY, panelWidth - 40, scrollAreaHeight);
    scrollMask.fill({ color: 0xffffff });
    instructionsContainer.addChild(scrollMask);
    
    // Scrollable container
    const scrollContainer = new Container();
    scrollContainer.position.set(panelX + 50, scrollAreaY);
    scrollContainer.mask = scrollMask;
    instructionsContainer.addChild(scrollContainer);
    
    // Instructions text
    const instructions = new Text({
      text: [
        'THE STORY',
        'Two rival planets compete for dominance in a resource-scarce sector.',
        'Build defenses, gather resources, and destroy the enemy planet to win!',
        '',
        'OBJECTIVE',
        '• Destroy the enemy planet (1200 HP) to win',
        '• Protect your own planet from destruction',
        '',
        'RESOURCES',
        '• ORE: Used to build structures. Accumulates each turn.',
        '  - Start with 600 ore',
        '  - Mines generate +75 ore per turn',
        '• ENERGY: Powers your buildings. Resets each turn.',
        '  - Start with 100 energy per turn',
        '  - Solar Panels increase max energy by +50',
        '  - Weapons consume 15 energy per shot',
        '',
        'BUILDINGS (Must be placed within your shield)',
        '• MISSILE TURRET: 150 ore + 20 energy - Heavy damage (250)',
        '• LASER TURRET: 100 ore + 20 energy - Fast damage (100)',
        '• MINE: 100 ore + 15 energy - Generates +75 ore/turn',
        '• SOLAR PANEL: 75 ore + 10 energy - Increases max energy',
        '• DOME SHIELD: 75 ore + 15 energy - 500 HP defensive wall',
        '',
        'COMBAT',
        '• Click and drag from your turrets to aim and fire',
        '• Missiles: 1 ammo max, +1 per turn',
        '• Lasers: 3 ammo max, +1 per turn',
        '• All weapons consume 15 energy per shot',
        '',
        'CONTROLS',
        '• Click toolbar items to select, then click grid to place',
        '• Drag buildings to trash can to delete',
        '• Press "End Turn" when done building/attacking',
        '• Press "I" key to view detailed building stats',
        '• Mouse wheel to zoom, click-drag to pan',
        '',
        'TIPS',
        '• Balance offense and resource generation',
        '• Solar panels provide more energy for multiple shots per turn',
        '• Mines pay for themselves over time',
        '• Use dome shields to protect key buildings from enemy fire',
        '• Protect your buildings - they can be destroyed!',
      ].join('\n'),
      style: {
        fontFamily: 'Orbitron',
        fontSize: 14,
        fill: 0xffffff,
        lineHeight: 22,
      }
    });
    scrollContainer.addChild(instructions);
    
    // Scroll functionality
    let scrollY = 0;
    const maxScroll = Math.max(0, instructions.height - scrollAreaHeight);
    
    // Scrollbar background
    const scrollbarWidth = 10;
    const scrollbarX = panelX + panelWidth - 30;
    const scrollbarBg = new Graphics();
    scrollbarBg.rect(scrollbarX, scrollAreaY, scrollbarWidth, scrollAreaHeight);
    scrollbarBg.fill({ color: 0x003344, alpha: 0.8 });
    instructionsContainer.addChild(scrollbarBg);
    
    // Scrollbar handle
    const scrollbarHandle = new Graphics();
    const handleHeight = Math.max(40, scrollAreaHeight * (scrollAreaHeight / instructions.height));
    scrollbarHandle.rect(scrollbarX, scrollAreaY, scrollbarWidth, handleHeight);
    scrollbarHandle.fill({ color: 0x00ffff, alpha: 0.9 });
    scrollbarHandle.eventMode = 'static';
    scrollbarHandle.cursor = 'pointer';
    instructionsContainer.addChild(scrollbarHandle);
    
    // Update scrollbar position function
    const updateScrollbar = () => {
      const scrollPercent = maxScroll > 0 ? scrollY / maxScroll : 0;
      const handleY = scrollAreaY + scrollPercent * (scrollAreaHeight - handleHeight);
      scrollbarHandle.y = handleY - scrollAreaY;
    };
    
    // Make scrollbar draggable
    let isDraggingScrollbar = false;
    let dragStartY = 0;
    let scrollStartY = 0;
    
    scrollbarHandle.on('pointerdown', (event: any) => {
      isDraggingScrollbar = true;
      dragStartY = event.global.y;
      scrollStartY = scrollY;
      event.stopPropagation();
    });
    
    const onScrollbarDrag = (event: any) => {
      if (!isDraggingScrollbar) return;
      
      const deltaY = event.global.y - dragStartY;
      const scrollDelta = (deltaY / (scrollAreaHeight - handleHeight)) * maxScroll;
      scrollY = Math.max(0, Math.min(maxScroll, scrollStartY + scrollDelta));
      instructions.y = -scrollY;
      updateScrollbar();
    };
    
    const onScrollbarDragEnd = () => {
      isDraggingScrollbar = false;
    };
    
    this.app.stage.on('pointermove', onScrollbarDrag);
    this.app.stage.on('pointerup', onScrollbarDragEnd);
    this.app.stage.on('pointerupoutside', onScrollbarDragEnd);
    
    // Mouse wheel scrolling for instructions
    const scrollHandler = (event: WheelEvent) => {
      event.preventDefault();
      scrollY += event.deltaY * 0.5;
      scrollY = Math.max(0, Math.min(maxScroll, scrollY));
      instructions.y = -scrollY;
      updateScrollbar();
    };
    
    window.addEventListener('wheel', scrollHandler, { passive: false });
    
    // Back button
    const backButton = this.createMenuButton('BACK TO MENU', this.app.screen.width / 2, panelY + panelHeight - 50, () => {
      window.removeEventListener('wheel', scrollHandler);
      this.uiContainer.removeChild(instructionsContainer);
    });
    instructionsContainer.addChild(backButton);
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
    // Hide game elements initially
    this.world.visible = false;
    this.toolbar.visible = false;
    if (this.gameInfoText) this.gameInfoText.visible = false;
    if (this.oreText) this.oreText.visible = false;
    if (this.energyText) this.energyText.visible = false;
    if (this.energyBarBg) this.energyBarBg.visible = false;
    if (this.energyBarFill) this.energyBarFill.visible = false;
    if (this.player1HealthText) this.player1HealthText.visible = false;
    if (this.player2HealthText) this.player2HealthText.visible = false;
    if (this.player1HealthBarBg) this.player1HealthBarBg.visible = false;
    if (this.player1HealthBarFill) this.player1HealthBarFill.visible = false;
    if (this.player2HealthBarBg) this.player2HealthBarBg.visible = false;
    if (this.player2HealthBarFill) this.player2HealthBarFill.visible = false;
    if (this.endTurnButton) this.endTurnButton.visible = false;
    if (this.endTurnText) this.endTurnText.visible = false;
    
    // Show main menu
    this.showMainMenu();
    
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
      if (!this.gameStarted) return; // Ignore input until game starts
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
      if (!this.gameStarted) return; // Ignore input until game starts
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
          const energyCost = 15; // Reduced for faster games
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
            (projectile as any).isLaser = isLaserTurret; // Track projectile type for particle effects
            
            // Add to world and projectiles array (will be added to grid when it moves)
            this.world.addChild(projectile.getDisplay());
            this.projectiles.push(projectile);
            
            // Create particle trail for this projectile
            this.particleTrails.set(projectile, []);
            
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
            const turretCost = 150; // Reduced for faster games
            const turretEnergyCost = 20; // Reduced for faster games
            
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
                const spriteDisplay = sprite.getDisplay() as Sprite;
                spriteDisplay.scale.set(spriteScale);
                
                // Flip turret if on right half of screen
                if (gridX > this.GRID_WIDTH / 2) {
                  spriteDisplay.scale.x = -spriteScale;
                }

                const placed = this.placeSprite(gridX, gridY, sprite);
                if (placed) {
                  this.playerOre[this.currentPlayer] -= turretCost;
                  this.playerEnergy[this.currentPlayer] -= turretEnergyCost;
                  this.updateGameInfo();
                  this.soundManager.play('placeBuilding');
                  console.log(`Placed turret at grid (${gridX}, ${gridY}) with radius ${sprite.radius}`);
                } else {
                  this.soundManager.play('invalidPlacement');
                  console.log("Cannot place turret - placeSprite failed");
                }
              } else {
                this.soundManager.play('invalidPlacement');
                console.log("Cannot place turret - cells occupied or out of bounds");
              }
            }
          } else if (isLaserTurret) {
            // Laser Turret placement
            const laserTurretCost = 100; // Reduced for faster games
            const laserTurretEnergyCost = 20; // Reduced for faster games
            
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
                const spriteDisplay = sprite.getDisplay() as Sprite;
                spriteDisplay.scale.set(spriteScale);
                
                // Flip laser turret if on right half of screen
                if (gridX > this.GRID_WIDTH / 2) {
                  spriteDisplay.scale.x = -spriteScale;
                }

                const placed = this.placeSprite(gridX, gridY, sprite);
                if (placed) {
                  this.playerOre[this.currentPlayer] -= laserTurretCost;
                  this.playerEnergy[this.currentPlayer] -= laserTurretEnergyCost;
                  this.updateGameInfo();
                  this.soundManager.play('placeBuilding');
                  console.log(`Placed laser turret at grid (${gridX}, ${gridY}) with radius ${sprite.radius}`);
                } else {
                  this.soundManager.play('invalidPlacement');
                  console.log("Cannot place laser turret - placeSprite failed");
                }
              } else {
                this.soundManager.play('invalidPlacement');
                console.log("Cannot place laser turret - cells occupied or out of bounds");
              }
            }
          } else if (this.selectedTexture === this.mineTexture) {
            // Mine placement - generates ore per turn
            const mineCost = 100; // Reduced for faster games
            const mineEnergyCost = 15; // Reduced for faster games
            
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

                const placed = this.placeSprite(gridX, gridY, sprite);
                if (placed) {
                  this.playerOre[this.currentPlayer] -= mineCost;
                  this.playerEnergy[this.currentPlayer] -= mineEnergyCost;
                  this.playerMineCount[this.currentPlayer]++;
                  this.updateGameInfo();
                  this.soundManager.play('placeBuilding');
                  console.log(`Placed mine at grid (${gridX}, ${gridY})`);
                } else {
                  this.soundManager.play('invalidPlacement');
                  console.log("Cannot place mine - placeSprite failed");
                }
              } else {
                this.soundManager.play('invalidPlacement');
                console.log("Cannot place mine - cells occupied or out of bounds");
              }
            }
          } else if (this.selectedTexture === this.solarPanelTexture) {
            // Solar Panel placement - increases max energy
            const solarCost = 75; // Reduced for faster games
            const solarEnergyCost = 10; // Reduced for faster games
            
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

                const placed = this.placeSprite(gridX, gridY, sprite);
                if (placed) {
                  this.playerOre[this.currentPlayer] -= solarCost;
                  this.playerEnergy[this.currentPlayer] -= solarEnergyCost;
                  this.playerSolarCount[this.currentPlayer]++;
                  this.playerMaxEnergy[this.currentPlayer] += 50; // +50 max energy per solar panel
                  this.updateGameInfo();
                  this.soundManager.play('placeBuilding');
                  console.log(`Placed solar panel at grid (${gridX}, ${gridY})`);
                } else {
                  this.soundManager.play('invalidPlacement');
                  console.log("Cannot place solar panel - placeSprite failed");
                }
              } else {
                this.soundManager.play('invalidPlacement');
                console.log("Cannot place solar panel - cells occupied or out of bounds");
              }
            }
          } else if (this.selectedTexture === this.domeShieldTexture) {
            // Dome Shield placement - defensive building with 500 HP
            const domeShieldCost = 75; // Reduced for faster games
            const domeShieldEnergyCost = 15; // Reduced for faster games
            
            if (this.playerOre[this.currentPlayer] < domeShieldCost) {
              console.log("Not enough ore to buy dome shield!");
              this.soundManager.play('invalidPlacement');
            } else if (this.playerEnergy[this.currentPlayer] < domeShieldEnergyCost) {
              console.log("Not enough energy to build dome shield!");
              this.soundManager.play('invalidPlacement');
            } else if (!this.isWithinPlayerShield(gridX, gridY)) {
              console.log("Cannot place dome shield - must be within your shield!");
              this.soundManager.play('invalidPlacement');
            } else {
              const sprite = createSprite("domeShield", {
                texture: this.selectedTexture,
                name: "Dome Shield",
              });
              sprite.owner = this.currentPlayer; // Set ownership
              
              // Calculate rotation to be tangential to player's planet
              const playerBase = this.currentPlayer === 1 ? this.player1Base : this.player2Base;
              let rotation = 0;
              if (playerBase) {
                const planetPos = playerBase.getDisplay().position;
                const worldPos = this.gridToWorld(gridX, gridY);
                
                // Calculate angle from dome shield to planet center
                const dx = worldPos.x - planetPos.x;
                const dy = worldPos.y - planetPos.y;
                const angleToCenter = Math.atan2(dy, dx);
                
                // Rotate to be tangential (perpendicular to radius)
                // Add 90 degrees (PI/2) to make it tangent to the circle
                rotation = angleToCenter + Math.PI / 2;
              }
              
              // Store rotation in sprite for later cleanup/collision
              sprite.rotation = rotation;
              
              if (this.canPlaceInRadius(gridX, gridY, sprite.radius, sprite.shape, sprite.width, sprite.height, rotation)) {
                // For dome shield (8x2 rectangle), scale larger to cover diagonal rotation
                // At 45° rotation, diagonal is sqrt(8^2 + 2^2) ≈ 8.25 tiles
                // Scale to 10 tiles to ensure full coverage at all angles
                const spriteScale = ((this.TILE_SIZE * 10) / Math.max(this.selectedTexture.width, this.selectedTexture.height));
                const spriteDisplay = sprite.getDisplay() as Sprite;
                spriteDisplay.scale.set(spriteScale);
                spriteDisplay.rotation = rotation;

                const placed = this.placeSprite(gridX, gridY, sprite, rotation);
                if (placed) {
                  this.playerOre[this.currentPlayer] -= domeShieldCost;
                  this.playerEnergy[this.currentPlayer] -= domeShieldEnergyCost;
                  this.updateGameInfo();
                  this.soundManager.play('placeBuilding');
                  console.log(`Placed dome shield at grid (${gridX}, ${gridY})`);
                } else {
                  this.soundManager.play('invalidPlacement');
                  console.log("Cannot place dome shield - placeSprite failed");
                }
              } else {
                this.soundManager.play('invalidPlacement');
                console.log("Cannot place dome shield - cells occupied or out of bounds");
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

              const placed = this.placeSprite(gridX, gridY, sprite);
              if (placed) {
                this.soundManager.play('placeBuilding');
                console.log(`Placed bunny at grid (${gridX}, ${gridY}) with radius ${sprite.radius}`);
              } else {
                this.soundManager.play('invalidPlacement');
                console.log("Cannot place bunny - placeSprite failed");
              }
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
      if (!this.gameStarted) return; // Ignore input until game starts
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
        // Update world position with dragging
        const newX = e.clientX - this.dragStart.x;
        const newY = e.clientY - this.dragStart.y;
        
        // Apply constraints immediately to prevent panning outside grid
        const gridPixelWidth = this.GRID_WIDTH * this.TILE_SIZE * this.zoom;
        const gridPixelHeight = this.GRID_HEIGHT * this.TILE_SIZE * this.zoom;

        const minX = this.app.screen.width - gridPixelWidth;
        const maxX = 0;
        const minY = this.app.screen.height - gridPixelHeight;
        const maxY = 0;

        const constrainedX = Math.max(minX, Math.min(maxX, newX));
        const constrainedY = Math.max(minY, Math.min(maxY, newY));
        
        this.world.x = constrainedX;
        this.world.y = constrainedY;
        
        // Update drag start if we hit a boundary to prevent jumping when zoom changes
        if (constrainedX !== newX || constrainedY !== newY) {
          this.dragStart.x = e.clientX - constrainedX;
          this.dragStart.y = e.clientY - constrainedY;
        }
        
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
    
    // AI thinking delay
    if (this.aiThinkingDelay > 0) {
      this.aiThinkingDelay--;
      if (this.aiThinkingDelay === 0) {
        this.executeAITurn();
      }
    }
    
    // Constrain panning to grid boundaries BEFORE applying shake
    const gridPixelWidth = this.GRID_WIDTH * this.TILE_SIZE * this.zoom;
    const gridPixelHeight = this.GRID_HEIGHT * this.TILE_SIZE * this.zoom;

    const minX = this.app.screen.width - gridPixelWidth;
    const maxX = 0;
    const minY = this.app.screen.height - gridPixelHeight;
    const maxY = 0;

    this.world.x = Math.max(minX, Math.min(maxX, this.world.x));
    this.world.y = Math.max(minY, Math.min(maxY, this.world.y));
    
    // Apply screen shake on top of constrained position
    if (this.shakeAmount > 0.1) {
      const shakeX = (Math.random() - 0.5) * this.shakeAmount;
      const shakeY = (Math.random() - 0.5) * this.shakeAmount;
      this.world.x += shakeX;
      this.world.y += shakeY;
      this.shakeAmount *= this.shakeDecay;
    } else {
      this.shakeAmount = 0;
    }

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
                    
                    // Apply damage to the target (10000 damage from bunny - dev tool!)
                    // Skip damage for black holes - they are invulnerable
                    let targetDestroyed = false;
                    if (targetSprite.name !== "Black Hole") {
                      targetDestroyed = targetSprite.takeDamage(10000);
                      // Show damage number
                      this.showDamageNumber(worldPos.x, worldPos.y, 10000);
                    }
                    
                    // Remove the target if health reached 0
                    if (targetDestroyed) {
                      // Find the target's grid position
                      const targetCells = this.getCellsInRadius(checkX, checkY, targetSprite.radius, targetSprite.shape, targetSprite.width, targetSprite.height, targetSprite.rotation);
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
                      
                      // Check win condition if a base planet was destroyed
                      if (targetSprite === this.player1Base) {
                        this.endGame("Player 2");
                      } else if (targetSprite === this.player2Base) {
                        this.endGame("Player 1");
                      }
                      
                      console.log(`${targetSprite.name} destroyed!`);
                    } else {
                      console.log(`${targetSprite.name} took 100 damage. Health: ${targetSprite.health}/${targetSprite.maxHealth}`);
                    }
                    
                    // Remove the moving sprite (projectile) - only clear cells that belong to this sprite
                    const oldCells = this.getCellsInRadius(x, y, sprite.radius, sprite.shape, sprite.width, sprite.height, sprite.rotation);
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
                const oldCells = this.getCellsInRadius(x, y, sprite.radius, sprite.shape, sprite.width, sprite.height, sprite.rotation);
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
                  const newCells = this.getCellsInRadius(currentGridX, currentGridY, sprite.radius, sprite.shape, sprite.width, sprite.height, sprite.rotation);
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
    
    // Update and clean up damage numbers
    for (let i = this.damageTexts.length - 1; i >= 0; i--) {
      const dmg = this.damageTexts[i];
      dmg.life--;
      dmg.text.y += dmg.vy;
      dmg.text.alpha = dmg.life / 60; // Fade out
      
      // Scale down slightly as it fades
      const scaleProgress = dmg.life / 60;
      dmg.text.scale.set(1.2 + (1 - scaleProgress) * 0.3); // Grows slightly as it fades
      
      if (dmg.life <= 0) {
        this.world.removeChild(dmg.text);
        this.damageTexts.splice(i, 1);
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
      
      // Add particle trail
      const pos = projectile.getDisplay().position;
      const isLaser = (projectile as any).isLaser;
      const trail = this.particleTrails.get(projectile) || [];
      
      // Create particle
      const particle = new Graphics();
      particle.circle(0, 0, isLaser ? 3 : 4);
      const particleColor = isLaser ? 0x00ffff : 0xff6600; // Cyan for lasers, orange for missiles
      particle.fill({ color: particleColor, alpha: 0.8 });
      particle.position.set(pos.x, pos.y);
      this.world.addChild(particle);
      trail.push(particle);
      this.particleTrails.set(projectile, trail);
      
      // Limit trail length and fade old particles
      if (trail.length > 15) {
        const oldParticle = trail.shift();
        if (oldParticle) {
          this.world.removeChild(oldParticle);
        }
      }
      
      // Fade particles
      trail.forEach((p, idx) => {
        p.alpha = (idx / trail.length) * 0.8;
      });
      
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
            
            // Clean up particle trail
            const trail = this.particleTrails.get(projectile);
            if (trail) {
              trail.forEach(p => this.world.removeChild(p));
              this.particleTrails.delete(projectile);
            }
            
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
          
          // Show damage number
          const hitWorldPos = projectile.getDisplay().position;
          this.showDamageNumber(hitWorldPos.x, hitWorldPos.y, damage);
          
          console.log(`Projectile hit ${hitSprite.name} for ${damage} damage (${hitSprite.health} HP remaining)`);
          
          // Update UI immediately if a planet was hit
          if (hitSprite.name === "Player 1 Base" || hitSprite.name === "Player 2 Base") {
            this.updateGameInfo();
          }
          
          // Create explosion at projectile location
          const projectileWorldPos = projectile.getDisplay().position;
          this.createExplosion(projectileWorldPos.x, projectileWorldPos.y, 0.5);
          this.soundManager.play('explosion');
          
          // Clean up particle trail
          const trail = this.particleTrails.get(projectile);
          if (trail) {
            trail.forEach(p => this.world.removeChild(p));
            this.particleTrails.delete(projectile);
          }
          
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
        // Clean up particle trail
        const trail = this.particleTrails.get(projectile);
        if (trail) {
          trail.forEach(p => this.world.removeChild(p));
          this.particleTrails.delete(projectile);
        }
        
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
  getCellsInRadius(centerX: number, centerY: number, radius: number, shape: "circle" | "square" | "rectangle" = "circle", width?: number, height?: number, rotation?: number): { x: number; y: number }[] {
    const cells: { x: number; y: number }[] = [];
    
    if (shape === "rectangle" && width !== undefined && height !== undefined) {
      // Rectangle mode with dome shape: 
      // For dome shields, create an arch pattern (wider at base, narrower at top)
      const halfWidth = Math.floor(width / 2);
      const halfHeight = Math.floor(height / 2);
      
      // If rotation is provided, rotate the rectangle cells
      if (rotation !== undefined && rotation !== 0) {
        const usedCells = new Set<string>();
        for (let dy = -halfHeight; dy < height - halfHeight; dy++) {
          // Calculate dome narrowing - top row is narrower
          const rowFromBottom = dy + halfHeight; // 0 = bottom, height-1 = top
          const narrowing = (rowFromBottom / (height - 1)) * 2; // 0 at bottom, 2 at top
          const effectiveHalfWidth = Math.max(1, halfWidth - Math.floor(narrowing));
          
          for (let dx = -effectiveHalfWidth; dx < width - halfWidth - (halfWidth - effectiveHalfWidth); dx++) {
            // Rotate the offset around the origin
            const rotatedX = dx * Math.cos(rotation) - dy * Math.sin(rotation);
            const rotatedY = dx * Math.sin(rotation) + dy * Math.cos(rotation);
            
            // Round to nearest grid cell
            const cellX = centerX + Math.round(rotatedX);
            const cellY = centerY + Math.round(rotatedY);
            
            // Use a Set to avoid duplicate cells
            const key = `${cellX},${cellY}`;
            if (!usedCells.has(key)) {
              cells.push({ x: cellX, y: cellY });
              usedCells.add(key);
            }
          }
        }
      } else {
        // No rotation - dome-shaped horizontal rectangle
        for (let dy = -halfHeight; dy < height - halfHeight; dy++) {
          // Calculate dome narrowing - top row is narrower
          const rowFromBottom = dy + halfHeight; // 0 = bottom, height-1 = top
          const narrowing = (rowFromBottom / (height - 1)) * 2; // 0 at bottom, 2 at top
          const effectiveHalfWidth = Math.max(1, halfWidth - Math.floor(narrowing));
          
          for (let dx = -effectiveHalfWidth; dx < width - halfWidth - (halfWidth - effectiveHalfWidth); dx++) {
            cells.push({ x: centerX + dx, y: centerY + dy });
          }
        }
      }
    } else if (shape === "square") {
      // For square mode:
      // radius 0 = 2x2 square starting at (centerX, centerY)
      // radius 1 = 3x3 square centered on (centerX, centerY)
      // radius 2 = 5x5 square centered on (centerX, centerY)
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
  canPlaceInRadius(centerX: number, centerY: number, radius: number, shape: "circle" | "square" | "rectangle" = "circle", width?: number, height?: number, rotation?: number): boolean {
    const cells = this.getCellsInRadius(centerX, centerY, radius, shape, width, height, rotation);
    console.log(`canPlaceInRadius at (${centerX}, ${centerY}) with shape=${shape}, cells=${cells.length}, rotation=${rotation}`);
    
    for (const cell of cells) {
      if (
        cell.x < 0 ||
        cell.x >= this.GRID_WIDTH ||
        cell.y < 0 ||
        cell.y >= this.GRID_HEIGHT
      ) {
        console.log(`  Cell (${cell.x}, ${cell.y}) out of bounds`);
        return false;
      }
      if (this.grid[cell.y][cell.x].occupied) {
        console.log(`  Cell (${cell.x}, ${cell.y}) already occupied`);
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
  
  // Check if position is within a specific player's shield
  isPositionWithinShield(gridX: number, gridY: number, player: number): boolean {
    const playerBase = player === 1 ? this.player1Base : this.player2Base;
    if (!playerBase) return false;
    
    const dx = gridX - playerBase.centerX;
    const dy = gridY - playerBase.centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    return distance <= this.shieldRadius;
  }

  // Place sprite with radius occupation
  placeSprite(gridX: number, gridY: number, sprite: GameSprite, rotation?: number): boolean {
    console.log(`placeSprite called: gridX=${gridX}, gridY=${gridY}, sprite=${sprite.name}, radius=${sprite.radius}, shape=${sprite.shape}`);
    if (!this.canPlaceInRadius(gridX, gridY, sprite.radius, sprite.shape, sprite.width, sprite.height, rotation)) {
      return false;
    }

    // Occupy all cells in radius
    const cells = this.getCellsInRadius(gridX, gridY, sprite.radius, sprite.shape, sprite.width, sprite.height, rotation);
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
    
    // Add screen shake based on explosion size
    this.addScreenShake(scale * 10);
    
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
      scale * 1.5, // Make explosions 50% bigger
      48,         // totalFrames - 48 frame sprite sheet
      frameWidth, // frameWidth - calculated from texture
      frameHeight, // frameHeight - calculated from texture
      cols,       // framesPerRow - 8 columns
      0.6         // animationSpeed - faster animation (increased from 0.4)
    );
    this.world.addChild(explosion.getDisplay());
    this.explosions.push(explosion);
  }
  
  // Add screen shake effect
  addScreenShake(amount: number) {
    this.shakeAmount = Math.min(this.shakeAmount + amount, 50); // Cap at 50px
  }
  
  // Show floating damage number
  showDamageNumber(x: number, y: number, damage: number) {
    const damageText = new Text({
      text: `-${damage}`,
      style: {
        fontFamily: 'Orbitron',
        fontSize: 56,
        fontWeight: 'bold',
        fill: 0xFFFF00, // Bright yellow - stands out against explosions
        stroke: { color: 0x000000, width: 6 },
        dropShadow: {
          alpha: 1,
          angle: Math.PI / 4,
          blur: 6,
          color: 0xFF0000,
          distance: 4,
        },
      }
    });
    damageText.anchor.set(0.5);
    damageText.position.set(x, y);
    damageText.scale.set(1.2); // Start slightly bigger
    this.world.addChild(damageText);
    
    this.damageTexts.push({
      text: damageText,
      life: 60, // 1 second at 60fps
      vy: -2.5 // Float upward slightly faster
    });
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
    
    // Big screen shake for dramatic effect
    this.addScreenShake(30);
    
    // Create game over overlay
    this.showGameOver();
  }
  
  showGameOver() {
    if (!this.winner) return;
    
    // Create semi-transparent overlay
    this.gameOverContainer = new Container();
    
    const overlay = new Graphics();
    overlay.rect(0, 0, this.app.screen.width, this.app.screen.height);
    overlay.fill({ color: 0x000000, alpha: 0.85 });
    this.gameOverContainer.addChild(overlay);
    
    // Victory banner background
    const bannerBg = new Graphics();
    const bannerWidth = 800;
    const bannerHeight = 200;
    bannerBg.roundRect(-bannerWidth/2, -bannerHeight/2, bannerWidth, bannerHeight, 20);
    const winnerColor = this.winner === "Player 1" ? 0x4CAF50 : 0x2196F3;
    bannerBg.fill({ color: winnerColor, alpha: 0.3 });
    bannerBg.stroke({ width: 5, color: winnerColor });
    bannerBg.position.set(this.app.screen.width / 2, this.app.screen.height / 2 - 100);
    this.gameOverContainer.addChild(bannerBg);
    
    // Winner text with glow
    const winnerText = new Text({
      text: `${this.winner} WINS!`,
      style: {
        fontFamily: 'Orbitron',
        fontSize: 84,
        fontWeight: 'bold',
        fill: 0xFFFFFF,
        stroke: { color: winnerColor, width: 8 },
        dropShadow: {
          alpha: 0.8,
          angle: Math.PI / 6,
          blur: 4,
          color: winnerColor,
          distance: 6,
        },
      }
    });
    winnerText.anchor.set(0.5);
    winnerText.position.set(this.app.screen.width / 2, this.app.screen.height / 2 - 100);
    this.gameOverContainer.addChild(winnerText);
    
    // Subtitle
    const subtitle = new Text({
      text: 'VICTORY ACHIEVED',
      style: {
        fontFamily: 'Orbitron',
        fontSize: 24,
        fill: 0xFFD700,
        stroke: { color: 0x000000, width: 3 },
      }
    });
    subtitle.anchor.set(0.5);
    subtitle.position.set(this.app.screen.width / 2, this.app.screen.height / 2 - 20);
    this.gameOverContainer.addChild(subtitle);
    
    // Restart button with hover effect
    const buttonContainer = new Container();
    buttonContainer.position.set(this.app.screen.width / 2, this.app.screen.height / 2 + 100);
    
    const buttonBg = new Graphics();
    buttonBg.roundRect(-150, -40, 300, 80, 15);
    buttonBg.fill({ color: winnerColor });
    buttonBg.stroke({ width: 4, color: 0xFFFFFF });
    buttonContainer.addChild(buttonBg);
    
    const buttonText = new Text({
      text: 'PLAY AGAIN',
      style: {
        fontFamily: 'Orbitron',
        fontSize: 32,
        fontWeight: 'bold',
        fill: 0xFFFFFF,
        stroke: { color: 0x000000, width: 3 },
      }
    });
    buttonText.anchor.set(0.5);
    buttonContainer.addChild(buttonText);
    
    buttonContainer.eventMode = 'static';
    buttonContainer.cursor = 'pointer';
    
    // Hover animation
    buttonContainer.on('pointerover', () => {
      buttonContainer.scale.set(1.1);
      buttonBg.clear();
      buttonBg.roundRect(-150, -40, 300, 80, 15);
      buttonBg.fill({ color: 0xFFD700 });
      buttonBg.stroke({ width: 4, color: 0xFFFFFF });
    });
    
    buttonContainer.on('pointerout', () => {
      buttonContainer.scale.set(1);
      buttonBg.clear();
      buttonBg.roundRect(-150, -40, 300, 80, 15);
      buttonBg.fill({ color: winnerColor });
      buttonBg.stroke({ width: 4, color: 0xFFFFFF });
    });
    
    buttonContainer.on('pointerdown', () => {
      window.location.reload();
    });
    
    this.gameOverContainer.addChild(buttonContainer);
    
    // Animate in with scale
    this.gameOverContainer.alpha = 0;
    this.gameOverContainer.scale.set(0.5);
    
    // Simple animation
    const animateIn = () => {
      if (this.gameOverContainer) {
        this.gameOverContainer.alpha = Math.min(this.gameOverContainer.alpha + 0.05, 1);
        this.gameOverContainer.scale.set(Math.min(this.gameOverContainer.scale.x + 0.05, 1));
        
        if (this.gameOverContainer.alpha < 1) {
          requestAnimationFrame(animateIn);
        }
      }
    };
    animateIn();
    
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
    const orePerMine = 75; // Increased from 25 to 75
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
    
    // If AI mode and it's player 2's turn, trigger AI
    if (this.isAIMode && this.currentPlayer === 2) {
      this.aiThinkingDelay = 60; // 1 second delay before AI starts
    }
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
    const p1Percent = player1Health / 1200;
    this.player1HealthBarFill.clear();
    this.player1HealthBarFill.rect(0, 0, 200 * p1Percent, 20);
    this.player1HealthBarFill.fill({ color: 0x4CAF50, alpha: 0.9 });
    this.player1HealthText.text = `${player1Health}/1200`;
    
    // Player 2 health bar
    const p2Percent = player2Health / 1200;
    this.player2HealthBarFill.clear();
    this.player2HealthBarFill.rect(0, 0, 200 * p2Percent, 20);
    this.player2HealthBarFill.fill({ color: 0x2196F3, alpha: 0.9 });
    this.player2HealthText.text = `${player2Health}/1200`;
    
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

  // AI Turn Execution
  private executeAITurn() {
    if (this.currentPlayer !== 2 || !this.isAIMode || this.gameOver) return;
    
    console.log("AI is thinking...");
    
    // AI Strategy:
    // 1. Build economy early (mines/solar panels)
    // 2. Build defenses near base
    // 3. Attack enemy base with turrets
    
    const myOre = this.playerOre[2];
    const myEnergy = this.playerEnergy[2];
    const myBase = this.player2Base;
    const enemyBase = this.player1Base;
    
    if (!myBase || !enemyBase) {
      this.endTurn();
      return;
    }
    
    // Priority 1: Build economy if we have few mines/solar panels
    if (this.playerMineCount[2] < 2 && myOre >= 100) {
      const built = this.aiBuildNearBase(myBase, 'mine');
      if (built) {
        console.log("AI built a mine");
        this.aiThinkingDelay = 30; // Small delay before next action
        return;
      }
    }
    
    if (this.playerSolarCount[2] < 1 && myOre >= 75) {
      const built = this.aiBuildNearBase(myBase, 'solar');
      if (built) {
        console.log("AI built a solar panel");
        this.aiThinkingDelay = 30;
        return;
      }
    }
    
    // Priority 2: Build shield if we don't have one
    const hasShield = this.aiHasBuildingType('shield');
    if (!hasShield && myOre >= 300) {
      const built = this.aiBuildNearBase(myBase, 'shield');
      if (built) {
        console.log("AI built a shield");
        this.aiThinkingDelay = 30;
        return;
      }
    }
    
    // Priority 3: Attack with turrets (lower requirements)
    if (myOre >= 100 && myEnergy >= 20) {
      const turretBuilt = this.aiBuildOffensiveStructure(myBase);
      if (turretBuilt) {
        console.log("AI built an offensive turret");
        this.aiThinkingDelay = 30;
        return;
      }
    }
    
    // Priority 4: Fire existing turrets at enemy base (use ~40% of available ammo)
    // Only fire if we have enough energy
    if (myEnergy >= 25) {
      const shotsFired = this.aiFireTurrets(enemyBase);
      if (shotsFired > 0) {
        console.log(`AI fired ${shotsFired} shots`);
        // Continue turn after firing to potentially do other actions
      }
    }
    
    // No actions left, end turn
    console.log("AI ending turn");
    this.endTurn();
  }
  
  private aiHasBuildingType(type: string): boolean {
    for (let y = 0; y < this.GRID_HEIGHT; y++) {
      for (let x = 0; x < this.GRID_WIDTH; x++) {
        const cell = this.grid[y][x];
        if (cell.sprite && cell.sprite.owner === 2) {
          if (type === 'shield' && cell.sprite.name === 'Dome Shield') return true;
          if (type === 'mine' && cell.sprite.name === 'Mine') return true;
          if (type === 'solar' && cell.sprite.name === 'Solar Panel') return true;
        }
      }
    }
    return false;
  }
  
  private aiBuildNearBase(base: PlanetSprite, buildingType: string): boolean {
    const baseX = base.centerX!;
    const baseY = base.centerY!;
    
    // Try to find a spot near base but outside shield radius
    const searchRadius = 40;
    const minDist = this.shieldRadius + 5;
    
    for (let attempts = 0; attempts < 50; attempts++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = minDist + Math.random() * (searchRadius - minDist);
      const x = Math.floor(baseX + Math.cos(angle) * dist);
      const y = Math.floor(baseY + Math.sin(angle) * dist);
      
      if (x < 0 || x >= this.GRID_WIDTH || y < 0 || y >= this.GRID_HEIGHT) continue;
      
      let texture = null;
      let cost = 0;
      let spriteKind: any = '';
      let scaleTiles = TURRET_TILES; // Default to 4 tiles
      
      if (buildingType === 'mine') {
        texture = this.mineTexture;
        cost = 100;
        spriteKind = 'mine';
        scaleTiles = TURRET_TILES; // 4 tiles for mine
      } else if (buildingType === 'solar') {
        texture = this.solarPanelTexture;
        cost = 75;
        spriteKind = 'solarPanel';
        scaleTiles = TURRET_TILES; // 4 tiles for solar panel
      } else if (buildingType === 'shield') {
        texture = this.domeShieldTexture;
        cost = 75; // Match player cost
        spriteKind = 'domeShield';
        scaleTiles = 10; // 10 tiles for dome shield (matches player)
      }
      
      if (!texture) continue;
      
      const sprite = createSprite(spriteKind, {
        texture: texture,
        centerX: x,
        centerY: y
      });
      
      sprite.owner = 2;
      
      // Calculate rotation for dome shield to be tangential
      let rotation = 0;
      if (buildingType === 'shield' && this.player2Base) {
        const planetPos = this.player2Base.getDisplay().position;
        const worldPos = this.gridToWorld(x, y);
        const dx = worldPos.x - planetPos.x;
        const dy = worldPos.y - planetPos.y;
        const angleToCenter = Math.atan2(dy, dx);
        rotation = angleToCenter + Math.PI / 2; // Tangential rotation
        sprite.rotation = rotation;
      }
      
      // Apply proper scaling based on building type
      const spriteScale = ((this.TILE_SIZE * scaleTiles) / Math.max(texture.width, texture.height));
      const spriteDisplay = sprite.getDisplay() as Sprite;
      spriteDisplay.scale.set(spriteScale);
      if (buildingType === 'shield') {
        spriteDisplay.rotation = rotation;
      }
      
      const canPlace = this.canPlaceInRadius(x, y, sprite.radius, sprite.shape, sprite.width, sprite.height, rotation);
      
      // Check if within AI's shield (player 2's shield)
      const withinShield = buildingType === 'shield' || this.isPositionWithinShield(x, y, 2);
      
      if (canPlace && withinShield && this.playerOre[2] >= cost) {
        const placed = this.placeSprite(x, y, sprite, rotation);
        if (placed) {
          this.playerOre[2] -= cost;
          
          // Update counters
          if (buildingType === 'mine') {
            this.playerMineCount[2]++;
            console.log(`AI mine count: ${this.playerMineCount[2]}`);
          } else if (buildingType === 'solar') {
            this.playerSolarCount[2]++;
            this.playerMaxEnergy[2] += 50;
            console.log(`AI solar count: ${this.playerSolarCount[2]}, max energy: ${this.playerMaxEnergy[2]}`);
          }
          
          this.soundManager.play('placeBuilding');
          this.updateGameInfo();
          return true;
        }
      }
    }
    return false;
  }
  
  private aiBuildOffensiveStructure(myBase: PlanetSprite): boolean {
    const myX = myBase.centerX!;
    const myY = myBase.centerY!;
    
    console.log(`AI attempting to build turret. Ore: ${this.playerOre[2]}, Energy: ${this.playerEnergy[2]}`);
    
    // Try to place turret within shield radius (around our base)
    for (let attempts = 0; attempts < 50; attempts++) {
      // Place near our base but within shield
      const angle = Math.random() * Math.PI * 2;
      const dist = this.shieldRadius * 0.5 + Math.random() * this.shieldRadius * 0.4; // 50-90% of shield radius
      const x = Math.floor(myX + Math.cos(angle) * dist);
      const y = Math.floor(myY + Math.sin(angle) * dist);
      
      if (x < 0 || x >= this.GRID_WIDTH || y < 0 || y >= this.GRID_HEIGHT) continue;
      
      // Check if within shield
      const dx = x - myX;
      const dy = y - myY;
      const distFromBase = Math.sqrt(dx * dx + dy * dy);
      if (distFromBase > this.shieldRadius) {
        continue;
      }
      
      // Random choice between regular turret and laser turret
      const useLaser = Math.random() > 0.5;
      const texture = this.turretTexture;
      const spriteKind = useLaser ? 'laserTurret' : 'turret';
      const cost = useLaser ? 100 : 150;
      const energyCost = 20;
      
      if (!texture) continue;
      
      const sprite = createSprite(spriteKind, {
        texture: texture,
        name: useLaser ? "Laser Turret" : "Turret"
      });
      
      sprite.owner = 2;
      
      // Apply proper scaling and flipping like player does
      const spriteScale = ((this.TILE_SIZE * TURRET_TILES) / Math.max(texture.width, texture.height));
      const spriteDisplay = sprite.getDisplay() as Sprite;
      spriteDisplay.scale.set(spriteScale);
      
      // Flip turret if on right half of screen (same as player logic)
      if (x > this.GRID_WIDTH / 2) {
        spriteDisplay.scale.x = -spriteScale;
      }
      
      const canPlace = this.canPlaceInRadius(x, y, sprite.radius, sprite.shape, sprite.width, sprite.height, sprite.rotation);
      
      if (canPlace && this.playerOre[2] >= cost && this.playerEnergy[2] >= energyCost) {
        const placed = this.placeSprite(x, y, sprite);
        if (placed) {
          this.playerOre[2] -= cost;
          this.playerEnergy[2] -= energyCost;
          this.soundManager.play('placeBuilding');
          console.log(`AI successfully placed ${useLaser ? 'laser turret' : 'turret'} at (${x}, ${y})`);
          this.updateGameInfo();
          return true;
        }
      }
    }
    
    console.log("AI failed to place turret after 50 attempts");
    return false;
  }
  
  private aiFireTurrets(enemyBase: PlanetSprite): number {
    const enemyX = enemyBase.centerX!;
    const enemyY = enemyBase.centerY!;
    const enemyWorld = this.gridToWorld(enemyX, enemyY);
    
    // Find AI's own base to avoid shooting it
    let myBase: PlanetSprite | null = null;
    for (let y = 0; y < this.GRID_HEIGHT; y++) {
      for (let x = 0; x < this.GRID_WIDTH; x++) {
        const cell = this.grid[y][x];
        if (cell.sprite && cell.sprite.owner === 2 && cell.sprite.name === 'Base Planet') {
          myBase = cell.sprite as PlanetSprite;
          break;
        }
      }
      if (myBase) break;
    }
    
    const myBaseWorld = myBase ? this.gridToWorld(myBase.centerX!, myBase.centerY!) : null;
    
    // Find all AI turrets with ammo
    const turrets: any[] = [];
    let totalAmmo = 0;
    for (let y = 0; y < this.GRID_HEIGHT; y++) {
      for (let x = 0; x < this.GRID_WIDTH; x++) {
        const cell = this.grid[y][x];
        if (cell.sprite && cell.sprite.owner === 2) {
          const sprite = cell.sprite as any;
          if ((sprite.name === 'Turret' || sprite.name === 'Laser Turret') && sprite.ammo > 0) {
            turrets.push({ sprite, x: cell.centerX!, y: cell.centerY! });
            totalAmmo += sprite.ammo;
          }
        }
      }
    }
    
    console.log(`AI found ${turrets.length} turrets with ${totalAmmo} total ammo`);
    
    if (turrets.length === 0 || totalAmmo === 0) return 0;
    
    // Calculate 40% of total ammo, minimum 1, maximum available energy allows
    const shotsToFire = Math.max(1, Math.floor(totalAmmo * 0.4));
    const maxShotsFromEnergy = Math.floor(this.playerEnergy[2] / 25); // Assume average 25 energy per shot
    const actualShots = Math.min(shotsToFire, maxShotsFromEnergy, totalAmmo);
    
    console.log(`AI planning to fire ${actualShots} shots (40% of ${totalAmmo} ammo, energy allows ${maxShotsFromEnergy})`);
    
    let shotsFired = 0;
    
    // Fire multiple shots
    for (let i = 0; i < actualShots; i++) {
      // Find turrets that still have ammo
      const availableTurrets = turrets.filter(t => t.sprite.ammo > 0);
      if (availableTurrets.length === 0) break;
      
      // Randomly select a turret
      const turretData = availableTurrets[Math.floor(Math.random() * availableTurrets.length)];
      const turretWorld = this.gridToWorld(turretData.x, turretData.y);
    
    // Try different velocities to find one that hits close to target
    let bestVx = 0;
    let bestVy = 0;
    let bestDistance = Infinity;
    
    // Test multiple angles and speeds
    for (let speedMult = 2; speedMult <= 6; speedMult += 0.5) {
      for (let angleDeg = -180; angleDeg <= 180; angleDeg += 10) {
        const angle = (angleDeg * Math.PI) / 180;
        const testVx = Math.cos(angle) * speedMult;
        const testVy = Math.sin(angle) * speedMult;
        
        // Simulate this trajectory
        const result = this.simulateTrajectoryWithCollision(
          turretWorld.x, turretWorld.y, 
          testVx, testVy, 
          enemyWorld.x, enemyWorld.y,
          myBaseWorld
        );
        
        // Skip if trajectory would hit our own base
        if (result.hitsOwnBase) continue;
        
        const endDist = result.closestDistToTarget;
        
        if (endDist < bestDistance) {
          bestDistance = endDist;
          bestVx = testVx;
          bestVy = testVy;
        }
      }
    }
    
    // Skip this shot if no safe trajectory found
    if (bestDistance === Infinity) {
      console.log("AI skipped shot - all trajectories would hit own base");
      continue;
    }
    
    // Add slight inaccuracy to make it more realistic
    const inaccuracy = 0.15;
    const vx = bestVx + (Math.random() - 0.5) * inaccuracy * 2;
    const vy = bestVy + (Math.random() - 0.5) * inaccuracy * 2;
    
    // Fire the turret using EXACT SAME LOGIC AS PLAYER
    const turret = turretData.sprite;
    const isLaserTurret = turret.name === 'Laser Turret';
    const projectileTexture = isLaserTurret ? this.laserTexture : this.missileTexture;
    const soundEffect = isLaserTurret ? 'laser' : 'missileFire';
    
    if (!projectileTexture) continue;
    
    // Create projectile exactly like player does
    const projectile = createSprite("bunny", {
      texture: projectileTexture,
      name: "Projectile",
    });
    
    // Scale the projectile (same as player)
    const BUNNY_TILES = 1;
    const projectileScale = ((this.TILE_SIZE * BUNNY_TILES) / Math.max(projectileTexture.width, projectileTexture.height));
    (projectile.getDisplay() as Sprite).scale.set(projectileScale);
    
    // Position at turret location
    const turretPos = turret.getDisplay().position;
    projectile.getDisplay().position.set(turretPos.x, turretPos.y);
    
    // Set velocity from AI calculation
    projectile.vx = vx;
    projectile.vy = vy;
    
    // Store reference to firing turret and damage (same as player)
    (projectile as any).firingTurret = turret;
    (projectile as any).damage = turret.damage || 50;
    (projectile as any).isLaser = isLaserTurret;
    
    // Add to world and projectiles array (same as player)
    this.world.addChild(projectile.getDisplay());
    this.projectiles.push(projectile);
    
    // Create particle trail for this projectile (same as player)
    this.particleTrails.set(projectile, []);
    
    // Decrement turret ammo (same as player)
    if (turret.ammo !== undefined) {
      turret.ammo--;
    }
    
    // Deduct energy cost (same as player)
    const energyCost = isLaserTurret ? 25 : 50;
    this.playerEnergy[2] -= energyCost;
    
    this.soundManager.play(soundEffect);
    shotsFired++;
    }
    
    this.updateGameInfo();
    console.log(`AI fired ${shotsFired} shots total`);
    
    return shotsFired;
  }
  
  // Simulate projectile trajectory and return closest distance to target
  private simulateTrajectoryWithCollision(
    startX: number, startY: number, 
    vx: number, vy: number, 
    targetX: number, targetY: number,
    ownBaseWorld: { x: number, y: number } | null
  ): { closestDistToTarget: number, hitsOwnBase: boolean } {
    let posX = startX;
    let posY = startY;
    let velX = vx;
    let velY = vy;
    let closestDist = Infinity;
    let hitsOwnBase = false;
    
    const maxSteps = 300;
    const deltaTime = 1.0;
    const MAX_VELOCITY = 8;
    const BASE_COLLISION_RADIUS = 80; // Approximate collision radius for base planet
    
    for (let i = 0; i < maxSteps; i++) {
      // Get grid position
      const gridX = Math.floor(posX / this.TILE_SIZE);
      const gridY = Math.floor(posY / this.TILE_SIZE);
      
      // Check if projectile would hit our own base
      if (ownBaseWorld) {
        const dx = posX - ownBaseWorld.x;
        const dy = posY - ownBaseWorld.y;
        const distToOwnBase = Math.sqrt(dx * dx + dy * dy);
        if (distToOwnBase < BASE_COLLISION_RADIUS) {
          hitsOwnBase = true;
          break;
        }
      }
      
      // Check distance to target
      const dx = posX - targetX;
      const dy = posY - targetY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
      }
      
      // Get gravity at this position
      let ax = 0;
      let ay = 0;
      if (gridX >= 0 && gridX < this.GRID_WIDTH && gridY >= 0 && gridY < this.GRID_HEIGHT) {
        ax = this.grid[gridY][gridX].gravity.ax;
        ay = this.grid[gridY][gridX].gravity.ay;
      }
      
      // Apply gravity
      velX += ax * deltaTime;
      velY += ay * deltaTime;
      
      // Clamp velocity
      const speed = Math.sqrt(velX * velX + velY * velY);
      if (speed > MAX_VELOCITY) {
        velX = (velX / speed) * MAX_VELOCITY;
        velY = (velY / speed) * MAX_VELOCITY;
      }
      
      // Update position
      posX += velX * deltaTime;
      posY += velY * deltaTime;
      
      // Stop if out of bounds
      if (posX < 0 || posX > this.GRID_WIDTH * this.TILE_SIZE || 
          posY < 0 || posY > this.GRID_HEIGHT * this.TILE_SIZE) {
        break;
      }
      
      // If we got very close to target, we can stop early
      if (dist < 50) {
        break;
      }
    }
    
    return { closestDistToTarget: closestDist, hitsOwnBase };
  }

  // Draw trajectory for gun firing (ignoring launch planet gravity)
}
