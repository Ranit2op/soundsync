import * as Network from 'expo-network';
import TcpSocket from 'react-native-tcp-socket';
import { Platform } from 'react-native';
import { Buffer } from 'buffer';
import { AudioPlayerBridge } from '../native/AudioPlayerBridge';

const FILE_PORT = 8990;
const STREAM_SAMPLE_RATE = 44100;
const STREAM_IS_STEREO = false;
const AUDIO_LOG_PREFIX = '[ListenerAudioPipeline]';

const isElectronDesktop = () =>
  typeof window !== 'undefined' && window.electronAPI != null;

export class ListenerClient {
  hostIp = '';
  clientSocket = null;
  scanAbortController = null;
  incomingBuffer = Buffer.alloc(0);
  isConnected = false;
  onDisconnectCallback = null;
  receivedFrameCount = 0;
  receivedByteCount = 0;
  receivedSocketChunkCount = 0;
  lastReceiveLogAt = 0;

  async discoverHosts(onHostDiscovered, onProgress) {
    this.stopScan();
    this.scanAbortController = new AbortController();
    const signal = this.scanAbortController.signal;

    let localIp;
    if (isElectronDesktop()) {
      localIp = await window.electronAPI.getLanIp();
    } else {
      localIp = await Network.getIpAddressAsync();
    }
    console.log('[ListenerClient] Local IP:', localIp);
    const parts = localIp.split('.');
    if (parts.length !== 4) throw new Error(`Invalid local IPv4 address: ${localIp}`);
    const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
    const localOctet = parseInt(parts[3], 10);

    const targetOctets = [];
    let diff = 1;
    while (targetOctets.length < 253) {
      const left = localOctet - diff;
      const right = localOctet + diff;
      if (left >= 1 && left <= 254 && left !== localOctet) targetOctets.push(left);
      if (right >= 1 && right <= 254 && right !== localOctet) targetOctets.push(right);
      diff++;
    }

    const CONCURRENCY = 15;
    let targetIndex = 0;
    let activeCount = 0;
    let completedCount = 0;

    return new Promise((resolve) => {
      const launchNext = () => {
        if (signal.aborted) {
          resolve();
          return;
        }

        while (activeCount < CONCURRENCY && targetIndex < targetOctets.length) {
          if (signal.aborted) break;

          const currentOctet = targetOctets[targetIndex++];
          const testIp = `${subnet}.${currentOctet}`;
          activeCount++;

          this.probeHttpDetails(testIp, signal)
            .then((hostInfo) => {
              if (signal.aborted) return;
              if (hostInfo) {
                onHostDiscovered?.(hostInfo);
              }
            })
            .catch(() => {})
            .finally(() => {
              activeCount--;
              completedCount++;
              onProgress?.(completedCount, targetOctets.length);

              if (signal.aborted || completedCount >= targetOctets.length) {
                resolve();
                return;
              }
              launchNext();
            });
        }
      };

      launchNext();
    });
  }

  stopScan() {
    if (this.scanAbortController) {
      this.scanAbortController.abort();
      this.scanAbortController = null;
    }
  }

