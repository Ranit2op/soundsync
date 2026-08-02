package com.ranit25.BluetoothAudioApp

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import android.util.Base64
import android.util.Log

class AudioCaptureService : Service() {

   companion object {
        const val ACTION_START = "com.ranit25.BluetoothAudioApp.START_CAPTURE"
        const val ACTION_STOP = "com.ranit25.BluetoothAudioApp.STOP_CAPTURE"
        const val EXTRA_RESULT_CODE = "EXTRA_RESULT_CODE"
        const val EXTRA_RESULT_DATA = "EXTRA_RESULT_DATA"

        const val CHANNEL_ID = "AudioCaptureChannel"
        const val NOTIFICATION_ID = 1001

        var listener: ((ByteArray) -> Unit)? = null
        var errorListener: ((String) -> Unit)? = null   // ✅ NEW
        var isRunning = false
            private set
    }

    private var mediaProjection: MediaProjection? = null
    private var audioRecord: AudioRecord? = null
    private var captureThread: Thread? = null
    @Volatile private var isRecording = false

    override fun onCreate() {
        super.onCreate()
        // Immediately promote to foreground to satisfy Android's timing requirement.
        // Use a minimal notification; details will be updated later if needed.
        startForegroundServiceWithNotification()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        Log.i("AudioCaptureService", "[Pipeline] onStartCommand received action: $action")
        if (action == ACTION_START) {
            val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, Int.MIN_VALUE)
            val resultData = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra<Intent>(EXTRA_RESULT_DATA)
            }

            Log.i("AudioCaptureService", "[Pipeline] Extracted MediaProjection intent: resultCode=$resultCode, resultDataNotNull=${resultData != null}")
if (resultCode != Int.MIN_VALUE && resultData != null) {
                startCapture(resultCode, resultData)
            } else {
                Log.e("AudioCaptureService", "[Pipeline] ❌ Failed to start capture: invalid resultCode ($resultCode) or null resultData (${resultData == null})")
            }
        } else if (action == ACTION_STOP) {
            Log.i("AudioCaptureService", "[Pipeline] Stopping capture service via ACTION_STOP")
            stopCapture()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun startForegroundServiceWithNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Live Audio Capture",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }

        val notificationBuilder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        val notification = notificationBuilder
            .setContentTitle("Live Audio Broadcast")
            .setContentText("Broadcasting system audio live to listeners...")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        isRunning = true
    }

    private fun startCapture(resultCode: Int, resultData: Intent) {
        try {
            val projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            mediaProjection = projectionManager.getMediaProjection(resultCode, resultData)

           if (mediaProjection == null) {
                Log.e("AudioCaptureService", "[Pipeline] ❌ MediaProjection is null")
                reportFailure("MediaProjection is null")
                return
            }

            // Register callback required on Android 14+ (API 34+)
            mediaProjection?.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() {
                    Log.w("AudioCaptureService", "[Pipeline] MediaProjection session stopped by system")
                    stopCapture()
                }
            }, android.os.Handler(android.os.Looper.getMainLooper()))

            val sampleRate = 44100
            val channelConfig = AudioFormat.CHANNEL_IN_MONO
            val audioEncoding = AudioFormat.ENCODING_PCM_16BIT
            val minBufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioEncoding)
            if (minBufferSize <= 0) {
                Log.e("AudioCaptureService", "[Pipeline] ❌ Invalid AudioRecord min buffer size: $minBufferSize")
                reportFailure("Invalid AudioRecord buffer size: $minBufferSize")
                return
            }
            val bufferSize = Math.max(minBufferSize, 4096 * 4)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val captureConfig = AudioPlaybackCaptureConfiguration.Builder(mediaProjection!!)
                    .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                    .addMatchingUsage(AudioAttributes.USAGE_GAME)
                    .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                    .build()
                audioRecord = AudioRecord.Builder()
                    .setAudioPlaybackCaptureConfig(captureConfig)
                    .setAudioFormat(
                        AudioFormat.Builder()
                            .setEncoding(audioEncoding)
                            .setSampleRate(sampleRate)
                            .setChannelMask(channelConfig)
                            .build()
                    )
                    .setBufferSizeInBytes(bufferSize)
                    .build()
            } else {
                @Suppress("DEPRECATION")
                audioRecord = AudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    sampleRate,
                    channelConfig,
                    audioEncoding,
                    bufferSize
                )
            }

            Log.d("AudioCaptureService", "[Pipeline] AudioRecord created; state=${audioRecord?.state} (expected ${AudioRecord.STATE_INITIALIZED})")

            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                Log.e("AudioCaptureService", "[Pipeline] ❌ AudioRecord failed to initialize (state=${audioRecord?.state})")
                reportFailure("AudioRecord failed to initialize — check RECORD_AUDIO permission")
                return
            }

            audioRecord?.startRecording()
            val recState = audioRecord?.recordingState
            Log.d("AudioCaptureService", "[Pipeline] AudioRecord.startRecording() called; recordingState=$recState (expected ${AudioRecord.RECORDSTATE_RECORDING})")

           if (recState != AudioRecord.RECORDSTATE_RECORDING) {
                Log.e("AudioCaptureService", "[Pipeline] ❌ AudioRecord failed to start recording (recordingState=$recState)")
                reportFailure("AudioRecord failed to start recording")
                return
            }
            isRecording = true

            captureThread = Thread {
                val buffer = ByteArray(4096)
                var totalBytesRead = 0L
                var chunkCount = 0L
                var lastLogTime = System.currentTimeMillis()
                Log.i("AudioCaptureService", "[Pipeline] Audio capture thread loop running")
                while (isRecording) {
                    val readBytes = audioRecord?.read(buffer, 0, buffer.size) ?: -1
                    if (readBytes > 0) {
                        totalBytesRead += readBytes
                        chunkCount++
                        val chunk = buffer.copyOf(readBytes)
                        listener?.invoke(chunk)
                    } else if (readBytes < 0) {
                        Log.e("AudioCaptureService", "[Pipeline] ❌ AudioRecord read failed error code: $readBytes")
                    } else {
                        // 0 bytes read (e.g. silent stream buffer), sleep 10ms to prevent tight loop
                        try { Thread.sleep(10) } catch (e: Exception) {}
                    }

                    val now = System.currentTimeMillis()
                    if (now - lastLogTime >= 3000) {
                        Log.i("AudioCaptureService", "[Pipeline] 📊 System Audio Capture: chunks=$chunkCount, totalBytes=$totalBytesRead B, listenerAttached=${listener != null}")
                        lastLogTime = now
                    }
                }
            }.apply { start() }

            Log.i("AudioCaptureService", "[Pipeline] ✅ Audio capture started successfully")

        } catch (e: Exception) {
            Log.e("AudioCaptureService", "Error starting audio capture", e)
            reportFailure(e.message ?: "Unknown error starting capture")
        }
    }

    private fun reportFailure(message: String) {
        isRunning = false
        errorListener?.invoke(message)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun stopCapture() {
        isRecording = false
        try {
            captureThread?.join(500)
        } catch (e: Exception) {}
        captureThread = null

        try {
            audioRecord?.stop()
            audioRecord?.release()
        } catch (e: Exception) {}
        audioRecord = null

        try {
            mediaProjection?.stop()
        } catch (e: Exception) {}
        mediaProjection = null

        isRunning = false
        Log.d("AudioCaptureService", "Audio capture stopped cleanly")
    }

    override fun onDestroy() {
        stopCapture()
        super.onDestroy()
    }
}
