const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const netModule = require('net');
const os = require('os');

let mainWindow;
let serverPort = 0;
let tcpServer = null;
let audioSockets = new Set();
let isBroadcasting = false;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function startLocalServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let safePath = path.normalize(decodeURIComponent(req.url)).replace(/^(\.\.[\/\\])+/, '');
      safePath = safePath.split('?')[0];

      if (safePath === '/' || safePath === '') safePath = '/index.html';

      let filePath = path.join(__dirname, '../dist', safePath);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(__dirname, '../dist/index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(500);
          res.end('Error loading file');
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(data);
        }
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      console.log(`Local production server listening on http://127.0.0.1:${port}`);
      resolve(port);
    });

    server.on('error', reject);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    title: 'STADEL Desktop Audio Sharing',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  const isDev = process.env.NODE_ENV === 'development';
  const devServerUrl =
    process.env.ELECTRON_START_URL || 'http://localhost:8082';

  if (isDev) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
  }
}

// IPC Handler to fetch desktop screen/audio sources for system audio capture
ipcMain.handle('get-desktop-source-id', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window', 'audio']
    });

    if (sources && sources.length > 0) {
      return sources[0].id;
    }
  } catch (err) {
    console.error('Failed to get desktop sources:', err);
  }

  return null;
});

// ---- LAN IP detection ----
ipcMain.handle('get-lan-ip', () => {
  const interfaces = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(interfaces)) {
    // Skip loopback, docker, virtualbox, VMware, and VPN-like interfaces
    const skipPattern = /^(lo|docker|virbr|vmnet|veth|br-|tun|tap)/i;
    if (skipPattern.test(name)) continue;
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        candidates.push({ name, address: iface.address });
      }
    }
  }
  if (candidates.length > 0) return candidates[0].address;
  return '127.0.0.1';
});

// ---- Host discovery & connection (bypasses browser CORS) ----
ipcMain.handle('probe-host', async (event, { ip, port, timeoutMs }) => {
  return new Promise((resolve) => {
    const socket = new netModule.Socket();
    let requestBuffer = '';
    let resolved = false;
    const done = (result) => {
      if (resolved) return;
      resolved = true;
      try { socket.destroy(); } catch (e) {}
      resolve(result);
    };
    const timer = setTimeout(() => done(null), timeoutMs || 2000);
    socket.connect({ port: port || 8990, host: ip }, () => {
      socket.write(`GET /discover HTTP/1.1\r\nHost: ${ip}\r\nConnection: close\r\n\r\n`);
    });
    socket.on('data', (data) => {
      requestBuffer += data.toString();
      const headerEnd = requestBuffer.indexOf('\r\n\r\n');
      if (headerEnd !== -1) {
        const body = requestBuffer.slice(headerEnd + 4);
        try {
          const parsed = JSON.parse(body);
          clearTimeout(timer);
          done({ ip, fileName: parsed.fileName || 'Live System Audio', isLive: parsed.isLive ?? true });
        } catch (e) {
          clearTimeout(timer);
          done(null);
        }
      }
    });
    socket.on('error', () => { clearTimeout(timer); done(null); });
    socket.on('close', () => { clearTimeout(timer); done(null); });
  });
});

// Active TCP client socket for listening to audio stream on desktop
let listenerSocket = null;
let listenerWindowId = null;

ipcMain.handle('connect-to-host', async (event, { ip, port }) => {
  if (listenerSocket) {
    try { listenerSocket.destroy(); } catch (e) {}
    listenerSocket = null;
  }
  listenerWindowId = event.sender.id;
  return new Promise((resolve, reject) => {
    let isHeaderPassed = false;
    let headerBuffer = Buffer.alloc(0);
    let incomingBuffer = Buffer.alloc(0);

    listenerSocket = new netModule.Socket();
    listenerSocket.connect({ port: port || 8990, host: ip }, () => {
      listenerSocket.write(`GET /live HTTP/1.1\r\nHost: ${ip}\r\n\r\n`);
      resolve({ success: true });
    });

    listenerSocket.on('data', (data) => {
      const chunk = Buffer.from(data);
      if (!isHeaderPassed) {
        headerBuffer = Buffer.concat([headerBuffer, chunk]);
        const headerEnd = headerBuffer.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          isHeaderPassed = true;
          const audioData = headerBuffer.slice(headerEnd + 4);
          headerBuffer = null;
          if (audioData.length > 0) processListenerAudio(audioData);
        }
        return;
      }
      processListenerAudio(chunk);
    });

    function processListenerAudio(chunk) {
      incomingBuffer = Buffer.concat([incomingBuffer, chunk]);
      while (incomingBuffer.length >= 4) {
        const payloadLen = incomingBuffer.readUInt32BE(0);
        if (payloadLen <= 0) { incomingBuffer = incomingBuffer.slice(4); continue; }
        if (incomingBuffer.length < 4 + payloadLen) break;
        const payload = incomingBuffer.slice(4, 4 + payloadLen);
        incomingBuffer = incomingBuffer.slice(4 + payloadLen);
        const base64 = payload.toString('base64');
        const win = BrowserWindow.fromId(listenerWindowId);
        if (win && !win.isDestroyed()) {
          win.webContents.send('audio-chunk', base64);
        }
      }
    }

    listenerSocket.on('error', (err) => {
      if (!resolve._called) reject(new Error(`Failed to connect: ${err.message}`));
      const win = listenerWindowId && BrowserWindow.fromId(listenerWindowId);
      if (win && !win.isDestroyed()) win.webContents.send('listener-disconnected');
    });
    listenerSocket.on('close', () => {
      const win = listenerWindowId && BrowserWindow.fromId(listenerWindowId);
      if (win && !win.isDestroyed()) win.webContents.send('listener-disconnected');
    });
  });
});

