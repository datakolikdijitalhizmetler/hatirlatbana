const { app } = require('electron');

app.whenReady().then(() => {
  app.setLoginItemSettings({
    openAtLogin: true,
    args: ['--hidden']
  });
  console.log("Without args:", app.getLoginItemSettings().openAtLogin);
  console.log("With args:", app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin);
  app.quit();
});
