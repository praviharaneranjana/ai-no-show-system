const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const net = require("node:net");
const http = require("node:http");
const { spawn } = require("node:child_process");

let mainWindow = null;
let serverProcess = null;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function waitForServer(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    function attempt() {
      const req = http.get({ host: "127.0.0.1", port, path: "/" }, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) {
          reject(new Error(`SHAI server did not start within ${timeoutMs}ms`));
          return;
        }
        setTimeout(attempt, 300);
      });
    }
    attempt();
  });
}

async function startBundledServer() {
  const port = await getFreePort();
  const standaloneServerPath = path.join(__dirname, "..", ".next", "standalone", "server.js");
  const userDataDir = app.getPath("userData");

  serverProcess = spawn(process.execPath, [standaloneServerPath], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      SHAI_USER_DATA_DIR: userDataDir,
    },
    stdio: "inherit",
  });

  await waitForServer(port);
  return `http://127.0.0.1:${port}`;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const startUrl = process.env.ELECTRON_START_URL ?? (await startBundledServer());
  await mainWindow.loadURL(startUrl);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", () => {
  if (serverProcess) serverProcess.kill();
});
