package com.ranit25.BluetoothAudioApp

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.util.Base64
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class AudioCaptureModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val REQUEST_CODE_MEDIA_PROJECTION = 9918
        private var pendingPromise: Promise? = null

        fun handleActivityResult(requestCode: Int, resultCode: Int, data: Intent?, context: ReactApplicationContext): Boolean {
            if (requestCode == REQUEST_CODE_MEDIA_PROJECTION) {
                if (resultCode == Activity.RESULT_OK && data != null) {
                    val intent = Intent(context, AudioCaptureService::class.java).apply {
                        action = AudioCaptureService.ACTION_START
                        putExtra(AudioCaptureService.EXTRA_RESULT_CODE, resultCode)
                        putExtra(AudioCaptureService.EXTRA_RESULT_DATA, data)
                    }
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                        context.startForegroundService(intent)
                    } else {
                        context.startService(intent)
                    }
                    pendingPromise?.resolve(true)
                } else {
                    pendingPromise?.reject("PERMISSION_DENIED", "Media Projection permission was denied by user")
                }
                pendingPromise = null
                return true
            }
            return false
        }
    }

    private val activityEventListener: ActivityEventListener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            handleActivityResult(requestCode, resultCode, data, reactContext)
        }
    }

   init {
        reactContext.addActivityEventListener(activityEventListener)
        AudioCaptureService.listener = { pcmChunk ->
            val base64Data = Base64.encodeToString(pcmChunk, Base64.NO_WRAP)
            val params = Arguments.createMap().apply {
                putString("pcm", base64Data)
            }
            android.util.Log.d("AudioCaptureModule", "[Pipeline] Emitting onAudioChunk event: ${pcmChunk.size} bytes (base64Len=${base64Data.length})")
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("onAudioChunk", params)
        }

        // ✅ NEW BLOCK — capture fail korle JS ke event pathabe
        AudioCaptureService.errorListener = { message ->
            android.util.Log.e("AudioCaptureModule", "[Pipeline] Capture error: $message")
            val errorParams = Arguments.createMap().apply {
                putString("message", message)
            }
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("onCaptureError", errorParams)
        }
    }

    override fun getName(): String = "AudioCaptureModule"

    @ReactMethod
    fun startCapture(promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "Current activity is null")
            return
        }

        pendingPromise = promise
        val projectionManager = activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val intent = projectionManager.createScreenCaptureIntent()
        activity.startActivityForResult(intent, REQUEST_CODE_MEDIA_PROJECTION)
    }

    @ReactMethod
    fun stopCapture(promise: Promise) {
        val intent = Intent(reactContext, AudioCaptureService::class.java).apply {
            action = AudioCaptureService.ACTION_STOP
        }
        reactContext.startService(intent)
        promise.resolve(true)
    }

    @ReactMethod
    fun isCapturing(promise: Promise) {
        promise.resolve(AudioCaptureService.isRunning)
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
