import { NativeModules, Platform } from 'react-native';
import { Buffer } from 'buffer';

const getNativeAudioPlayer = () => NativeModules?.AudioPlayerModule;

export class AudioPlayerBridge {
  static desktopAudioContext = null;
  static desktopNextStartTime = 0;

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
        this.desktopNextStartTime = this.desktopAudioContext.currentTime;
        console.log('[AudioPlayerBridge] Web AudioContext initialized');
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
        const pcmBuffer = Buffer.from(base64Pcm, 'base64');
        const int16Array = new Int16Array(
          pcmBuffer.buffer,
          pcmBuffer.byteOffset,
          pcmBuffer.byteLength / 2
        );

        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
          float32Array[i] = int16Array[i] / 32768.0;
        }

        const sampleRate = this.desktopAudioContext.sampleRate || 44100;
        const audioBuffer = this.desktopAudioContext.createBuffer(1, float32Array.length, sampleRate);
        audioBuffer.getChannelData(0).set(float32Array);

        const source = this.desktopAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.desktopAudioContext.destination);

        const now = this.desktopAudioContext.currentTime;
        if (this.desktopNextStartTime < now) {
          this.desktopNextStartTime = now;
        }

        source.start(this.desktopNextStartTime);
        this.desktopNextStartTime += audioBuffer.duration;
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
      } catch (e) {}
    } else if (this.desktopAudioContext) {
      try {
        await this.desktopAudioContext.close();
      } catch (e) {}
      this.desktopAudioContext = null;
      this.desktopNextStartTime = 0;
      console.log('[AudioPlayerBridge] Web AudioContext closed');
    }
  }
}