ipcMain.handle('disconnect-from-host', async () => {
  if (listenerSocket) {
    try { listenerSocket.destroy(); } catch (e) {}
    listenerSocket = null;
  }
  return { success: true };
});

// TCP Host Server IPC handlers for Desktop Broadcasting
ipcMain.handle('start-tcp-server', async (event, options) => {
  const port = options?.port || 8990;
  if (tcpServer) {
    try { tcpServer.close(); } catch (e) {}
    tcpServer = null;
  }
  audioSockets.clear();
  isBroadcasting = true;

  return new Promise((resolve, reject) => {
    tcpServer = netModule.createServer((socket) => {
      let isStreamClient = false;
      let requestBuffer = '';

      socket.on('data', (data) => {
        if (isStreamClient) return;

        requestBuffer += data.toString();
        if (!requestBuffer.includes('\r\n\r\n')) return;

        const request = requestBuffer;
        requestBuffer = '';

        if (request.startsWith('GET /discover')) {
          const body = JSON.stringify({
            status: 'live',
            fileName: 'Live System Audio',
            isLive: true,
          });
          const header =
            `HTTP/1.1 200 OK\r\n` +
            `Content-Type: application/json\r\n` +
            `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n` +
            `Connection: close\r\n\r\n`;
          socket.write(header + body, 'utf8', () => {
            try { socket.end(); } catch (e) {}
          });
          return;
        } else if (request.startsWith('GET /ping')) {
          const body = JSON.stringify({ hostTime: Date.now() });
          const header =
            `HTTP/1.1 200 OK\r\n` +
            `Content-Type: application/json\r\n` +
            `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n` +
            `Connection: close\r\n\r\n`;
          socket.write(header + body, 'utf8', () => {
            try { socket.end(); } catch (e) {}
          });
          return;
        } else if (request.startsWith('GET /live') || request.startsWith('STREAM')) {
          isStreamClient = true;
          audioSockets.add(socket);
          console.log(`[HostServer Desktop] 🎧 Listener connected to live audio stream. Total listeners: ${audioSockets.size}`);
          const header =
            `HTTP/1.1 200 OK\r\n` +
            `Content-Type: audio/pcm\r\n` +
            `Connection: keep-alive\r\n\r\n`;
          socket.write(header);
          return;
        }
      });

      const cleanup = () => {
        if (audioSockets.has(socket)) {
          audioSockets.delete(socket);
          console.log(`[HostServer Desktop] 🔌 Listener disconnected. Total listeners: ${audioSockets.size}`);
        }
      };
      socket.on('close', cleanup);
      socket.on('error', cleanup);
      socket.on('end', cleanup);
    });

    tcpServer.listen({ port, host: '0.0.0.0' }, () => {
      console.log(`[HostServer Desktop] ✅ Server listening on 0.0.0.0:${port}`);
      resolve({ success: true, port });
    });

    tcpServer.on('error', (err) => {
      console.error('[HostServer Desktop] ❌ Server error:', err?.message || err);
      reject(err);
    });
  });
});

ipcMain.handle('broadcast-audio-chunk', async (event, base64Chunk) => {
  if (!isBroadcasting || audioSockets.size === 0) return;

  const pcmBuffer = Buffer.from(base64Chunk, 'base64');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(pcmBuffer.length, 0);
  const frame = Buffer.concat([header, pcmBuffer]);

  for (const socket of audioSockets) {
    try {
      socket.write(frame);
    } catch (e) {
      audioSockets.delete(socket);
    }
  }
});

ipcMain.handle('stop-tcp-server', async () => {
  isBroadcasting = false;
  for (const socket of audioSockets) {
    try { socket.destroy(); } catch (e) {}
  }
  audioSockets.clear();

  if (tcpServer) {
    try { tcpServer.close(); } catch (e) {}
    tcpServer = null;
  }
  console.log('[HostServer Desktop] 🛑 Server stopped.');
  return { success: true };
});

app.whenReady().then(async () => {
  const isDev = process.env.NODE_ENV === 'development';
  if (!isDev) {
    try {
      serverPort = await startLocalServer();
    } catch (err) {
      console.error('Failed to start local production server:', err);
    }
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

