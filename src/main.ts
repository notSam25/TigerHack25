import { Application, Assets } from "pixi.js";
import { Engine } from "./engine";

(async () => {
  // Create PixiJS application
  const app = new Application();
  await app.init({
    width: window.innerWidth,
    height: window.innerHeight,
    background: "#000000ff",
  });
  document.getElementById("pixi-container")!.appendChild(app.canvas);

  // Load textures
  const asteroidTexture = await Assets.load("/assets/asteroid.png");
  const planetTexture = await Assets.load("/assets/planet.jpg");
  const bunnyTexture = await Assets.load("/assets/bunny.png");

  // Create game engine
  const engine = new Engine(app);

  // Generate world (asteroids and planets)
  engine.generateWorld(asteroidTexture, planetTexture);

  // Initialize UI
  engine.initToolbar(bunnyTexture);
  engine.initTooltip();

  // Start the game loop and event handlers
  engine.start();

  console.log("Game initialized!");
})();
