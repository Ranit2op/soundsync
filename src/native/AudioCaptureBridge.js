import { NativeModules, DeviceEventEmitter, Platform } from 'react-native';
import { Buffer } from 'buffer';

const { AudioCaptureModule } = NativeModules;

export class AudioCaptureBridge {
  static captureSubscription = null;
  static errorSubscription = null;
  static desktopMediaStream = null;
  static desktopAudioContext = null;
  static desktopSourceNode = null;
  static desktopScriptProcessor = null;
  static desktopGainNode = null;

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
          // Electron 17+: getDisplayMedia() is intercepted by setDisplayMediaRequestHandler
          // in main.js, which supplies the desktop source automatically.
          try {
            stream = await navigator.mediaDevices.getDisplayMedia({
              audio: true,
              video: true,
            });
            stream.getVideoTracks().forEach((t) => t.stop());
          } catch (dmErr) {
            // getDisplayMedia rejects when macOS Screen Recording permission is denied.
            // Replace the cryptic "AbortError: Invalid capture constraints" with
            // a clear, actionable message the user can actually understand.
            const isMac = window.electronAPI?.platform === 'darwin';
            throw new Error(
              isMac
                ? 'Screen Recording permission is required to broadcast audio.\n\n' +
                  'How to fix:\n' +
                  '1. Open System Settings\n' +
                  '2. Go to Privacy & Security → Screen Recording\n' +
                  '3. Enable the toggle next to "Electron"\n' +
                  '4. Restart the app and try again.'
                : dmErr.message || 'Screen capture was denied. Check system permissions.'
            );
          }
        }

        if (!stream) {
          // Non-Electron web fallback (browser dev mode)
          if (navigator.mediaDevices.getDisplayMedia) {
            stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
            stream.getVideoTracks().forEach((track) => track.stop());
          } else {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          }
        }

        // --- macOS / Linux guard: if display media returns no live audio track,
        // fall back to getUserMedia audio input (microphone / default input)
        let audioTracks = stream.getAudioTracks().filter((t) => t.readyState === 'live');
        if (audioTracks.length === 0) {
          console.warn('[AudioCaptureBridge] ⚠️ System loopback stream returned 0 audio tracks. Attempting getUserMedia audio fallback...');
          try {
            const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            audioTracks = micStream.getAudioTracks().filter((t) => t.readyState === 'live');
            if (audioTracks.length > 0) {
              stream.getTracks().forEach((t) => t.stop());
              stream = micStream;
              console.log('[AudioCaptureBridge] ✅ Successfully acquired fallback audio stream from getUserMedia.');
            }
          } catch (micErr) {
            console.warn('[AudioCaptureBridge] Microphone fallback also failed:', micErr?.message || micErr);
          }
        }

        if (audioTracks.length === 0) {
          stream.getTracks().forEach((t) => t.stop());
          const isMac = window.electronAPI?.platform === 'darwin';
          const msg = isMac
            ? 'No system audio source found.\n\nOn macOS, system audio capture requires a virtual audio driver (e.g. BlackHole) or microphone permission. Please check Privacy & Security settings.'
            : 'No live audio tracks found in captured stream. Please check system audio input permissions.';
          throw new Error(msg);
        }

        this.desktopMediaStream = stream;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.desktopAudioContext = new AudioContextClass({ sampleRate: 44100 });

        if (this.desktopAudioContext.state === 'suspended') {
          await this.desktopAudioContext.resume();
        }

        const sourceNode = this.desktopAudioContext.createMediaStreamSource(stream);
        this.desktopSourceNode = sourceNode;

        // Process audio in chunks (4096 frames at 44100Hz = ~93ms per chunk)
        const bufferSize = 4096;
        const scriptNode = this.desktopAudioContext.createScriptProcessor(bufferSize, 1, 1);
        this.desktopScriptProcessor = scriptNode;

        let lastRmsLogTime = 0;

        scriptNode.onaudioprocess = (audioProcessingEvent) => {
          const inputBuffer = audioProcessingEvent.inputBuffer;
          const inputData = inputBuffer.getChannelData(0); // Mono channel 0

          let sumSquares = 0;
          const pcm16Data = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            sumSquares += s * s;
            pcm16Data[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }

          const now = Date.now();
          if (now - lastRmsLogTime >= 5000) {
            lastRmsLogTime = now;
            const rms = Math.sqrt(sumSquares / inputData.length);
            console.log(
              `[AudioCaptureBridge] 🎙️ Audio capture RMS volume: ${rms.toFixed(5)} (${rms > 0.0005 ? 'Sound Active' : 'Silence'})`
            );
          }

          const byteBuffer = Buffer.from(pcm16Data.buffer);
          const base64Data = byteBuffer.toString('base64');
          onAudioChunk?.(base64Data);
        };

        // Use a 0-gain node so Web Audio API processes scriptNode without playing audio back to host speakers
        const gainNode = this.desktopAudioContext.createGain();
        gainNode.gain.value = 0;
        this.desktopGainNode = gainNode;

        sourceNode.connect(scriptNode);
        scriptNode.connect(gainNode);
        gainNode.connect(this.desktopAudioContext.destination);

        console.log(`[AudioCaptureBridge] Desktop audio capture running (AudioContext state: ${this.desktopAudioContext.state}).`);
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
      } catch (_e) {}
      this.desktopScriptProcessor = null;
    }

    if (this.desktopSourceNode) {
      try {
        this.desktopSourceNode.disconnect();
      } catch (_e) {}
      this.desktopSourceNode = null;
    }

    if (this.desktopGainNode) {
      try {
        this.desktopGainNode.disconnect();
      } catch (_e) {}
      this.desktopGainNode = null;
    }

    if (this.desktopAudioContext) {
      try {
        this.desktopAudioContext.close();
      } catch (_e) {}
      this.desktopAudioContext = null;
    }

    if (this.desktopMediaStream) {
      try {
        this.desktopMediaStream.getTracks().forEach((track) => track.stop());
      } catch (_e) {}
      this.desktopMediaStream = null;
    }

    console.log('[AudioCaptureBridge] Capture stopped.');
  }
}
