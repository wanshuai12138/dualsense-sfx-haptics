const { app, BrowserWindow, ipcMain } = require('electron');
const isDev = require('electron-is-dev');
const path = require('path');
const DualSenseController = require('../controllers/DualSenseController');
const SFXtoHapticController = require('../controllers/SFXtoHapticController');

let mainWindow;
let dualSenseController;
let sfxtoHapticController;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false,
    },
  });

  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../../build/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  dualSenseController = new DualSenseController();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC 事件处理

// 获取连接的控制器列表
ipcMain.handle('get-controllers', async () => {
  return dualSenseController.getConnectedControllers();
});

// 发送震动命令
ipcMain.handle('send-vibration', async (event, devicePath, leftMotor, rightMotor, duration) => {
  return dualSenseController.vibrate(devicePath, leftMotor, rightMotor, duration);
});

// 停止所有震动
ipcMain.handle('stop-vibration', async (event, devicePath) => {
  return dualSenseController.stopVibration(devicePath);
});

// 获取控制器信息
ipcMain.handle('get-controller-info', async (event, devicePath) => {
  return dualSenseController.getControllerInfo(devicePath);
});

// 监听控制器连接
ipcMain.on('watch-controllers', () => {
  dualSenseController.watchControllers((controllers) => {
    mainWindow?.webContents.send('controllers-updated', controllers);
  });
});

// ============ SFX to Haptic System IPC ============

// 初始化 SFX 到震动系统
ipcMain.handle('sfx-haptic-init', async () => {
  if (!sfxtoHapticController) {
    sfxtoHapticController = new SFXtoHapticController();
  }
  return sfxtoHapticController.initialize();
});

// 启动 SFX 到震动系统
ipcMain.handle('sfx-haptic-start', async () => {
  if (!sfxtoHapticController) {
    sfxtoHapticController = new SFXtoHapticController();
  }
  sfxtoHapticController.start();
  return true;
});

// 停止 SFX 到震动系统
ipcMain.handle('sfx-haptic-stop', async () => {
  if (sfxtoHapticController) {
    sfxtoHapticController.stop();
  }
  return true;
});

// 获取 SFX 到震动系统状态
ipcMain.handle('sfx-haptic-status', async () => {
  if (!sfxtoHapticController) {
    return { error: 'System not initialized' };
  }
  return sfxtoHapticController.getStatus();
});

// 更新 SFX 检测器配置
ipcMain.handle('sfx-haptic-update-detector', async (event, config) => {
  if (sfxtoHapticController) {
    sfxtoHapticController.updateDetectorConfig(config);
  }
  return true;
});

// 更新映射器配置
ipcMain.handle('sfx-haptic-update-mapper', async (event, config) => {
  if (sfxtoHapticController) {
    sfxtoHapticController.updateMapperConfig(config);
  }
  return true;
});

// 设置调试模式
ipcMain.handle('sfx-haptic-debug', async (event, enabled) => {
  if (sfxtoHapticController) {
    sfxtoHapticController.setDebugMode(enabled);
  }
  return true;
});

// 获取统计信息
ipcMain.handle('sfx-haptic-stats', async () => {
  if (sfxtoHapticController) {
    return sfxtoHapticController.getStats();
  }
  return { error: 'System not initialized' };
});

// 清理
process.on('exit', () => {
  if (dualSenseController) {
    dualSenseController.cleanup();
  }
  if (sfxtoHapticController) {
    sfxtoHapticController.shutdown();
  }
});
