import { NativeModules, DeviceEventEmitter, Platform } from 'react-native';
import { Buffer } from 'buffer';

const { AudioCaptureModule } = NativeModules;

export class AudioCaptureBridge {
  static captureSubscription = null;
  static errorSubscription = null;
  static desktopMediaStream = null;
  static desktopAudioContext = null;
  static desktopScriptProcessor = null;

  static async startCapture(onAudioChunk, onError) {
    if (Platform.OS === 'android' && AudioCaptureModule) {
      // Android Native Implementation
      this.captureSubscription = DeviceEventEmitter.addListener('onAudioChunk', (event) => {
        onAudioChunk?.(event.pcm);
      });

      this.errorSubscription = DeviceEventEmitter.addListener('onCaptureError', (event) => {
        onError?.(event.message);
      });

      try {
        await AudioCaptureModule.startCapture();
        console.log('[AudioCaptureBridge] Android capture started.');
      } catch (e) {
        console.error('[AudioCaptureBridge] Android startCapture failed:', e);
        throw e;
      }
    } else if (typeof window !== 'undefined' && navigator.mediaDevices) {
      // Desktop / Web (Electron / Browser) Implementation
      try {
        console.log('[AudioCaptureBridge] Initializing Desktop Audio Capture...');

        let stream = null;
        if (window.electronAPI?.getDesktopSourceId) {
          // If running inside Electron desktop app with desktopCapturer API
          const sourceId = await window.electronAPI.getDesktopSourceId();
          if (sourceId) {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: sourceId,
                },
              },
              video: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: sourceId,
                },
              },
            });
            // Stop video tracks since only system audio is needed for broadcasting
            stream.getVideoTracks().forEach((track) => track.stop());
          }
        }

        if (!stream) {
          // Fallback to Web standard userMedia or displayMedia
          if (navigator.mediaDevices.getDisplayMedia) {
            stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
            stream.getVideoTracks().forEach((track) => track.stop());
          } else {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          }
        }

        this.desktopMediaStream = stream;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.desktopAudioContext = new AudioContextClass({ sampleRate: 44100 });
        const sourceNode = this.desktopAudioContext.createMediaStreamSource(stream);

        // Process audio in chunks (4096 frames at 44100Hz = ~93ms per chunk)
        const bufferSize = 4096;
        const scriptNode = this.desktopAudioContext.createScriptProcessor(bufferSize, 1, 1);
        this.desktopScriptProcessor = scriptNode;

        scriptNode.onaudioprocess = (audioProcessingEvent) => {
          const inputBuffer = audioProcessingEvent.inputBuffer;
          const inputData = inputBuffer.getChannelData(0); // Mono channel 0

          // Convert Float32 (-1.0 to +1.0) to 16-bit PCM (signed Int16)
          const pcm16Data = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            pcm16Data[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }

          const byteBuffer = Buffer.from(pcm16Data.buffer);
          const base64Data = byteBuffer.toString('base64');
          onAudioChunk?.(base64Data);
        };

        sourceNode.connect(scriptNode);
        scriptNode.connect(this.desktopAudioContext.destination);
        console.log('[AudioCaptureBridge] Desktop audio capture running.');
      } catch (err) {
        console.error('[AudioCaptureBridge] Desktop audio capture error:', err);
        onError?.(err?.message || 'Failed to capture desktop audio');
        throw err;
      }
    } else {
      const err = 'Audio capture is not supported on this platform';
      console.warn('[AudioCaptureBridge]', err);
      onError?.(err);
      throw new Error(err);
    }
  }

  static stopCapture() {
    if (Platform.OS === 'android' && AudioCaptureModule) {
      if (this.captureSubscription) {
        this.captureSubscription.remove();
        this.captureSubscription = null;
      }
      if (this.errorSubscription) {
        this.errorSubscription.remove();
        this.errorSubscription = null;
      }
      AudioCaptureModule.stopCapture().catch(() => {});
    }

    if (this.desktopScriptProcessor) {
      try {
        this.desktopScriptProcessor.disconnect();
      } catch (e) {}
      this.desktopScriptProcessor = null;
    }

    if (this.desktopAudioContext) {
      try {
        this.desktopAudioContext.close();
      } catch (e) {}
      this.desktopAudioContext = null;
    }

    if (this.desktopMediaStream) {
      try {
        this.desktopMediaStream.getTracks().forEach((track) => track.stop());
      } catch (e) {}
      this.desktopMediaStream = null;
    }

    console.log('[AudioCaptureBridge] Capture stopped.');
  }
}
