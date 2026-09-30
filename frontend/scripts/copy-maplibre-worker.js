// MapLibre GL 6 runs its tile worker as an ES module that bundlers (Turbopack/webpack)
// don't emit on their own. Serve it from /public so the map can set `workerUrl`.
// Runs on postinstall so the copied files always match the installed version.
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "node_modules", "maplibre-gl", "dist");
const dest = path.join(__dirname, "..", "public", "maplibre");
fs.mkdirSync(dest, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  fs.copyFileSync(path.join(src, file), path.join(dest, file));
}
