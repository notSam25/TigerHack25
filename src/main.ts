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
  const turretTexture = await Assets.load("/assets/turret.png");
  const shieldTexture = await Assets.load("/assets/shield.png");
  const blackHoleTexture = await Assets.load("/assets/black hole.png");
  const explosionTexture = await Assets.load("/assets/explosion.png");

  // Create game engine
  const engine = new Engine(app);

  // Generate world (asteroids, black holes, and planets with shields)
  engine.generateWorld(asteroidTexture, planetTexture, shieldTexture, blackHoleTexture);

  // Initialize UI
  engine.initToolbar(bunnyTexture, turretTexture);
  engine.initTooltip();
  engine.setExplosionTexture(explosionTexture);

  // Start the game loop and event handlers
  engine.start();

  console.log("Game initialized!");
})();
