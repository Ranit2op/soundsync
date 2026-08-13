import { NativeModules, Platform } from 'react-native';
import { Buffer } from 'buffer';

const getNativeAudioPlayer = () => NativeModules?.AudioPlayerModule;

export class AudioPlayerBridge {
  static desktopAudioContext = null;
  static desktopGainNode = null;
  static desktopNextStartTime = 0;
  static lastLogTime = 0;

  static async startPlayer(sampleRate = 44100, channels = 1) {
    const playerModule = getNativeAudioPlayer();
    if (Platform.OS === 'android' && playerModule?.initPlayer) {
      try {
        // Kotlin native module signature: initPlayer(sampleRate: Int, isStereo: Boolean)
        const isStereo = channels >= 2;
        return await playerModule.initPlayer(sampleRate, isStereo);
      } catch (e) {
        console.error('[AudioPlayerBridge] Native initPlayer error:', e);
      }
    }

    // Fallback to Web Audio API (Web / Electron / Browser / Expo Web)
    if (typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        if (!this.desktopAudioContext || this.desktopAudioContext.state === 'closed') {
          this.desktopAudioContext = new AudioContextClass({ sampleRate });
        }
        if (this.desktopAudioContext.state === 'suspended') {
          await this.desktopAudioContext.resume();
        }

        if (!this.desktopGainNode && this.desktopAudioContext) {
          const gainNode = this.desktopAudioContext.createGain();
          gainNode.gain.value = 1.0;
          gainNode.connect(this.desktopAudioContext.destination);
          this.desktopGainNode = gainNode;
        }

        this.desktopNextStartTime = this.desktopAudioContext.currentTime;
        console.log(`[AudioPlayerBridge] Web AudioContext initialized (state: ${this.desktopAudioContext.state}, sampleRate: ${this.desktopAudioContext.sampleRate})`);
      }
    }
  }

  static async writeChunk(base64Pcm) {
    const playerModule = getNativeAudioPlayer();
    if (Platform.OS === 'android' && playerModule?.writeChunk) {
      try {
        return await playerModule.writeChunk(base64Pcm);
      } catch (e) {
        console.error('[AudioPlayerBridge] Native writeChunk error:', e);
      }
    } else if (this.desktopAudioContext) {
      try {
        if (this.desktopAudioContext.state === 'suspended') {
          this.desktopAudioContext.resume().catch(() => {});
        }

        const pcmBuffer = Buffer.from(base64Pcm, 'base64');
        if (pcmBuffer.byteLength < 2) return;

        // Safe 16-bit PCM decoding via DataView (handles unaligned byteOffsets cleanly)
        const dataView = new DataView(
          pcmBuffer.buffer,
          pcmBuffer.byteOffset,
          pcmBuffer.byteLength
        );
        const sampleCount = Math.floor(pcmBuffer.byteLength / 2);
        const float32Array = new Float32Array(sampleCount);

        let sumSquares = 0;
        for (let i = 0; i < sampleCount; i++) {
          const int16 = dataView.getInt16(i * 2, true); // Little-endian Int16
          const s = int16 < 0 ? int16 / 32768.0 : int16 / 32767.0;
          sumSquares += s * s;
          float32Array[i] = s;
        }

        // Fix: audio buffer was recorded at 44100Hz. Specify 44100 so Web Audio API resamples correctly
        const STREAM_SAMPLE_RATE = 44100;
        const audioBuffer = this.desktopAudioContext.createBuffer(1, float32Array.length, STREAM_SAMPLE_RATE);
        audioBuffer.getChannelData(0).set(float32Array);

        const source = this.desktopAudioContext.createBufferSource();
        source.buffer = audioBuffer;

        if (!this.desktopGainNode) {
          const gainNode = this.desktopAudioContext.createGain();
          gainNode.gain.value = 1.0;
          gainNode.connect(this.desktopAudioContext.destination);
          this.desktopGainNode = gainNode;
        }

        source.connect(this.desktopGainNode);

        const now = this.desktopAudioContext.currentTime;
        if (this.desktopNextStartTime < now) {
          // If queue fell behind or initial frame, set a smooth 50ms jitter buffer
          this.desktopNextStartTime = now + 0.05;
        }

        source.start(this.desktopNextStartTime);
        this.desktopNextStartTime += audioBuffer.duration;

        const currentTime = Date.now();
        if (currentTime - this.lastLogTime >= 5000) {
          this.lastLogTime = currentTime;
          const rms = Math.sqrt(sumSquares / sampleCount);
          console.log(
            `[AudioPlayerBridge] 🔊 Playing audio chunk RMS: ${rms.toFixed(5)} (AudioContext state: ${this.desktopAudioContext.state})`
          );
        }
      } catch (e) {
        console.error('[AudioPlayerBridge] Web writeChunk error:', e);
      }
    }
  }

  static async stopPlayer() {
    const playerModule = getNativeAudioPlayer();
    if (Platform.OS === 'android' && playerModule?.stopPlayer) {
      try {
        return await playerModule.stopPlayer();
      } catch (_e) {}
    } else if (this.desktopAudioContext) {
      if (this.desktopGainNode) {
        try {
          this.desktopGainNode.disconnect();
        } catch (_e) {}
        this.desktopGainNode = null;
      }
      try {
        await this.desktopAudioContext.close();
      } catch (_e) {}
      this.desktopAudioContext = null;
      this.desktopNextStartTime = 0;
      console.log('[AudioPlayerBridge] Web AudioContext closed');
    }
  }
}