  async probeHttpDetails(ip, externalSignal) {
    if (externalSignal?.aborted) return null;

    // On Electron desktop: use IPC to bypass CORS restrictions
    if (isElectronDesktop()) {
      try {
        const result = await window.electronAPI.probeHost({ ip, port: FILE_PORT, timeoutMs: 2000 });
        return result;
      } catch (e) {
        return null;
      }
    }

    // On Android/iOS: use standard fetch (no CORS issue on native)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort);

    try {
      const res = await fetch(`http://${ip}:${FILE_PORT}/discover`, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        return {
          ip,
          fileName: data.fileName || 'Live System Audio',
          isLive: data.isLive ?? true,
        };
      }
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
    return null;
  }

  async connect(hostIp, onConnected, onDisconnect) {
    console.log(`[ListenerClient] 🚀 Connecting to Host IP: ${hostIp}`);
    this.hostIp = hostIp;
    this.onDisconnectCallback = onDisconnect;
    this.incomingBuffer = Buffer.alloc(0);
    this.receivedFrameCount = 0;
    this.receivedByteCount = 0;
    this.receivedSocketChunkCount = 0;
    this.lastReceiveLogAt = Date.now();

    const hostDetails = await this.probeHttpDetails(hostIp);
    if (!hostDetails) {
      throw new Error(`Host at ${hostIp} is not broadcasting.`);
    }

    // Electron Desktop path: all TCP is handled in the main process via IPC
    if (isElectronDesktop()) {
      await AudioPlayerBridge.startPlayer(STREAM_SAMPLE_RATE, STREAM_IS_STEREO ? 2 : 1);

      window.electronAPI.removeAudioChunkListener?.();
      window.electronAPI.removeListenerDisconnectedListener?.();

      window.electronAPI.onAudioChunk((base64Chunk) => {
        AudioPlayerBridge.writeChunk(base64Chunk).catch((e) => {
          console.warn(`${AUDIO_LOG_PREFIX} writeChunk failed:`, e?.message || e);
        });
      });

      window.electronAPI.onListenerDisconnected(() => {
        if (this.isConnected) {
          this.isConnected = false;
          AudioPlayerBridge.stopPlayer().catch(() => {});
          const cb = this.onDisconnectCallback;
          this.onDisconnectCallback = null;
          cb?.();
        }
      });

      await window.electronAPI.connectToHost({ ip: hostIp, port: FILE_PORT });
      this.isConnected = true;
      onConnected?.();
      return;
    }

    // Android path: AudioPlayerBridge handles native AudioTrack
    if (Platform.OS === 'android') {
      await AudioPlayerBridge.startPlayer(STREAM_SAMPLE_RATE, STREAM_IS_STEREO ? 2 : 1);
    }

    // Android/iOS: use react-native-tcp-socket
    return new Promise((resolve, reject) => {
      let isHeaderPassed = false;
      let headerBuffer = Buffer.alloc(0);

      this.clientSocket = TcpSocket.createConnection({
        port: FILE_PORT,
        host: hostIp,
      }, () => {
        console.log(`[ListenerClient] ✅ TCP socket connected. Requesting live stream...`);
        this.clientSocket.write('GET /live HTTP/1.1\r\nHost: ' + hostIp + '\r\n\r\n');
        this.isConnected = true;
        onConnected?.();
        resolve();
      });

      this.clientSocket.on('data', (data) => {
        const dataBuffer = Buffer.from(data);
        this.receivedSocketChunkCount++;

        if (!isHeaderPassed) {
          headerBuffer = Buffer.concat([headerBuffer, dataBuffer]);
          const headerIndex = headerBuffer.indexOf('\r\n\r\n');
          if (headerIndex !== -1) {
            isHeaderPassed = true;
            const audioData = headerBuffer.slice(headerIndex + 4);
            headerBuffer = null;
            if (audioData.length > 0) {
              this.processIncomingAudio(audioData);
            }
            return;
          }
          if (headerBuffer.length > 4096) {
            console.error(`${AUDIO_LOG_PREFIX} ❌ HTTP header exceeded 4096 bytes; aborting`);
            this.disconnect();
            return;
          }
          return;
        }

        this.processIncomingAudio(dataBuffer);
      });

      const handleCloseOrError = (err) => {
        if (this.isConnected) {
          console.log('[ListenerClient] 🛑 Disconnected from stream:', err?.message || 'Connection closed');
          this.disconnect();
        }
      };

      this.clientSocket.on('error', (err) => {
        console.error(`${AUDIO_LOG_PREFIX} TCP socket error:`, err?.message || err);
        if (!this.isConnected) {
          reject(new Error(`Failed to connect to host: ${err.message}`));
        } else {
          handleCloseOrError(err);
        }
      });

      this.clientSocket.on('close', () => handleCloseOrError(null));
      this.clientSocket.on('end', () => handleCloseOrError(null));
    });
  }

  processIncomingAudio(chunkBuffer) {
    this.incomingBuffer = Buffer.concat([this.incomingBuffer, chunkBuffer]);

    while (this.incomingBuffer.length >= 4) {
      const payloadLen = this.incomingBuffer.readUInt32BE(0);

      if (payloadLen <= 0) {
        this.incomingBuffer = this.incomingBuffer.slice(4);
        continue;
      }

      if (this.incomingBuffer.length >= 4 + payloadLen) {
        const payload = this.incomingBuffer.slice(4, 4 + payloadLen);
        this.incomingBuffer = this.incomingBuffer.slice(4 + payloadLen);

        try {
          const base64Chunk = payload.toString('base64');
          AudioPlayerBridge.writeChunk(base64Chunk).catch((e) => {
            console.warn(`${AUDIO_LOG_PREFIX} writeChunk failed:`, e?.message || e);
          });
        } catch (e) {
          console.warn(`${AUDIO_LOG_PREFIX} writeChunk error:`, e?.message || e);
        }

        this.receivedFrameCount++;
        this.receivedByteCount += payload.length;
        const now = Date.now();
        if (now - this.lastReceiveLogAt >= 3000) {
          console.log(
            `[ListenerClient] Received ${this.receivedFrameCount} audio frames (${this.receivedByteCount} bytes)`
          );
          this.lastReceiveLogAt = now;
        }
      } else {
        break;
      }
    }
  }

  disconnect() {
    this.stopScan();
    this.isConnected = false;

    if (isElectronDesktop()) {
      window.electronAPI.removeAudioChunkListener?.();
      window.electronAPI.removeListenerDisconnectedListener?.();
      window.electronAPI.disconnectFromHost?.().catch(() => {});
    } else if (this.clientSocket) {
      try {
        this.clientSocket.destroy();
      } catch (e) {}
      this.clientSocket = null;
    }

    AudioPlayerBridge.stopPlayer().catch(() => {});

    this.incomingBuffer = Buffer.alloc(0);

    if (this.onDisconnectCallback) {
      const cb = this.onDisconnectCallback;
      this.onDisconnectCallback = null;
      cb();
    }
  }
}
