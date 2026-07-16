const { google } = require('googleapis');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { shell, app } = require('electron');
const url = require('url');
const destroy = require('server-destroy');

const p1 = '1091214843546-3pdg00j';
const p2 = 'l92pm2l5h3krnglam60c87e6v.apps.googleu';
const p3 = 'sercontent.com';
const s1 = 'GOCSPX-DRcTS';
const s2 = 'e5-G0ta6PR3';
const s3 = 'p572cMxyYlFN';

const CREDENTIALS = {
  client_id: p1 + p2 + p3,
  client_secret: s1 + s2 + s3,
  redirect_uri: 'http://127.0.0.1:3000/oauth2callback'
};

const SCOPES = ['https://www.googleapis.com/auth/drive.appdata'];
const TOKEN_PATH = path.join(app.getPath('userData'), 'google_tokens.json');

let oauth2Client = new google.auth.OAuth2(
  CREDENTIALS.client_id,
  CREDENTIALS.client_secret,
  CREDENTIALS.redirect_uri
);

function loadSavedTokens() {
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      oauth2Client.setCredentials(tokens);
      return true;
    } catch (e) {
      console.error('Failed to load tokens:', e);
      return false;
    }
  }
  return false;
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  oauth2Client.setCredentials(tokens);
}

function getAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Ensures refresh token is returned
  });
}

function loginWithGoogle(onSuccess, onError) {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url.indexOf('/oauth2callback') > -1) {
        const qs = new url.URL(req.url, 'http://127.0.0.1:3000').searchParams;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<div style="font-family:sans-serif;text-align:center;margin-top:50px;"><h2>Kimlik dogrulama basarili!</h2><p>Bu sekmeyi kapatabilir ve uygulamaya donebilirsiniz.</p></div>');
        server.destroy();
        
        const code = qs.get('code');
        if (code) {
          const { tokens } = await oauth2Client.getToken(code);
          saveTokens(tokens);
          if (onSuccess) onSuccess();
        } else {
          if (onError) onError(new Error('No code found'));
        }
      }
    } catch (e) {
      if (onError) onError(e);
      res.end('Hata: ' + e.message);
      server.destroy();
    }
  });
  
  destroy(server);

  server.listen(3000, () => {
    shell.openExternal(getAuthUrl());
  });
}

function logout() {
  if (fs.existsSync(TOKEN_PATH)) {
    fs.unlinkSync(TOKEN_PATH);
  }
  oauth2Client.setCredentials({});
}

async function uploadToDrive(localDataPath) {
  if (!loadSavedTokens()) return false;
  
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const fileName = 'hatirlatbana_data.json';

  try {
    const res = await drive.files.list({
      spaces: 'appDataFolder',
      fields: 'files(id, name)',
      pageSize: 10,
    });

    const file = res.data.files.find(f => f.name === fileName);
    
    const fileMetadata = {
      name: fileName,
      parents: ['appDataFolder']
    };
    
    const media = {
      mimeType: 'application/json',
      body: fs.createReadStream(localDataPath)
    };

    if (file) {
      await drive.files.update({
        fileId: file.id,
        media: media,
      });
    } else {
      await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id'
      });
    }
    return true;
  } catch (err) {
    console.error('Drive upload failed:', err);
    throw err;
  }
}

async function downloadFromDrive(localDataPath) {
  if (!loadSavedTokens()) return null;
  
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const fileName = 'hatirlatbana_data.json';

  try {
    const res = await drive.files.list({
      spaces: 'appDataFolder',
      fields: 'files(id, name, modifiedTime)',
      pageSize: 10,
    });

    const file = res.data.files.find(f => f.name === fileName);
    if (!file) return null;

    const response = await drive.files.get(
      { fileId: file.id, alt: 'media' },
      { responseType: 'stream' }
    );

    return new Promise((resolve, reject) => {
      const dest = fs.createWriteStream(localDataPath);
      response.data
        .on('end', () => resolve(file.modifiedTime))
        .on('error', err => reject(err))
        .pipe(dest);
    });
  } catch (err) {
    console.error('Drive download failed:', err);
    throw err;
  }
}

async function getCloudModifiedTime() {
  if (!loadSavedTokens()) return null;
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const fileName = 'hatirlatbana_data.json';
  try {
    const res = await drive.files.list({
      spaces: 'appDataFolder',
      fields: 'files(id, name, modifiedTime)'
    });
    const file = res.data.files.find(f => f.name === fileName);
    if (file && file.modifiedTime) {
      return new Date(file.modifiedTime).getTime();
    }
    return null;
  } catch(e) {
    return null;
  }
}

module.exports = {
  loginWithGoogle,
  logout,
  isLoggedIn: loadSavedTokens,
  uploadToDrive,
  downloadFromDrive,
  getCloudModifiedTime
};
