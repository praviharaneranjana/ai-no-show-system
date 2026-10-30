// `next build` with `output: "standalone"` emits .next/standalone as a
// self-contained server, but deliberately does NOT copy `public/` or
// `.next/static/` into it (see Next.js docs on `output`). Without this step
// the packaged app's server would 404 on every static asset and page.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const standaloneDir = path.join(root, ".next", "standalone");

if (!fs.existsSync(standaloneDir)) {
  console.error("`.next/standalone` not found — run `next build` first.");
  process.exit(1);
}

fs.cpSync(path.join(root, "public"), path.join(standaloneDir, "public"), { recursive: true });
fs.cpSync(path.join(root, ".next", "static"), path.join(standaloneDir, ".next", "static"), {
  recursive: true,
});

console.log("Copied public/ and .next/static/ into .next/standalone/");

// `next build` also copies the developer's local .env* files into
// .next/standalone/ so `node server.js` behaves like `next start`. That's
// fine for a normal server deployment, but fatal for the desktop app: if
// BACKEND_API_URL is set in the build machine's .env, it would get baked
// into every installer and permanently short-circuit /setup for every user.
// The desktop package must never ship with a preconfigured backend.
for (const entry of fs.readdirSync(standaloneDir)) {
  if (entry.startsWith(".env")) {
    fs.rmSync(path.join(standaloneDir, entry));
    console.log(`Removed ${entry} from .next/standalone/ (desktop builds must not ship a backend URL)`);
  }
}
