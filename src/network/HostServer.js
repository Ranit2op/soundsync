import TcpSocket from 'react-native-tcp-socket';
import { Platform } from 'react-native';
import { Buffer } from 'buffer';
import { AudioCaptureBridge } from '../native/AudioCaptureBridge';

const FILE_PORT = 8990;
const HOST_LOG_PREFIX = '[HostAudioPipeline]';

export class HostServer {
  server = null;
  audioSockets = new Set();
  isBroadcasting = false;
  broadcastFrameCount = 0;
  broadcastByteCount = 0;
  lastBroadcastLogAt = 0;

  async start(onCaptureError) {
    console.log(`${HOST_LOG_PREFIX} 🚀 Starting Live Audio Host Server...`);
    this.isBroadcasting = true;
    this.broadcastFrameCount = 0;
    this.broadcastByteCount = 0;
    this.lastBroadcastLogAt = Date.now();

    // Start live audio capture via cross-platform AudioCaptureBridge
    try {
      await AudioCaptureBridge.startCapture(
        (base64Pcm) => {
          if (!this.isBroadcasting) return;

          if (typeof window !== 'undefined' && window.electronAPI?.broadcastAudioChunk) {
            window.electronAPI.broadcastAudioChunk(base64Pcm).catch(() => {});
            this.broadcastFrameCount++;
            const now = Date.now();
            if (now - this.lastBroadcastLogAt >= 5000) {
              console.log(`${HOST_LOG_PREFIX} 🎙️ Desktop audio capturing & broadcasting live.`);
              this.lastBroadcastLogAt = now;
            }
            return;
          }

          if (this.audioSockets.size === 0) {
            const now = Date.now();
            if (now - this.lastBroadcastLogAt >= 5000) {
              console.log(`${HOST_LOG_PREFIX} 🎙️ Audio captured, but 0 listeners connected currently.`);
              this.lastBroadcastLogAt = now;
            }
            return;
          }

          try {
            const pcmBuffer = Buffer.from(base64Pcm, 'base64');
            this.broadcastAudioChunk(pcmBuffer);
          } catch (e) {
            console.error(`${HOST_LOG_PREFIX} ❌ Error processing audio chunk:`, e);
          }
        },
        (errorMessage) => {
          console.error(`${HOST_LOG_PREFIX} ❌ Audio capture error:`, errorMessage);
          this.stop();
          onCaptureError?.(errorMessage);
        }
      );
      console.log(`${HOST_LOG_PREFIX} ✅ Live system audio capture started`);
    } catch (e) {
      console.error(`${HOST_LOG_PREFIX} ❌ Failed to start live capture:`, e);
      throw e;
    }

    await this.startServer();
  }

  async startServer() {
    if (typeof window !== 'undefined' && window.electronAPI?.startTcpServer) {
      console.log('[HostServer] Initializing Electron Desktop TCP Server...');
      await window.electronAPI.startTcpServer({ port: FILE_PORT });
      console.log(`[HostServer] ✅ Electron Desktop TCP Server active on 0.0.0.0:${FILE_PORT}`);
      return;
    }

    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      try {
        this.server = TcpSocket.createServer((socket) => {
          let isStreamClient = false;
          let requestBuffer = '';

          socket.on('data', (data) => {
            if (isStreamClient) return;

            requestBuffer += data.toString();
            if (!requestBuffer.includes('\r\n\r\n')) return;

            const request = requestBuffer;
            requestBuffer = '';

            if (request.startsWith('GET /discover')) {
              this.sendJsonResponse(socket, {
                status: 'live',
                fileName: 'Live System Audio',
                isLive: true,
              });
              return;
            } else if (request.startsWith('GET /ping')) {
              this.sendJsonResponse(socket, { hostTime: Date.now() });
              return;
            } else if (request.startsWith('GET /live') || request.startsWith('STREAM')) {
              isStreamClient = true;
              this.audioSockets.add(socket);
              console.log(`[HostServer] 🎧 Listener connected to stream. Active listeners: ${this.audioSockets.size}`);
              const header =
                `HTTP/1.1 200 OK\r\n` +
                `Content-Type: audio/pcm\r\n` +
                `Connection: keep-alive\r\n\r\n`;
              socket.write(header);
              return;
            }

            console.warn(`[HostServer] Unrecognized request: "${request.substring(0, 60)}"`);
          });

          const cleanupSocket = () => {
            if (this.audioSockets.has(socket)) {
              this.audioSockets.delete(socket);
              console.log(`[HostServer] 🔌 Listener disconnected. Active listeners: ${this.audioSockets.size}`);
            }
          };

          socket.on('close', cleanupSocket);
          socket.on('error', cleanupSocket);
          socket.on('end', cleanupSocket);
        });

        if (this.server && typeof this.server.listen === 'function') {
          this.server.listen({ port: FILE_PORT, host: '0.0.0.0' }, () => {
            console.log(`[HostServer] ✅ Native TCP Server active on 0.0.0.0:${FILE_PORT}`);
          });

          this.server.on('error', (err) => {
            console.error(`[HostServer] ❌ Server error:`, err?.message || err);
          });
        }
      } catch (err) {
        console.error('[HostServer] Failed to initialize native TCP socket:', err);
      }
    } else {
      console.warn('[HostServer] ⚠️ TCP Server is running in web browser fallback mode.');
    }
  }

  sendJsonResponse(socket, data) {
    const body = JSON.stringify(data);
    const header =
      `HTTP/1.1 200 OK\r\n` +
      `Content-Type: application/json\r\n` +
      `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n` +
      `Connection: close\r\n\r\n`;

    socket.write(header + body, 'utf8', () => {
      try {
        socket.end();
      } catch (e) {}
    });
  }

  broadcastAudioChunk(pcmBuffer) {
    if (this.audioSockets.size === 0) return;

    const header = Buffer.alloc(4);
    header.writeUInt32BE(pcmBuffer.length, 0);
    const frame = Buffer.concat([header, pcmBuffer]);

    for (const socket of this.audioSockets) {
      try {
        socket.write(frame);
      } catch (e) {
        this.audioSockets.delete(socket);
      }
    }

    this.broadcastFrameCount++;
    this.broadcastByteCount += pcmBuffer.length;
    const now = Date.now();
    if (now - this.lastBroadcastLogAt >= 3000) {
      console.log(
        `[HostServer] Broadcast ${this.broadcastFrameCount} audio frames (${this.broadcastByteCount} bytes) to ${this.audioSockets.size} listener(s)`
      );
      this.lastBroadcastLogAt = now;
    }
  }

  stop() {
    console.log('[HostServer] 🛑 Stopping live broadcast server...');
    this.isBroadcasting = false;

    AudioCaptureBridge.stopCapture();

    if (typeof window !== 'undefined' && window.electronAPI?.stopTcpServer) {
      window.electronAPI.stopTcpServer().catch(() => {});
    }

    for (const socket of this.audioSockets) {
      try {
        socket.destroy();
      } catch (e) {}
    }
    this.audioSockets.clear();

    if (this.server) {
      try {
        this.server.close();
      } catch (e) {}
      this.server = null;
    }

    console.log('[HostServer] ✅ Live server stopped.');
  }
}
