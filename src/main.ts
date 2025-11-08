import { Application, Assets, Sprite, Graphics, Container, Text } from "pixi.js";

(async () => {
  // Create a new application
  const app = new Application();

  // Initialize the application
  await app.init({width: window.innerWidth, height: window.innerHeight, background: "#000000ff"});

  // Append the application canvas to the document body
  document.getElementById("pixi-container")!.appendChild(app.canvas);

  //Create moving stars for our background
  type Star = { graphics: Graphics; speed: number; alphaDir: number };
  const starArray: Star[] = [];
  const numStars = 200;

  for (let i = 0; i < numStars; i++) {
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

    starArray.push({
      graphics: g,
      speed: Math.random() * 0.2 + 0.05,
      alphaDir: Math.random() < 0.5 ? 0.01 : -0.01,
    });
  }

  //Create world container for grid map
  const world = new Container();
  app.stage.addChild(world);

  const TILE_SIZE = 64;
  
  // Zoom settings - grid will be sized for max zoom out
  const MIN_ZOOM = 0.2; // Max zoom out - shows entire grid
  const MAX_ZOOM = 2;   // Max zoom in
  const ZOOM_SPEED = 0.1;
  
  // Calculate grid dimensions based on max zoom out
  // Grid should fit the screen at MIN_ZOOM
  const GRID_WIDTH = Math.ceil((app.screen.width / MIN_ZOOM) / TILE_SIZE);
  const GRID_HEIGHT = Math.ceil((app.screen.height / MIN_ZOOM) / TILE_SIZE);
  
  console.log(`Grid size: ${GRID_WIDTH} x ${GRID_HEIGHT} tiles (${GRID_WIDTH * TILE_SIZE} x ${GRID_HEIGHT * TILE_SIZE} pixels)`);

  type GridCell = null | {type: string; sprite: Sprite; radius: number; centerX: number; centerY: number};
  const grid: GridCell[][] = [];

  // Initialize grid
  for (let y = 0; y < GRID_HEIGHT; y++) {
    grid[y] = [];
    for (let x = 0; x < GRID_WIDTH; x++) {
      grid[y][x] = null;
    }
  }

  // Load the bunny texture
  const texture = await Assets.load("/assets/bunny.png");
  const planetTexture = await Assets.load("/assets/planet.jpg");
  const asteroidTexture = await Assets.load("/assets/asteroid.png");
  
  // Log image dimensions for analysis
  console.log("Image dimensions:");
  console.log("Bunny:", texture.width, "x", texture.height);
  console.log("Planet:", planetTexture.width, "x", planetTexture.height);
  console.log("Asteroid:", asteroidTexture.width, "x", asteroidTexture.height);
  console.log("Current TILE_SIZE:", TILE_SIZE);
  
  // Calculate optimal scales based on image size and desired grid coverage
  // Bunny: 26x37 -> scale to fit 1 tile (64px)
  const bunnyScale = (TILE_SIZE * 0.8) / Math.max(texture.width, texture.height); // ~1.4
  
  // Asteroid: 360x360 -> should cover ~3 tiles diameter (192px) for radius 1
  const asteroidTargetSize = TILE_SIZE * 3; // 192px
  const asteroidScale = asteroidTargetSize / asteroidTexture.width; // ~0.53
  
  // Planet: 640x640 -> should cover ~5 tiles diameter (320px) for radius 2
  const planetTargetSize = TILE_SIZE * 5; // 320px
  const planetScale = planetTargetSize / planetTexture.width; // ~0.5
  
  console.log("Calculated scales:");
  console.log("Bunny scale:", bunnyScale.toFixed(2));
  console.log("Asteroid scale:", asteroidScale.toFixed(2));
  console.log("Planet scale:", planetScale.toFixed(2));
  
  // Generate random asteroids across the grid
  function generateAsteroids(count: number) {
    let placed = 0;
    let attempts = 0;
    const maxAttempts = count * 10; // Prevent infinite loop
    
    while (placed < count && attempts < maxAttempts) {
      attempts++;
      
      // Random position in grid
      const x = Math.floor(Math.random() * GRID_WIDTH);
      const y = Math.floor(Math.random() * GRID_HEIGHT);
      
      // Try to place asteroid
      if (canPlaceInRadius(x, y, 1)) {
        const asteroid = new Sprite(asteroidTexture);
        asteroid.anchor.set(0.5);
        asteroid.scale.set(asteroidScale);
        placeSprite(x, y, asteroid, "asteroid", 1);
        placed++;
      }
    }
    
    console.log(`Placed ${placed} asteroids (${attempts} attempts)`);
  }
  
  // Generate two base planets for players
  function generateBasePlanets() {
    // Increase planet radius for bases to make them larger
    const basePlanetRadius = 3; // Larger than normal planets
    const basePlanetScale = (TILE_SIZE * 7) / planetTexture.width; // Cover 7 tiles diameter
    
    // Place first planet in left third of grid
    let planet1Placed = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const x = Math.floor(Math.random() * (GRID_WIDTH / 3));
      const y = Math.floor(Math.random() * GRID_HEIGHT);
      
      if (canPlaceInRadius(x, y, basePlanetRadius)) {
        const planet1 = new Sprite(planetTexture);
        planet1.anchor.set(0.5);
        planet1.scale.set(basePlanetScale);
        placeSprite(x, y, planet1, "base_planet_1", basePlanetRadius);
        console.log(`Placed Base Planet 1 at (${x}, ${y})`);
        planet1Placed = true;
        break;
      }
    }
    
    // Place second planet in right third of grid
    let planet2Placed = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const x = Math.floor((GRID_WIDTH * 2/3) + Math.random() * (GRID_WIDTH / 3));
      const y = Math.floor(Math.random() * GRID_HEIGHT);
      
      if (canPlaceInRadius(x, y, basePlanetRadius)) {
        const planet2 = new Sprite(planetTexture);
        planet2.anchor.set(0.5);
        planet2.scale.set(basePlanetScale);
        placeSprite(x, y, planet2, "base_planet_2", basePlanetRadius);
        console.log(`Placed Base Planet 2 at (${x}, ${y})`);
        planet2Placed = true;
        break;
      }
    }
    
    if (!planet1Placed || !planet2Placed) {
      console.warn("Failed to place both base planets!");
    }
  }
  
  // Helper function to get all cells within radius
  function getCellsInRadius(centerX: number, centerY: number, radius: number): {x: number; y: number}[] {
    const cells: {x: number; y: number}[] = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        // Use circular distance check
        if (dx * dx + dy * dy <= radius * radius) {
          cells.push({ x: centerX + dx, y: centerY + dy });
        }
      }
    }
    return cells;
  }

  // Function to check if all cells in radius are available
  function canPlaceInRadius(centerX: number, centerY: number, radius: number): boolean {
    const cells = getCellsInRadius(centerX, centerY, radius);
    for (const cell of cells) {
      if (cell.x < 0 || cell.x >= GRID_WIDTH || cell.y < 0 || cell.y >= GRID_HEIGHT) {
        return false;
      }
      if (grid[cell.y][cell.x] !== null) {
        return false;
      }
    }
    return true;
  }

  // Function to place sprite in grid with radius
  function placeSprite(gridX: number, gridY: number, sprite: Sprite, type: string, radius: number = 0): boolean {
    // Check if position is valid and all cells in radius are empty
    if (!canPlaceInRadius(gridX, gridY, radius)) {
      console.log("Position out of bounds or cells occupied");
      return false;
    }
    
    // Create cell data
    const cellData = { type, sprite, radius, centerX: gridX, centerY: gridY };
    
    // Occupy all cells in radius
    const cells = getCellsInRadius(gridX, gridY, radius);
    for (const cell of cells) {
      grid[cell.y][cell.x] = cellData;
    }
    
    // Position sprite at center
    const worldPos = gridToWorld(gridX, gridY);
    sprite.position.set(worldPos.x, worldPos.y);
    world.addChild(sprite);
    
    return true;
  }

  // Function to move sprite from one grid cell to another
  function moveSprite(fromX: number, fromY: number, toX: number, toY: number): boolean {
    // Validate bounds
    if (fromX < 0 || fromX >= GRID_WIDTH || fromY < 0 || fromY >= GRID_HEIGHT ||
        toX < 0 || toX >= GRID_WIDTH || toY < 0 || toY >= GRID_HEIGHT) {
      return false;
    }
    
    const fromCell = grid[fromY][fromX];
    if (fromCell === null) {
      console.log("No sprite at source position");
      return false;
    }
    
    const radius = fromCell.radius;
    const sprite = fromCell.sprite;
    
    // Clear old cells first (so we don't conflict with ourselves)
    const oldCells = getCellsInRadius(fromX, fromY, radius);
    for (const cell of oldCells) {
      if (cell.x >= 0 && cell.x < GRID_WIDTH && cell.y >= 0 && cell.y < GRID_HEIGHT) {
        grid[cell.y][cell.x] = null;
      }
    }
    
    // Now check if destination is available
    if (!canPlaceInRadius(toX, toY, radius)) {
      console.log("Destination cells occupied or out of bounds");
      // Restore old cells since we can't move
      const cellData = { 
        type: fromCell.type, 
        sprite: sprite, 
        radius: radius,
        centerX: fromX,
        centerY: fromY
      };
      for (const cell of oldCells) {
        if (cell.x >= 0 && cell.x < GRID_WIDTH && cell.y >= 0 && cell.y < GRID_HEIGHT) {
          grid[cell.y][cell.x] = cellData;
        }
      }
      return false;
    }
    
    // Update cell data with new center
    const cellData = { 
      type: fromCell.type, 
      sprite: sprite, 
      radius: radius,
      centerX: toX,
      centerY: toY
    };
    
    // Occupy new cells
    const newCells = getCellsInRadius(toX, toY, radius);
    for (const cell of newCells) {
      if (cell.x >= 0 && cell.x < GRID_WIDTH && cell.y >= 0 && cell.y < GRID_HEIGHT) {
        grid[cell.y][cell.x] = cellData;
      }
    }
    
    const worldPos = gridToWorld(toX, toY);
    sprite.position.set(worldPos.x, worldPos.y);
    
    return true;
  }

  // Function to remove sprite from grid
  function removeSprite(gridX: number, gridY: number): boolean {
    if (gridX < 0 || gridX >= GRID_WIDTH || gridY < 0 || gridY >= GRID_HEIGHT) {
      return false;
    }
    
    const cell = grid[gridY][gridX];
    if (cell === null) {
      return false;
    }
    
    // Remove sprite from world
    world.removeChild(cell.sprite);
    
    // Clear all cells in radius
    const cells = getCellsInRadius(cell.centerX, cell.centerY, cell.radius);
    for (const cellPos of cells) {
      grid[cellPos.y][cellPos.x] = null;
    }
    
    return true;
  }

  // Draw grid lines for visualization
  const gridGraphics = new Graphics();
  world.addChild(gridGraphics);
  
  // Generate the world
  generateBasePlanets();
  generateAsteroids(50); // Place 50 asteroids
  
  //Zoom functionality
  let zoom = MIN_ZOOM; // Start at max zoom out to see entire grid
  let targetZoom = MIN_ZOOM;
  
  // Function to redraw grid with appropriate line width for zoom level
  function drawGrid() {
    gridGraphics.clear();
    
    // Adjust line width inversely with zoom so it stays visually consistent
    const lineWidth = 1 / zoom;
    
    // Draw vertical lines
    for (let x = 0; x <= GRID_WIDTH; x++) {
      gridGraphics.moveTo(x * TILE_SIZE, 0);
      gridGraphics.lineTo(x * TILE_SIZE, GRID_HEIGHT * TILE_SIZE);
    }
    
    // Draw horizontal lines
    for (let y = 0; y <= GRID_HEIGHT; y++) {
      gridGraphics.moveTo(0, y * TILE_SIZE);
      gridGraphics.lineTo(GRID_WIDTH * TILE_SIZE, y * TILE_SIZE);
    }
    
    gridGraphics.stroke({ width: lineWidth, color: 0x333333, alpha: 0.5 });
  }
  
  drawGrid();

  window.addEventListener("wheel", (event) => {
    event.preventDefault();
    targetZoom += -event.deltaY * 0.001;
    targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom));
  }, {passive: false});

  //Panning functionality
  let isPanning = false;
  let panStart = {x: 0, y: 0};

  // Create UI container (not affected by world zoom/pan)
  const uiContainer = new Container();
  app.stage.addChild(uiContainer);

  // Create toolbar
  const toolbar = new Container();
  toolbar.position.set(10, app.screen.height - 100);
  uiContainer.addChild(toolbar);

  // Toolbar background
  const toolbarBg = new Graphics();
  toolbarBg.rect(0, 0, 380, 90);
  toolbarBg.fill({ color: 0x222222, alpha: 0.9 });
  toolbarBg.stroke({ width: 2, color: 0x666666 });
  toolbar.addChild(toolbarBg);

  // Object type tracking
  let selectedObjectType: { texture: any; type: string; radius: number } | null = null;

  // Create bunny button in toolbar
  const toolbarBunny = new Sprite(texture);
  toolbarBunny.anchor.set(0.5);
  toolbarBunny.position.set(45, 45);
  toolbarBunny.scale.set(bunnyScale * 0.8); // Slightly smaller in toolbar
  toolbarBunny.eventMode = 'static';
  toolbarBunny.cursor = 'pointer';
  toolbar.addChild(toolbarBunny);

  // Create asteroid button (radius 1)
  const toolbarAsteroid = new Sprite(asteroidTexture);
  toolbarAsteroid.anchor.set(0.5);
  toolbarAsteroid.position.set(135, 45);
  toolbarAsteroid.scale.set(asteroidScale * 0.15); // Small preview in toolbar
  toolbarAsteroid.eventMode = 'static';
  toolbarAsteroid.cursor = 'pointer';
  toolbar.addChild(toolbarAsteroid);

  // Create planet button (radius 2)
  const toolbarPlanet = new Sprite(planetTexture);
  toolbarPlanet.anchor.set(0.5);
  toolbarPlanet.position.set(225, 45);
  toolbarPlanet.scale.set(planetScale * 0.08); // Small preview in toolbar
  toolbarPlanet.eventMode = 'static';
  toolbarPlanet.cursor = 'pointer';
  toolbar.addChild(toolbarPlanet);

  // Create trash can
  const trashCan = new Graphics();
  trashCan.rect(0, 0, 80, 80);
  trashCan.fill({ color: 0x880000, alpha: 0.8 });
  trashCan.stroke({ width: 2, color: 0xff0000 });
  trashCan.position.set(300, 5);
  toolbar.addChild(trashCan);
  
  // Trash can icon (simple X)
  const trashIcon = new Graphics();
  trashIcon.moveTo(20, 20);
  trashIcon.lineTo(60, 60);
  trashIcon.moveTo(60, 20);
  trashIcon.lineTo(20, 60);
  trashIcon.stroke({ width: 4, color: 0xffffff });
  trashIcon.position.set(300, 5);
  toolbar.addChild(trashIcon);

  // Dragging state
  let previewSprite: Sprite | null = null;
  let isDraggingFromToolbar = false;
  let isDraggingSprite = false;
  let draggedSpriteGridPos: { x: number; y: number } | null = null;
  let isOverTrash = false;

  // Highlight graphic for valid/invalid placement
  const highlightGraphic = new Graphics();
  world.addChild(highlightGraphic);

  // Mouse down on toolbar bunny - start drag
  toolbarBunny.on('pointerdown', (e) => {
    e.stopPropagation();
    isDraggingFromToolbar = true;
    selectedObjectType = { texture, type: "bunny", radius: 0 };
    
    // Create preview sprite
    previewSprite = new Sprite(texture);
    previewSprite.anchor.set(0.5);
    previewSprite.alpha = 0.7;
    previewSprite.scale.set(bunnyScale);
    world.addChild(previewSprite);
  });

  // Mouse down on toolbar asteroid - start drag
  toolbarAsteroid.on('pointerdown', (e) => {
    e.stopPropagation();
    isDraggingFromToolbar = true;
    selectedObjectType = { texture: asteroidTexture, type: "asteroid", radius: 1 };
    
    // Create preview sprite
    previewSprite = new Sprite(asteroidTexture);
    previewSprite.anchor.set(0.5);
    previewSprite.alpha = 0.7;
    previewSprite.scale.set(asteroidScale);
    world.addChild(previewSprite);
  });

  // Mouse down on toolbar planet - start drag
  toolbarPlanet.on('pointerdown', (e) => {
    e.stopPropagation();
    isDraggingFromToolbar = true;
    selectedObjectType = { texture: planetTexture, type: "planet", radius: 2 };
    
    // Create preview sprite
    previewSprite = new Sprite(planetTexture);
    previewSprite.anchor.set(0.5);
    previewSprite.alpha = 0.7;
    previewSprite.scale.set(planetScale);
    world.addChild(previewSprite);
  });

  // Global mouse handlers
  app.canvas.addEventListener("mousedown", (e) => {
    if (!isDraggingFromToolbar) {
      // Check if clicking on a sprite in the grid
      const { gridX, gridY } = screenToGrid(e.clientX, e.clientY);
      
      if (gridX >= 0 && gridX < GRID_WIDTH && gridY >= 0 && gridY < GRID_HEIGHT) {
        const cell = grid[gridY][gridX];
        if (cell !== null) {
          // Start dragging this sprite - use the CENTER position, not clicked position
          isDraggingSprite = true;
          draggedSpriteGridPos = { x: cell.centerX, y: cell.centerY };
          previewSprite = cell.sprite;
          previewSprite.alpha = 0.7;
          
          // Don't remove from grid yet, wait for drop
          console.log(`Picked up ${cell.type} from center (${cell.centerX}, ${cell.centerY})`);
          return;
        }
      }
      
      // If not clicking a sprite, start panning
      isPanning = true;
      panStart.x = e.clientX - world.x;
      panStart.y = e.clientY - world.y;
    }
  });

  app.canvas.addEventListener("mouseup", (e) => {
    if (isDraggingFromToolbar && previewSprite && selectedObjectType) {
      // Try to place the sprite
      const { gridX, gridY } = screenToGrid(e.clientX, e.clientY);
      
      if (gridX >= 0 && gridX < GRID_WIDTH && gridY >= 0 && gridY < GRID_HEIGHT) {
        if (canPlaceInRadius(gridX, gridY, selectedObjectType.radius)) {
          // Place the sprite with appropriate scale
          const newSprite = new Sprite(selectedObjectType.texture);
          newSprite.anchor.set(0.5);
          
          // Set scale based on type
          if (selectedObjectType.type === "bunny") {
            newSprite.scale.set(bunnyScale);
          } else if (selectedObjectType.type === "asteroid") {
            newSprite.scale.set(asteroidScale);
          } else if (selectedObjectType.type === "planet") {
            newSprite.scale.set(planetScale);
          }
          
          placeSprite(gridX, gridY, newSprite, selectedObjectType.type, selectedObjectType.radius);
          console.log(`Placed ${selectedObjectType.type} at grid (${gridX}, ${gridY}) with radius ${selectedObjectType.radius}`);
        } else {
          console.log("Cannot place - cells occupied or out of bounds");
        }
      }
      
      // Clean up preview
      world.removeChild(previewSprite);
      previewSprite = null;
      highlightGraphic.clear();
      selectedObjectType = null;
    } else if (isDraggingSprite && draggedSpriteGridPos && previewSprite) {
      // Check if over trash
      if (isOverTrash) {
        // Delete the sprite
        console.log(`Deleted sprite from (${draggedSpriteGridPos.x}, ${draggedSpriteGridPos.y})`);
        removeSprite(draggedSpriteGridPos.x, draggedSpriteGridPos.y);
        previewSprite = null;
      } else {
        // Try to move the sprite
        const { gridX, gridY } = screenToGrid(e.clientX, e.clientY);
        
        if (gridX >= 0 && gridX < GRID_WIDTH && gridY >= 0 && gridY < GRID_HEIGHT) {
          if (gridX === draggedSpriteGridPos.x && gridY === draggedSpriteGridPos.y) {
            // Dropped in same spot, just reset alpha
            previewSprite.alpha = 1;
          } else {
            // Try to move to new position
            const success = moveSprite(draggedSpriteGridPos.x, draggedSpriteGridPos.y, gridX, gridY);
            if (success) {
              console.log(`Moved sprite from (${draggedSpriteGridPos.x}, ${draggedSpriteGridPos.y}) to (${gridX}, ${gridY})`);
            } else {
              // Can't move there, return to original position
              console.log("Can't move there - returning to original position");
              const worldPos = gridToWorld(draggedSpriteGridPos.x, draggedSpriteGridPos.y);
              previewSprite.position.set(worldPos.x, worldPos.y);
            }
            previewSprite.alpha = 1;
          }
        } else {
          // Outside grid, return to original position
          console.log("Outside grid - returning to original position");
          const worldPos = gridToWorld(draggedSpriteGridPos.x, draggedSpriteGridPos.y);
          previewSprite.position.set(worldPos.x, worldPos.y);
          previewSprite.alpha = 1;
        }
      }
      
      highlightGraphic.clear();
      draggedSpriteGridPos = null;
      previewSprite = null;
    }
    
    isDraggingFromToolbar = false;
    isDraggingSprite = false;
    isPanning = false;
    isOverTrash = false;
  });

  // Click handler for grid info (only when not dragging)
  app.canvas.addEventListener("click", (e) => {
    if (!isDraggingFromToolbar) {
      const { gridX, gridY } = screenToGrid(e.clientX, e.clientY);
      console.log("Clicked grid cell:", gridX, gridY);
      
      // Check if click is within grid bounds
      if (gridX >= 0 && gridX < GRID_WIDTH && gridY >= 0 && gridY < GRID_HEIGHT) {
        const cell = grid[gridY][gridX];
        if (cell !== null) {
          console.log(`Cell (${gridX}, ${gridY}) contains: ${cell.type}`);
        } else {
          console.log(`Cell (${gridX}, ${gridY}) is empty`);
        }
      }
    }
  });

  app.canvas.addEventListener("mousemove", (e) => {
    if (isDraggingFromToolbar && previewSprite && selectedObjectType) {
      // Update preview position
      const { gridX, gridY } = screenToGrid(e.clientX, e.clientY);
      
      if (gridX >= 0 && gridX < GRID_WIDTH && gridY >= 0 && gridY < GRID_HEIGHT) {
        const worldPos = gridToWorld(gridX, gridY);
        previewSprite.position.set(worldPos.x, worldPos.y);
        
        // Draw highlight for all cells in radius
        highlightGraphic.clear();
        const canPlace = canPlaceInRadius(gridX, gridY, selectedObjectType.radius);
        const color = canPlace ? 0x00ff00 : 0xff0000;
        
        const cells = getCellsInRadius(gridX, gridY, selectedObjectType.radius);
        for (const cell of cells) {
          if (cell.x >= 0 && cell.x < GRID_WIDTH && cell.y >= 0 && cell.y < GRID_HEIGHT) {
            highlightGraphic.rect(
              cell.x * TILE_SIZE,
              cell.y * TILE_SIZE,
              TILE_SIZE,
              TILE_SIZE
            );
            highlightGraphic.fill({ color, alpha: 0.3 });
          }
        }
      }
    } else if (isDraggingSprite && previewSprite && draggedSpriteGridPos) {
      // Update dragged sprite position
      const { gridX, gridY } = screenToGrid(e.clientX, e.clientY);
      
      // Check if over trash can
      const trashBounds = {
        x: toolbar.x + 300,
        y: toolbar.y + 5,
        width: 80,
        height: 80
      };
      
      isOverTrash = (
        e.clientX >= trashBounds.x &&
        e.clientX <= trashBounds.x + trashBounds.width &&
        e.clientY >= trashBounds.y &&
        e.clientY <= trashBounds.y + trashBounds.height
      );
      
      if (isOverTrash) {
        // Highlight trash can
        highlightGraphic.clear();
        trashCan.clear();
        trashCan.rect(0, 0, 80, 80);
        trashCan.fill({ color: 0xff0000, alpha: 0.9 });
        trashCan.stroke({ width: 3, color: 0xffff00 });
        trashCan.position.set(300, 5);
      } else {
        // Reset trash can
        trashCan.clear();
        trashCan.rect(0, 0, 80, 80);
        trashCan.fill({ color: 0x880000, alpha: 0.8 });
        trashCan.stroke({ width: 2, color: 0xff0000 });
        trashCan.position.set(300, 5);
        
        // Show grid highlight
        if (gridX >= 0 && gridX < GRID_WIDTH && gridY >= 0 && gridY < GRID_HEIGHT) {
          const worldPos = gridToWorld(gridX, gridY);
          previewSprite.position.set(worldPos.x, worldPos.y);
          
          const cell = grid[draggedSpriteGridPos.y][draggedSpriteGridPos.x];
          if (cell) {
            const radius = cell.radius;
            highlightGraphic.clear();
            const canPlace = canPlaceInRadius(gridX, gridY, radius);
            const color = canPlace ? 0x00ff00 : 0xff0000;
            
            const cells = getCellsInRadius(gridX, gridY, radius);
            for (const cellPos of cells) {
              if (cellPos.x >= 0 && cellPos.x < GRID_WIDTH && cellPos.y >= 0 && cellPos.y < GRID_HEIGHT) {
                highlightGraphic.rect(
                  cellPos.x * TILE_SIZE,
                  cellPos.y * TILE_SIZE,
                  TILE_SIZE,
                  TILE_SIZE
                );
                highlightGraphic.fill({ color, alpha: 0.3 });
              }
            }
          }
        }
      }
    } else if (isPanning) {
      world.x = e.clientX - panStart.x;
      world.y = e.clientY - panStart.y;
    }
  });

  //Screen to grid coordinate conversion
  function screenToGrid(screenX: number, screenY: number) {
    const local = world.toLocal({ x: screenX, y: screenY });
    const gridX = Math.floor(local.x / TILE_SIZE);
    const gridY = Math.floor(local.y / TILE_SIZE);
    return { gridX, gridY };
  }

  //Grid to world coordinate conversion
  function gridToWorld(gridX: number, gridY: number) {
    return {
      x: gridX * TILE_SIZE + TILE_SIZE / 2,
      y: gridY * TILE_SIZE + TILE_SIZE / 2
    };
  }

  //Ticker
  app.ticker.add((time) => {
    // Smooth zoom
    const prevZoom = zoom;
    zoom += (targetZoom - zoom) * ZOOM_SPEED;

    const centerX = app.screen.width / 2;
    const centerY = app.screen.height / 2;

    world.x = centerX - ((centerX - world.x) * (zoom / prevZoom));
    world.y = centerY - ((centerY - world.y) * (zoom / prevZoom)); 
    world.scale.set(zoom);
    
    // Redraw grid when zoom changes
    if (prevZoom !== zoom) {
      drawGrid();
    }

    //Update the stars
    starArray.forEach((star) => {
      star.graphics.y += star.speed;
      if (star.graphics.y > app.screen.height) star.graphics.y = 0;

      //Twinkle
      star.graphics.alpha += star.alphaDir;
      if (star.graphics.alpha > 1) star.alphaDir = -star.alphaDir;
      if (star.graphics.alpha < 0.2) star.alphaDir = -star.alphaDir;
    });
  });

  //Window resize
  window.addEventListener("resize", () => {
    app.renderer.resize(window.innerWidth, window.innerHeight);
    // Update toolbar position
    toolbar.position.set(10, app.screen.height - 100);
  });

  // Center the world view on the grid center at startup
  const gridCenterX = (GRID_WIDTH * TILE_SIZE) / 2;
  const gridCenterY = (GRID_HEIGHT * TILE_SIZE) / 2;
  world.x = app.screen.width / 2 - gridCenterX * zoom;
  world.y = app.screen.height / 2 - gridCenterY * zoom;
})();