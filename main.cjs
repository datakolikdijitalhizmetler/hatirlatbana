const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

const isDev = process.env.NODE_ENV === 'development';

// Force Chromium locale to Turkish for 24-hour time and DD/MM/YYYY date formatting
app.commandLine.appendSwitch('lang', 'tr-TR');

let mainWindow;
let tray = null;
let isQuitting = false;
let currentOverlayImg = null;
let currentOverlayDesc = '';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 700,
    minWidth: 1000,
    minHeight: 600,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    show: !process.argv.includes('--hidden'),
    // Add Windows 11 rounded corners and Mica/Acrylic effect if possible (requires specific native modules or properties)
    // For now, we rely on standard frameless/vibrancy options or web UI
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  if (isDev) {
    // Vite dev server URL
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  // Prevent window close, just hide it
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });

  mainWindow.on('show', () => {
    if (currentOverlayImg) {
      mainWindow.setOverlayIcon(currentOverlayImg, currentOverlayDesc);
    }
  });
}

// Register the custom protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('hatirlatbana', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('hatirlatbana')
}

// Function to handle the custom protocol URL
function handleProtocolUrl(url) {
  if (!url || !url.startsWith('hatirlatbana://')) return;
  const parsedUrl = new URL(url);
  const action = parsedUrl.hostname; // e.g. click, action
  const id = parsedUrl.searchParams.get('id');
  const actionType = parsedUrl.searchParams.get('type');

  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();

    if (action === 'click') {
      mainWindow.webContents.send('notification-clicked', id);
    } else if (action === 'action') {
      mainWindow.webContents.send('notification-action', { id, action: actionType });
    }
  }
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Protocol handler for Windows
    const url = commandLine.find(arg => arg.startsWith('hatirlatbana://'));
    if (url) {
      handleProtocolUrl(url);
    } else if (mainWindow) {
      if (!commandLine.includes('--hidden')) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  app.whenReady().then(() => {
  createWindow();

  // Create Tray Icon
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  tray = new Tray(icon);
  tray.setToolTip('Hatırlat Bana');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Uygulamayı Aç', click: () => { mainWindow.show(); } },
    { type: 'separator' },
    { label: 'Çıkış Yap', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    mainWindow.show();
  });

  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.webContents.send('open-new-reminder');
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Handle protocol on cold start
  const url = process.argv.find(arg => arg.startsWith('hatirlatbana://'));
  if (url) {
    // Wait slightly for the window to be ready to receive IPC messages
    setTimeout(() => {
      handleProtocolUrl(url);
    }, 500);
  }

  // Auto Updater
  if (app.isPackaged) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', () => {
      if (mainWindow) {
        mainWindow.webContents.send('update-status', 'downloading');
      }
    });

    autoUpdater.on('update-downloaded', () => {
      if (mainWindow) {
        mainWindow.webContents.send('update-status', 'ready');
      }
    });

    autoUpdater.on('error', (err) => {
      console.error('AutoUpdater error:', err);
    });

    // Check for updates after a short delay (let app fully load first)
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(err => console.error('Update check failed:', err));
    }, 5000);

    // Check for updates every 7 days while the app remains open
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(err => console.error('Periodic update check failed:', err));
    }, 7 * 24 * 60 * 60 * 1000);
  }
});
}

app.on('window-all-closed', function () {
  // Do not quit when windows are closed, wait for explicit quit
});

// IPC Handles for Notes & Reminders
const dataFilePath = path.join(app.getPath('userData'), 'hatirlatbana_data.json');

// Auto-start IPC
ipcMain.handle('set-autostart', (event, enabled) => {
  const loginSettings = {
    openAtLogin: enabled,
    path: process.execPath,
    args: ['--hidden']
  };
  
  if (!app.isPackaged) {
    loginSettings.args = [app.getAppPath(), '--hidden'];
  }
  
  app.setLoginItemSettings(loginSettings);
  return app.getLoginItemSettings(loginSettings).openAtLogin;
});

ipcMain.handle('get-autostart', () => {
  const loginSettings = {
    path: process.execPath,
    args: ['--hidden']
  };
  
  if (!app.isPackaged) {
    loginSettings.args = [app.getAppPath(), '--hidden'];
  }
  
  const settings = app.getLoginItemSettings(loginSettings);
  return process.platform === 'win32' ? settings.executableWillLaunchAtLogin : settings.openAtLogin;
});

