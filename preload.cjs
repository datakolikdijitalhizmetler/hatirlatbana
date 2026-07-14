const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  readData: () => ipcRenderer.invoke('read-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  showNotification: (options) => ipcRenderer.invoke('show-notification', options),
  onNotificationClicked: (callback) => ipcRenderer.on('notification-clicked', (_event, id) => callback(id)),
  onNotificationAction: (callback) => ipcRenderer.on('notification-action', (_event, data) => callback(data)),
  setBadgeCount: (count) => ipcRenderer.send('set-badge', count),
  showConfirm: (message) => ipcRenderer.invoke('show-confirm', message),
  showAlert: (message) => ipcRenderer.invoke('show-alert', message),
  exportData: (data) => ipcRenderer.invoke('export-data', data),
  importData: () => ipcRenderer.invoke('import-data'),
  getAutostart: () => ipcRenderer.invoke('get-autostart'),
  setAutostart: (enabled) => ipcRenderer.invoke('set-autostart', enabled),
  onOpenNewReminder: (callback) => ipcRenderer.on('open-new-reminder', callback),
  updateTrayLang: (options) => ipcRenderer.send('update-tray-lang', options),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, status) => callback(status)),
  installUpdate: () => ipcRenderer.send('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version')
});
