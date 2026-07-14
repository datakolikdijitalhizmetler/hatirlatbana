const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { Jimp } = require('jimp');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ 
    width: 164, 
    height: 314, 
    show: false, 
    webPreferences: { offscreen: true } 
  });
  
  const svgData = fs.readFileSync(path.join(__dirname, 'public', 'datakolik-logo-dark.svg'), 'utf8');
  
  const html = `
    <html>
      <body style="margin:0;padding:0;background-color:#0067c0;display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column;">
        <img src="data:image/svg+xml;base64,${Buffer.from(svgData).toString('base64')}" width="120" style="margin-bottom: 20px;" />
      </body>
    </html>
  `;
  
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
  
  setTimeout(async () => {
    try {
      const image = await win.webContents.capturePage();
      const pngBuffer = image.toPNG();
      
      const jimpImage = await Jimp.read(pngBuffer);
      await jimpImage.write(path.join(__dirname, 'sidebar.bmp'));
      
      console.log('Sidebar BMP created');
    } catch(err) {
      console.error(err);
    }
    app.quit();
  }, 1500);
});