// Auto-updater IPC
ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('read-data', async () => {
  try {
    if (fs.existsSync(dataFilePath)) {
      const raw = fs.readFileSync(dataFilePath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (error) {
    console.error('Error reading data:', error);
  }
  return { notes: [], reminders: [] };
});

ipcMain.handle('save-data', async (event, data) => {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf8');
    return { success: true };
  } catch (error) {
    console.error('Error saving data:', error);
    return { success: false, error: error.message };
  }
});

// Set AUMID for Windows 10/11 Notifications
app.setAppUserModelId('com.hatirlatbana.app');

// Windows 11 Native Notification using toastXml for Action Center persistence
ipcMain.handle('show-notification', async (event, { id, title, body }) => {
  // Escape XML characters
  const escapeXml = (unsafe) => {
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
  };

  const safeTitle = escapeXml(title || '');
  const safeBody = escapeXml(body || '');
  const iconPath = `file:///${path.join(__dirname, 'icon.png').replace(/\\/g, '/')}`;

  const toastXml = `
<toast activationType="protocol" launch="hatirlatbana://click?id=${id}">
  <visual>
    <binding template="ToastGeneric">
      <text>${safeTitle}</text>
      <text>${safeBody}</text>
    </binding>
  </visual>
  <actions>
    <action content="Ertele" activationType="protocol" arguments="hatirlatbana://action?id=${id}&amp;type=snooze" />
    <action content="Tamamlandı" activationType="protocol" arguments="hatirlatbana://action?id=${id}&amp;type=complete" />
  </actions>
</toast>`;

  const notification = new Notification({
    toastXml: toastXml
  });

  notification.show();
});

ipcMain.on('set-badge', (event, data) => {
  const count = typeof data === 'object' ? data.count : data;
  const dataUrl = typeof data === 'object' ? data.dataUrl : null;
  const trayDataUrl = typeof data === 'object' ? data.trayDataUrl : null;
  app.setBadgeCount(count);
  
  if (mainWindow) {
    if (count > 0 && dataUrl) {
      currentOverlayImg = nativeImage.createFromDataURL(dataUrl);
      currentOverlayDesc = `${count} aktif görev`;
      mainWindow.setOverlayIcon(currentOverlayImg, currentOverlayDesc);
    } else {
      currentOverlayImg = null;
      currentOverlayDesc = '';
      mainWindow.setOverlayIcon(null, '');
    }
  }

  if (tray) {
    if (count > 0 && trayDataUrl) {
      tray.setImage(nativeImage.createFromDataURL(trayDataUrl));
    } else {
      tray.setImage(nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 32, height: 32 }));
    }
  }
});

ipcMain.on('update-tray-lang', (event, { appTitle, openApp, quitApp }) => {
  if (tray) {
    tray.setToolTip(appTitle);
    const contextMenu = Menu.buildFromTemplate([
      { label: openApp, click: () => { mainWindow.show(); } },
      { type: 'separator' },
      { label: quitApp, click: () => { isQuitting = true; app.quit(); } }
    ]);
    tray.setContextMenu(contextMenu);
  }
});

ipcMain.handle('show-confirm', async (event, message) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['İptal', 'Evet'],
    defaultId: 1,
    cancelId: 0,
    title: 'Onay',
    message: message
  });
  return result.response === 1;
});

ipcMain.handle('show-alert', async (event, message) => {
  await dialog.showMessageBox(mainWindow, {
    type: 'info',
    buttons: ['Tamam'],
    title: 'Bilgi',
    message: message
  });
});

ipcMain.handle('export-data', async (event, data) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Verileri Dışa Aktar',
    defaultPath: 'hatirlatbana-yedek.json',
    filters: [{ name: 'JSON Dosyası', extensions: ['json'] }]
  });
  if (!result.canceled && result.filePath) {
    try {
      fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }
  return false;
});

ipcMain.handle('import-data', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Verileri İçe Aktar',
    filters: [{ name: 'JSON Dosyası', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    try {
      const content = fs.readFileSync(result.filePaths[0], 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed.notes && parsed.reminders) {
        return parsed;
      }
    } catch (e) {
      console.error(e);
      return null;
    }
  }
  return null;
});
