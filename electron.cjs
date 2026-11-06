const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { spawn } = require("child_process");

const SERVER_URL = "http://127.0.0.1:3000";
const HEALTH_CHECK_URL = "http://127.0.0.1:3000/api/public/company-branding";

let mainWindow = null;
let serverProcess = null;
let isQuitting = false;

function resolveServerScriptPath() {
  if (process.resourcesPath) {
    const packagedPath = path.join(process.resourcesPath, "server-prod.cjs");
    if (fs.existsSync(packagedPath)) {
      return packagedPath;
    }
  }
  return path.join(__dirname, "server-prod.cjs");
}

function resolveWasmPath() {
  if (process.resourcesPath) {
    const packagedWasm = path.join(process.resourcesPath, "sql-wasm.wasm");
    if (fs.existsSync(packagedWasm)) {
      return packagedWasm;
    }
  }
  const rootWasm = path.join(__dirname, "sql-wasm.wasm");
  if (fs.existsSync(rootWasm)) {
    return rootWasm;
  }
  return path.join(__dirname, "node_modules", "sql.js", "dist", "sql-wasm.wasm");
}

function resolveAppRoot() {
  const appPath = app.getAppPath();
  if (fs.existsSync(path.join(appPath, "web-dist", "index.html"))) {
    return appPath;
  }
  if (fs.existsSync(path.join(__dirname, "web-dist", "index.html"))) {
    return __dirname;
  }
  if (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, "app.asar", "web-dist", "index.html"))) {
    return path.join(process.resourcesPath, "app.asar");
  }
  return appPath;
}

function checkServerReady() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_CHECK_URL, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForBackend(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ready = await checkServerReady();
    if (ready) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function startBackendServer() {
  const dataRoot = path.join(app.getPath("userData"), "CoworkingManagement_Data");
  const appRoot = resolveAppRoot();
  const serverScript = resolveServerScriptPath();
  const wasmPath = resolveWasmPath();

  process.env.COWORKING_DATA_ROOT = dataRoot;
  process.env.COWORKING_APP_ROOT = appRoot;
  process.env.COWORKING_RESOURCES_PATH = process.resourcesPath || __dirname;
  process.env.SQL_WASM_PATH = wasmPath;

  const alreadyRunning = await checkServerReady();
  if (alreadyRunning) {
    return true;
  }

  if (!fs.existsSync(serverScript)) {
    throw new Error(`Production backend server file not found at: ${serverScript}`);
  }

  serverProcess = spawn(process.execPath, [serverScript], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: "3000",
      COWORKING_DATA_ROOT: dataRoot,
      COWORKING_APP_ROOT: appRoot,
      COWORKING_RESOURCES_PATH: process.resourcesPath || __dirname,
      SQL_WASM_PATH: wasmPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  if (serverProcess.stdout) {
    serverProcess.stdout.on("data", (data) => {
      process.stdout.write(`[Backend] ${data}`);
    });
  }

  if (serverProcess.stderr) {
    serverProcess.stderr.on("data", (data) => {
      process.stderr.write(`[Backend Error] ${data}`);
    });
  }

  serverProcess.on("exit", (code, signal) => {
    if (!isQuitting) {
      console.error(`Backend server exited with code ${code} (signal: ${signal})`);
    }
    serverProcess = null;
  });

  const ready = await waitForBackend(30000);
  if (!ready) {
    // Fallback: start server in-process if child process failed to bind in time
    require(serverScript);
    return await waitForBackend(15000);
  }
  return true;
}

function stopBackendServer() {
  isQuitting = true;
  if (!serverProcess) return;
  try {
    if (process.platform === "win32" && serverProcess.pid) {
      spawn("taskkill", ["/pid", String(serverProcess.pid), "/f", "/t"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      serverProcess.kill("SIGTERM");
    }
  } catch (err) {
    try {
      serverProcess.kill();
    } catch {
      // Ignore error if already exited
    }
  } finally {
    serverProcess = null;
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Coworking Space",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      const started = await startBackendServer();
      if (!started) {
        dialog.showErrorBox(
          "Coworking Space - Startup Error",
          "The local backend server failed to respond on http://127.0.0.1:3000."
        );
        app.quit();
        return;
      }
      createMainWindow();
    } catch (err) {
      dialog.showErrorBox(
        "Coworking Space - Startup Error",
        err && err.message ? err.message : String(err)
      );
      app.quit();
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });
}

app.on("before-quit", () => {
  stopBackendServer();
});

app.on("will-quit", () => {
  stopBackendServer();
});

app.on("window-all-closed", () => {
  stopBackendServer();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

process.on("exit", () => {
  stopBackendServer();
});
