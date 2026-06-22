const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // ============ DualSense Controller API ============
  getControllers: () => ipcRenderer.invoke('get-controllers'),
  
  sendVibration: (devicePath, leftMotor, rightMotor, duration) =>
    ipcRenderer.invoke('send-vibration', devicePath, leftMotor, rightMotor, duration),
  
  stopVibration: (devicePath) =>
    ipcRenderer.invoke('stop-vibration', devicePath),
  
  getControllerInfo: (devicePath) =>
    ipcRenderer.invoke('get-controller-info', devicePath),
  
  watchControllers: (callback) => {
    ipcRenderer.on('controllers-updated', (event, controllers) => {
      callback(controllers);
    });
    ipcRenderer.send('watch-controllers');
  },
  
  removeWatchControllers: () => {
    ipcRenderer.removeAllListeners('controllers-updated');
  },

  // ============ SFX to Haptic System API ============
  sfxHapticInit: () =>
    ipcRenderer.invoke('sfx-haptic-init'),

  sfxHapticStart: () =>
    ipcRenderer.invoke('sfx-haptic-start'),

  sfxHapticStop: () =>
    ipcRenderer.invoke('sfx-haptic-stop'),

  sfxHapticStatus: () =>
    ipcRenderer.invoke('sfx-haptic-status'),

  sfxHapticUpdateDetector: (config) =>
    ipcRenderer.invoke('sfx-haptic-update-detector', config),

  sfxHapticUpdateMapper: (config) =>
    ipcRenderer.invoke('sfx-haptic-update-mapper', config),

  sfxHapticDebug: (enabled) =>
    ipcRenderer.invoke('sfx-haptic-debug', enabled),

  sfxHapticStats: () =>
    ipcRenderer.invoke('sfx-haptic-stats'),
});
