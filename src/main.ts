import { Application, Assets, Sprite, Graphics, Container } from "pixi.js";

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
  
  // Calculate grid dimensions based on screen size
  // Add extra buffer for panning beyond screen edges
  const BUFFER_MULTIPLIER = 2;
  const GRID_WIDTH = Math.ceil((app.screen.width * BUFFER_MULTIPLIER) / TILE_SIZE);
  const GRID_HEIGHT = Math.ceil((app.screen.height * BUFFER_MULTIPLIER) / TILE_SIZE);

  type GridCell = null | {type: string; sprite: Sprite};
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
  const bunny = new Sprite(texture);
  bunny.anchor.set(0.5);
  
  // Position bunny in center of grid
  const centerGridX = Math.floor(GRID_WIDTH / 2);
  const centerGridY = Math.floor(GRID_HEIGHT / 2);
  bunny.position.set(
    centerGridX * TILE_SIZE + TILE_SIZE / 2,
    centerGridY * TILE_SIZE + TILE_SIZE / 2
  );
  
  world.addChild(bunny);

  // Draw grid lines for visualization
  const gridGraphics = new Graphics();
  
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
  
  gridGraphics.stroke({ width: 1, color: 0x333333, alpha: 0.5 });
  world.addChild(gridGraphics);
  console.log("Grid lines added to world");

  //Zoom functionality
  let zoom = 1;
  let targetZoom = 1;
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 3;
  const ZOOM_SPEED = 0.1;

  window.addEventListener("wheel", (event) => {
    event.preventDefault();
    targetZoom += -event.deltaY * 0.001;
    targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom));
  }, {passive: false});

  //Panning functionality
  let isDragging = false;
  let dragStart = {x: 0, y: 0};

  app.canvas.addEventListener("mousedown", (e) => {
    isDragging = true;
    dragStart.x = e.clientX - world.x;
    dragStart.y = e.clientY - world.y;
  });

  app.canvas.addEventListener("mouseup", () => (isDragging = false));
  app.canvas.addEventListener("mousemove", (e) => {
    if (isDragging) {
      world.x = e.clientX - dragStart.x;
      world.y = e.clientY - dragStart.y;
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

  //Function to see what grid square is clicked
  app.canvas.addEventListener("click", (e) => {
    const { gridX, gridY } = screenToGrid(e.clientX, e.clientY);
    console.log("Clicked grid cell:", gridX, gridY);
    
    // Check if click is within grid bounds
    if (gridX >= 0 && gridX < GRID_WIDTH && gridY >= 0 && gridY < GRID_HEIGHT) {
      console.log("Valid grid cell");
    }
  });

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

    //Rotate bunny
    bunny.rotation += 0.1 * time.deltaTime;

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
    // Keep bunny at same grid position, just recenter view
    world.x = app.screen.width / 2 - bunny.x * zoom;
    world.y = app.screen.height / 2 - bunny.y * zoom;
  });

  // Center the world view on the bunny at startup
  world.x = app.screen.width / 2 - bunny.x * zoom;
  world.y = app.screen.height / 2 - bunny.y * zoom;
})();