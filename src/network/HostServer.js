import TcpSocket from 'react-native-tcp-socket';
import { NativeModules, DeviceEventEmitter, Platform } from 'react-native';
import { Buffer } from 'buffer';

const FILE_PORT = 8990;
const { AudioCaptureModule } = NativeModules;
const HOST_LOG_PREFIX = '[HostAudioPipeline]';

export class HostServer {
  server = null;
  audioSockets = new Set();
  captureSubscription = null;
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

    // Listen for live audio chunks from native AudioCaptureModule via DeviceEventEmitter
    if (Platform.OS === 'android' && AudioCaptureModule) {
      this.captureSubscription = DeviceEventEmitter.addListener('onAudioChunk', (event) => {
        if (!this.isBroadcasting) return;
        
        if (this.audioSockets.size === 0) {
          // Log periodically when recording audio but no listeners are connected
          const now = Date.now();
          if (now - this.lastBroadcastLogAt >= 5000) {
            console.log(`${HOST_LOG_PREFIX} 🎙️ Audio captured from system, but 0 listeners connected currently.`);
            this.lastBroadcastLogAt = now;
          }
          return;
        }

        try {
          const pcmBuffer = Buffer.from(event.pcm, 'base64');
          console.log(`${HOST_LOG_PREFIX} Received captured PCM chunk from native: ${pcmBuffer.length} bytes (base64Len=${event.pcm.length})`);
          this.broadcastAudioChunk(pcmBuffer);
        } catch (e) {
          console.error(`${HOST_LOG_PREFIX} ❌ Error processing audio chunk:`, e);
        }
      });

      // ✅ NEW — native capture fail korle এই event ashbe
      this.errorSubscription = DeviceEventEmitter.addListener('onCaptureError', (event) => {
        console.error(`${HOST_LOG_PREFIX} ❌ Native capture failed:`, event.message);
        this.stop();
        onCaptureError?.(event.message);
      });

      // Request media projection permission & start capture
      try {
        await AudioCaptureModule.startCapture();
        console.log(`${HOST_LOG_PREFIX} ✅ Live system audio capture started`);
      } catch (e) {
        console.error(`${HOST_LOG_PREFIX} ❌ Failed to start live capture:`, e);
        throw e;
      }
    }

    this.startServer();
  }

  startServer() {
    this.server = TcpSocket.createServer((socket) => {
      let isStreamClient = false;
      // Accumulate request data to handle TCP fragmentation of the HTTP request
      let requestBuffer = '';

      socket.on('data', (data) => {
        if (isStreamClient) {
          // Already subscribed to stream; ignore further incoming data
          return;
        }

        requestBuffer += data.toString();

        // Wait until we have a complete HTTP request (ends with \r\n\r\n)
        if (!requestBuffer.includes('\r\n\r\n')) {
          console.log(`[HostServer] Partial request received, accumulating... (${requestBuffer.length} bytes)`);
          return;
        }

        const request = requestBuffer;
        // Clear the buffer since we have a complete request
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
          // Subscribe socket to live stream
          isStreamClient = true;
          this.audioSockets.add(socket);
          console.log(`[HostServer] 🎧 Listener connected to stream. Active listeners: ${this.audioSockets.size}`);
          
          // Send stream HTTP header response
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

    this.server.listen({ port: FILE_PORT, host: '0.0.0.0' }, () => {
      console.log(`[HostServer] ✅ Server active on 0.0.0.0:${FILE_PORT}`);
    });

    this.server.on('error', (err) => {
      console.error(`[HostServer] ❌ Server error:`, err?.message || err);
    });
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

    // Framing: 4-byte big endian length prefix followed by PCM payload
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

    if (this.captureSubscription) {
      this.captureSubscription.remove();
      this.captureSubscription = null;
    }

    if (this.errorSubscription) {           // ✅ NEW
      this.errorSubscription.remove();
      this.errorSubscription = null;
    }

    if (Platform.OS === 'android' && AudioCaptureModule) {
      AudioCaptureModule.stopCapture().catch(() => {});
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
