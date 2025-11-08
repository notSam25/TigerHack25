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
    const radius = Math.random() * 2 + 0.5; // small dot
    g.beginFill(0xffffff);
    g.drawCircle(0, 0, radius);
    g.endFill();
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

  const GRID_WIDTH = 100;
  const GRID_HEIGHT = 100;
  const TILE_SIZE = 64;

  type GridCell = null | {type: string; sprite: Sprite};
  const grid: GridCell[][] = [];

  for (let y = 0; y < GRID_HEIGHT; y++) {
  grid[y] = [];
  for (let x = 0; x < GRID_WIDTH; x++) {
    grid[y][x] = null; // empty at start
  }
}

// Load the bunny texture
  const texture = await Assets.load("/assets/bunny.png");
  const bunny = new Sprite(texture);
  bunny.anchor.set(0.5);
  bunny.position.set(app.screen.width / 2, app.screen.height / 2);
  world.addChild(bunny);

  //Zoom functionality
  let zoom = 1;
  let targetZoom = 1;
  const MIN_ZOOM= 0.2;
  const MAX_ZOOM = 3;
  const ZOOM_SPEED = 0.1;

  window.addEventListener("wheel", (event) => {
    event.preventDefault();

    //Update Zoom
    targetZoom += -event.deltaY * 0.001;
    targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom));
  }, {passive: false});

  //Panning functionality
  let isDragging = false;
  let dragStart = {x: 0, y: 0};

  app.view.addEventListener("mousedown", (e) => {
    isDragging = true;
    dragStart.x = e.clientX - world.x;
    dragStart.y = e.clientY - world.y;
  });

  app.view.addEventListener("mouseup", () => (isDragging = false));
  app.view.addEventListener("mousemove", (e) => {
    if (isDragging) {
      world.x = e.clientX - dragStart.x;
      world.y = e.clientY - dragStart.y;
    }
  });

  //Screen to gird coordinate conversion
  function screenToGrid(screenX: number, screenY: number) {
    const local = world.toLocal({ x: screenX, y: screenY });
    const gridX = Math.floor(local.x / TILE_SIZE);
    const gridY = Math.floor(local.y / TILE_SIZE);
    return { gridX, gridY };
  }

  //Function to see what grid square is clicked
  app.view.addEventListener("click", (e) => {
  const { gridX, gridY } = screenToGrid(e.clientX, e.clientY);
  console.log("Clicked grid cell:", gridX, gridY);
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
  bunny.position.set(app.screen.width / 2, app.screen.height / 2);
  });
})();
