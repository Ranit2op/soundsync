import * as Network from 'expo-network';
import TcpSocket from 'react-native-tcp-socket';
import { NativeModules, Platform } from 'react-native';
import { Buffer } from 'buffer';

const FILE_PORT = 8990;
const STREAM_SAMPLE_RATE = 44100;
const STREAM_IS_STEREO = false;
const { AudioPlayerModule } = NativeModules;
const AUDIO_LOG_PREFIX = '[ListenerAudioPipeline]';

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

    const localIp = await Network.getIpAddressAsync();
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

    // Initialize native audio player (AudioTrack)
    if (Platform.OS === 'android' && AudioPlayerModule) {
      console.log(
        `${AUDIO_LOG_PREFIX} Initializing AudioTrack: sampleRate=${STREAM_SAMPLE_RATE}, stereo=${STREAM_IS_STEREO}`
      );
      await AudioPlayerModule.initPlayer(STREAM_SAMPLE_RATE, STREAM_IS_STEREO);
      console.log(`${AUDIO_LOG_PREFIX} AudioTrack init resolved successfully`);
    } else if (Platform.OS === 'android') {
      console.error(`${AUDIO_LOG_PREFIX} AudioPlayerModule is missing`);
      throw new Error('AudioPlayerModule is not available in this build.');
    }

    // Establish TCP connection for real-time streaming
    return new Promise((resolve, reject) => {
      let isHeaderPassed = false;
      // Accumulate header bytes across TCP chunks — the HTTP response header
      // may be fragmented across multiple 'data' events by react-native-tcp-socket
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
        console.log(
          `${AUDIO_LOG_PREFIX} TCP chunk #${this.receivedSocketChunkCount} received: ${dataBuffer.length} bytes`
        );

        if (!isHeaderPassed) {
          // Accumulate into header buffer to handle fragmented HTTP headers
          headerBuffer = Buffer.concat([headerBuffer, dataBuffer]);
          console.log(
            `${AUDIO_LOG_PREFIX} Header accumulation buffer: ${headerBuffer.length} bytes total`
          );

          // Look for HTTP response header delimiter \r\n\r\n in the accumulated buffer
          const headerIndex = headerBuffer.indexOf('\r\n\r\n');
          if (headerIndex !== -1) {
            isHeaderPassed = true;
            const audioData = headerBuffer.slice(headerIndex + 4);
            const headerText = headerBuffer.slice(0, headerIndex).toString();
            console.log(
              `${AUDIO_LOG_PREFIX} ✅ Stream header parsed (${headerIndex} bytes): "${headerText.substring(0, 80)}..."; initial audio bytes=${audioData.length}`
            );
            // Free the header buffer — no longer needed
            headerBuffer = null;
            if (audioData.length > 0) {
              this.processIncomingAudio(audioData);
            } else {
              console.log(`${AUDIO_LOG_PREFIX} Header chunk contained no audio payload`);
            }
            return;
          }

          // Safety: prevent unbounded buffering if header never arrives
          if (headerBuffer.length > 4096) {
            console.error(
              `${AUDIO_LOG_PREFIX} ❌ HTTP header exceeded 4096 bytes without delimiter; aborting`
            );
            this.disconnect();
            return;
          }

          console.log(
            `${AUDIO_LOG_PREFIX} Waiting for complete stream header; accumulated=${headerBuffer.length} bytes`
          );
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
    console.log(
      `${AUDIO_LOG_PREFIX} Processing audio network payload: ${chunkBuffer.length} bytes; previousBuffer=${this.incomingBuffer.length}`
    );
    this.incomingBuffer = Buffer.concat([this.incomingBuffer, chunkBuffer]);
    console.log(`${AUDIO_LOG_PREFIX} Framing buffer size after append: ${this.incomingBuffer.length} bytes`);

    while (this.incomingBuffer.length >= 4) {
      const payloadLen = this.incomingBuffer.readUInt32BE(0);
      console.log(
        `${AUDIO_LOG_PREFIX} Next frame declares payload=${payloadLen} bytes; available=${this.incomingBuffer.length - 4} bytes`
      );

      if (payloadLen <= 0) {
        console.warn(`${AUDIO_LOG_PREFIX} Invalid empty audio frame encountered; dropping 4-byte header`);
        this.incomingBuffer = this.incomingBuffer.slice(4);
        continue;
      }

      // If buffer contains complete frame
      if (this.incomingBuffer.length >= 4 + payloadLen) {
        const payload = this.incomingBuffer.slice(4, 4 + payloadLen);
        this.incomingBuffer = this.incomingBuffer.slice(4 + payloadLen);
        const nextFrameNumber = this.receivedFrameCount + 1;
        console.log(
          `${AUDIO_LOG_PREFIX} Audio frame #${nextFrameNumber} received: ${payload.length} PCM bytes; remainingBuffer=${this.incomingBuffer.length}`
        );

        if (Platform.OS === 'android' && AudioPlayerModule) {
          try {
            const base64Chunk = payload.toString('base64');
            console.log(
              `${AUDIO_LOG_PREFIX} Audio frame #${nextFrameNumber} encoded for native bridge: base64Length=${base64Chunk.length}`
            );

            AudioPlayerModule.writeChunk(base64Chunk)
              .then((result) => {
                console.log(
                  `${AUDIO_LOG_PREFIX} Audio frame #${nextFrameNumber} writeChunk resolved: ${JSON.stringify(result)}`
                );
              })
              .catch((e) => {
                console.warn(
                  `${AUDIO_LOG_PREFIX} Audio frame #${nextFrameNumber} writeChunk failed:`,
                  e?.message || e
                );
              });
          } catch (e) {
            console.warn(
              `${AUDIO_LOG_PREFIX} Audio frame #${nextFrameNumber} failed before native write:`,
              e?.message || e
            );
          }
        } else if (Platform.OS === 'android') {
          console.warn(`${AUDIO_LOG_PREFIX} Cannot write frame #${nextFrameNumber}; AudioPlayerModule unavailable`);
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
        // Wait for remaining frame data
        console.log(
          `${AUDIO_LOG_PREFIX} Incomplete audio frame; waiting for ${4 + payloadLen - this.incomingBuffer.length} more bytes`
        );
        break;
      }
    }
  }

  disconnect() {
    this.stopScan();
    this.isConnected = false;

    if (this.clientSocket) {
      try {
        this.clientSocket.destroy();
      } catch (e) {}
      this.clientSocket = null;
    }

    if (Platform.OS === 'android' && AudioPlayerModule) {
      AudioPlayerModule.stopPlayer().catch(() => {});
    }

    this.incomingBuffer = Buffer.alloc(0);

    if (this.onDisconnectCallback) {
      const cb = this.onDisconnectCallback;
      this.onDisconnectCallback = null;
      cb();
    }
  }
}
