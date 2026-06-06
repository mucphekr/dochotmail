const { app, BrowserWindow, shell } = require("electron");

let localServer = null;
let mainWindow = null;

function startLocalServer() {
  return new Promise((resolve, reject) => {
    process.env.PORT = "0";
    const { startServer } = require("../server");
    const server = startServer(0, (runningServer, port) => {
      localServer = runningServer;
      resolve(port);
    });
    server.on("error", reject);
  });
}

async function createMainWindow() {
  const port = await startLocalServer();
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 860,
    minHeight: 600,
    autoHideMenuBar: true,
    title: "Check code hotmail",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

app.whenReady().then(createMainWindow).catch((error) => {
  console.error(error);
  app.quit();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  if (localServer) {
    localServer.close();
    localServer = null;
  }
});
