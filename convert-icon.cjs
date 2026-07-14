const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ 
    width: 512, 
    height: 512, 
    show: false, 
    transparent: true,
    webPreferences: { offscreen: true } 
  });
  
  const svgData = fs.readFileSync(path.join(__dirname, 'public', 'fish.svg'), 'utf8');
  
  // HTML with SVG loaded as an image to render it
  const html = `<html><body style="margin:0;padding:0;background:transparent;"><img src="data:image/svg+xml;base64,${Buffer.from(svgData).toString('base64')}" width="512" height="512" /></body></html>`;
  
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
  
  // Wait a bit for the image to render
  setTimeout(async () => {
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(__dirname, 'icon.png'), image.toPNG());
    fs.writeFileSync(path.join(__dirname, 'public', 'icon.png'), image.toPNG());
    console.log('Conversion Done');
    app.quit();
  }, 1000);
});
