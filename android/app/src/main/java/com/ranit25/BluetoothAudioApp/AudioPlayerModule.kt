package com.ranit25.BluetoothAudioApp

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AudioPlayerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "AudioPlayerModule"
    }

    private var audioTrack: AudioTrack? = null
    private var isInitialized = false
    private var totalChunksWritten: Long = 0
    private var totalBytesDecoded: Long = 0
    private var totalBytesWritten: Long = 0
    private var writeErrorCount: Long = 0
    private var lastThroughputLogAt: Long = 0

    override fun getName(): String = "AudioPlayerModule"

    @ReactMethod
    fun initPlayer(sampleRate: Int, isStereo: Boolean, promise: Promise) {
        try {
            Log.i(TAG, "[Pipeline] initPlayer called: sampleRate=$sampleRate, stereo=$isStereo")
            stopPlayerInternal()

            // Reset counters for this session
            totalChunksWritten = 0
            totalBytesDecoded = 0
            totalBytesWritten = 0
            writeErrorCount = 0
            lastThroughputLogAt = System.currentTimeMillis()

            val channelConfig = if (isStereo) AudioFormat.CHANNEL_OUT_STEREO else AudioFormat.CHANNEL_OUT_MONO
            val encoding = AudioFormat.ENCODING_PCM_16BIT
            val minBufferSize = AudioTrack.getMinBufferSize(sampleRate, channelConfig, encoding)
            Log.d(TAG, "[Pipeline] AudioTrack.getMinBufferSize=$minBufferSize (sampleRate=$sampleRate, channelConfig=$channelConfig, encoding=$encoding)")

            if (minBufferSize <= 0) {
                Log.e(TAG, "[Pipeline] ❌ Invalid minBufferSize=$minBufferSize; rejecting init")
                promise.reject("INIT_ERROR", "Invalid AudioTrack min buffer size: $minBufferSize")
                return
            }
            val bufferSize = Math.max(minBufferSize, 4096 * 4)
            Log.d(TAG, "[Pipeline] Effective bufferSize=$bufferSize (minBufferSize=$minBufferSize)")

            audioTrack = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                AudioTrack.Builder()
                    .setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                            .build()
                    )
                    .setAudioFormat(
                        AudioFormat.Builder()
                            .setEncoding(encoding)
                            .setSampleRate(sampleRate)
                            .setChannelMask(channelConfig)
                            .build()
                    )
                    .setBufferSizeInBytes(bufferSize)
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .build()
            } else {
                @Suppress("DEPRECATION")
                AudioTrack(
                    AudioManager.STREAM_MUSIC,
                    sampleRate,
                    channelConfig,
                    encoding,
                    bufferSize,
                    AudioTrack.MODE_STREAM
                )
            }

            val trackState = audioTrack?.state
            Log.d(TAG, "[Pipeline] AudioTrack created; state=$trackState (expected ${AudioTrack.STATE_INITIALIZED})")

            if (trackState != AudioTrack.STATE_INITIALIZED) {
                Log.e(TAG, "[Pipeline] ❌ AudioTrack state=$trackState, not STATE_INITIALIZED; rejecting")
                promise.reject("INIT_ERROR", "AudioTrack failed to initialize (state=$trackState)")
                stopPlayerInternal()
                return
            }

            audioTrack?.play()
            val playState = audioTrack?.playState
            Log.d(TAG, "[Pipeline] AudioTrack.play() called; playState=$playState (expected ${AudioTrack.PLAYSTATE_PLAYING})")

            if (playState != AudioTrack.PLAYSTATE_PLAYING) {
                Log.e(TAG, "[Pipeline] ❌ AudioTrack playState=$playState, not PLAYSTATE_PLAYING; rejecting")
                promise.reject("INIT_ERROR", "AudioTrack failed to start playback (playState=$playState)")
                stopPlayerInternal()
                return
            }
            isInitialized = true
            Log.i(TAG, "[Pipeline] ✅ AudioTrack initialized successfully at ${sampleRate}Hz, stereo=$isStereo, bufferSize=$bufferSize")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "[Pipeline] ❌ Exception during initPlayer", e)
            promise.reject("INIT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun writeChunk(base64Chunk: String, promise: Promise) {
        if (!isInitialized || audioTrack == null) {
            Log.w(TAG, "[Pipeline] writeChunk called but player not initialized (isInitialized=$isInitialized, audioTrack=${audioTrack != null}); dropping chunk")
            promise.resolve(false)
            return
        }
        try {
            val pcmBytes = Base64.decode(base64Chunk, Base64.NO_WRAP)
            totalBytesDecoded += pcmBytes.size

            if (pcmBytes.isEmpty()) {
                Log.w(TAG, "[Pipeline] writeChunk: decoded 0 PCM bytes from base64 (base64Length=${base64Chunk.length}); skipping write")
                promise.resolve(true)
                return
            }

            val trackPlayState = audioTrack?.playState
            val bytesWritten = audioTrack?.write(pcmBytes, 0, pcmBytes.size) ?: 0

            if (bytesWritten < 0) {
                writeErrorCount++
                Log.e(TAG, "[Pipeline] ❌ AudioTrack.write returned error code=$bytesWritten (pcmSize=${pcmBytes.size}, playState=$trackPlayState); errorCount=$writeErrorCount")
                promise.reject("WRITE_ERROR", "AudioTrack write failed: errorCode=$bytesWritten")
                return
            }

            totalChunksWritten++
            totalBytesWritten += bytesWritten

            // Per-chunk debug log (every chunk — can be noisy; use logcat filtering)
            Log.v(TAG, "[Pipeline] writeChunk #$totalChunksWritten: decoded=${pcmBytes.size}B, written=${bytesWritten}B, playState=$trackPlayState")

            if (bytesWritten < pcmBytes.size) {
                Log.w(TAG, "[Pipeline] ⚠️ Partial write: wrote $bytesWritten of ${pcmBytes.size} bytes (chunk #$totalChunksWritten)")
            }

            // Periodic throughput summary (every ~3 seconds)
            val now = System.currentTimeMillis()
            if (now - lastThroughputLogAt >= 3000) {
                val elapsed = (now - lastThroughputLogAt) / 1000.0
                Log.i(TAG, "[Pipeline] 📊 Throughput: chunks=$totalChunksWritten, decoded=$totalBytesDecoded B, written=$totalBytesWritten B, errors=$writeErrorCount, last ${String.format("%.1f", elapsed)}s")
                lastThroughputLogAt = now
            }

            promise.resolve(true)
        } catch (e: Exception) {
            writeErrorCount++
            Log.e(TAG, "[Pipeline] ❌ Exception in writeChunk (chunk #${totalChunksWritten + 1}, errors=$writeErrorCount)", e)
            promise.reject("WRITE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopPlayer(promise: Promise) {
        stopPlayerInternal()
        promise.resolve(true)
    }

    private fun stopPlayerInternal() {
        Log.i(TAG, "[Pipeline] stopPlayerInternal called; session stats: chunks=$totalChunksWritten, decoded=$totalBytesDecoded B, written=$totalBytesWritten B, errors=$writeErrorCount")
        try {
            if (audioTrack != null) {
                val state = audioTrack?.state
                val playState = audioTrack?.playState
                Log.d(TAG, "[Pipeline] Stopping AudioTrack (state=$state, playState=$playState)")
                if (state == AudioTrack.STATE_INITIALIZED) {
                    audioTrack?.stop()
                    audioTrack?.flush()
                    Log.d(TAG, "[Pipeline] AudioTrack stop() + flush() completed")
                }
                audioTrack?.release()
                Log.d(TAG, "[Pipeline] AudioTrack released")
            }
        } catch (e: Exception) {
            Log.e(TAG, "[Pipeline] ❌ Exception during stopPlayerInternal", e)
        } finally {
            audioTrack = null
            isInitialized = false
            Log.i(TAG, "[Pipeline] ✅ AudioTrack stopped and released")
        }
    }
}
