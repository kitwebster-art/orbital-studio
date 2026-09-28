import "./styles.css";
import { LevitationApp } from "./app/LevitationApp";

function webgl2Available(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return canvas.getContext("webgl2") !== null;
  } catch {
    return false;
  }
}

const host = document.getElementById("lab");
if (!host) {
  throw new Error("Levitation Lab host element #lab is missing");
}

if (!webgl2Available()) {
  host.setAttribute("aria-busy", "false");
  host.innerHTML =
    '<p class="lab-fallback">Levitation Lab needs WebGL2. Try a current version of Chrome, Safari, Edge or Firefox with hardware acceleration switched on.</p>';
} else {
  const app = new LevitationApp(host);
  app.start();
}
