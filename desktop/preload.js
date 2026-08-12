const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Desktop source capture
  getDesktopSourceId: () => ipcRenderer.invoke('get-desktop-source-id'),
  // Hosting (TCP server in main process)
  startTcpServer: (options) => ipcRenderer.invoke('start-tcp-server', options),
  broadcastAudioChunk: (base64Chunk) => ipcRenderer.invoke('broadcast-audio-chunk', base64Chunk),
  stopTcpServer: () => ipcRenderer.invoke('stop-tcp-server'),
  // Network / LAN
  getLanIp: () => ipcRenderer.invoke('get-lan-ip'),
  probeHost: (args) => ipcRenderer.invoke('probe-host', args),
  // Listening (TCP client in main process — bypasses CORS)
  connectToHost: (args) => ipcRenderer.invoke('connect-to-host', args),
  disconnectFromHost: () => ipcRenderer.invoke('disconnect-from-host'),
  // Push events from main → renderer
  onAudioChunk: (cb) => {
    ipcRenderer.on('audio-chunk', (_, base64) => cb(base64));
  },
  onListenerDisconnected: (cb) => {
    ipcRenderer.on('listener-disconnected', () => cb());
  },
  removeAudioChunkListener: () => ipcRenderer.removeAllListeners('audio-chunk'),
  removeListenerDisconnectedListener: () => ipcRenderer.removeAllListeners('listener-disconnected'),
  platform: process.platform,
});


