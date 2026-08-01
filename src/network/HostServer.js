import TcpSocket from 'react-native-tcp-socket';
import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';

const FILE_PORT = 8990;

export class HostServer {
  server = null;
  audioFileUri = '';
  audioFileName = '';
  startAtTime = null;

  start(audioFileUri, audioFileName) {
    console.log(`[HostServer] 🚀 HTTP server starting... (File: ${audioFileName})`);
    this.audioFileUri = audioFileUri;
    this.audioFileName = audioFileName;
    this.startAtTime = null;
    this.startHttpServer();
  }

  startHttpServer() {
    this.server = TcpSocket.createServer(async (socket) => {
      socket.setTimeout(5000); 

      socket.on('data', async (data) => {
        const request = data.toString();
        console.log(`[HostServer] 📥 Received HTTP Request:\n${request.split('\n')[0]}`);
        
        try {
          if (request.startsWith('GET /discover ')) {
            this.sendJsonResponse(socket, { fileName: this.audioFileName });
          } else if (request.startsWith('GET /ping ')) {
            this.sendJsonResponse(socket, { hostTime: Date.now() });
          } else if (request.startsWith('GET /status ')) {
            this.sendJsonResponse(socket, { startAt: this.startAtTime });
          } else if (request.startsWith('GET /audio ')) {
            await this.serveAudioFile(socket);
          } else {
            socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n', 'utf8', () => {
              try { socket.end(); } catch (e) {}
            });
          }
        } catch (e) {
          console.error(`[HostServer] ⚠️ Error handling request:`, e);
          socket.write('HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\n\r\n', 'utf8', () => {
            try { socket.end(); } catch (e) {}
          });
        }
      });
      
      socket.on('error', () => {}); 
      socket.on('timeout', () => socket.destroy());
    });

    this.server.listen({ port: FILE_PORT, host: '0.0.0.0' }, () => {
      console.log(`[HostServer] ✅ HTTP API actively listening on 0.0.0.0:${FILE_PORT}`);
    });

    this.server.on('error', (err) => {
      console.error(`[HostServer] ❌ Server failed to listen:`, err?.message || err);
    });
  }

  sendJsonResponse(socket, data) {
    const body = JSON.stringify(data);
    const header = 
      `HTTP/1.1 200 OK\r\n` +
      `Content-Type: application/json\r\n` +
      `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n` +
      `Connection: close\r\n\r\n`;
    
    // Safely wait for write buffer flush before closing socket
    socket.write(header + body, 'utf8', () => {
      try {
        socket.end();
      } catch (e) {}
    });
  }

  async serveAudioFile(socket) {
    try {
      console.log(`[HostServer] 📁 Loading audio file for transfer: ${this.audioFileUri}`);

      const base64 = await FileSystem.readAsStringAsync(this.audioFileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const fileBuffer = Buffer.from(base64, 'base64');
      const fileSize = fileBuffer.length;
      console.log(`[HostServer] 📦 Audio loaded. Exact byte size: ${fileSize}`);

      const header =
        `HTTP/1.1 200 OK\r\n` +
        `Content-Type: audio/mpeg\r\n` +
        `Content-Length: ${fileSize}\r\n` +
        `Connection: close\r\n\r\n`;

      await new Promise((resolve) => socket.write(header, 'utf8', resolve));

      socket.write(fileBuffer, () => {
        console.log(`[HostServer] ✅ Audio transfer complete (${fileSize} bytes sent).`);
        try { socket.end(); } catch (e) {}
      });
    } catch (err) {
      console.error(`[HostServer] ❌ Exception in serveAudioFile:`, err);
      try { socket.end(); } catch (e) {}
    }
  }

  broadcastStartAt(startAtHostTime) {
    console.log(`[HostServer] 📢 Broadcasting startAt time: ${startAtHostTime}`);
    this.startAtTime = startAtHostTime;
  }

  stopPlayback() {
    console.log(`[HostServer] ⏸️ Stopping playback broadcast`);
    this.startAtTime = null;
  }

  stop() {
    console.log('[HostServer] 🛑 Stopping HTTP server...');
    if (this.server) {
      try { this.server.close(); } catch (e) {}
      this.server = null;
    }
    this.startAtTime = null;
    console.log('[HostServer] ✅ Server stopped cleanly.');
  }
}
