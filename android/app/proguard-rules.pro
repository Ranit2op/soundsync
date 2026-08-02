# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Custom React Native bridge modules used by the live audio flow.
-keep class com.ranit25.BluetoothAudioApp.BluetoothAudioPackage { *; }
-keep class com.ranit25.BluetoothAudioApp.AudioCaptureModule { *; }
-keep class com.ranit25.BluetoothAudioApp.AudioPlayerModule { *; }
-keepclassmembers class com.ranit25.BluetoothAudioApp.** {
    @com.facebook.react.bridge.ReactMethod <methods>;
}
