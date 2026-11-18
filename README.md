# 🎧 SoundSync - Real-Time Low-Latency Wi-Fi Audio Streaming

[![Android Release](https://img.shields.io/badge/Download-Android%20APK%20(v1.0.0)-brightgreen?style=for-the-badge&logo=android)](https://github.com/Ranit2op/soundsync/releases/download/v1.0.0/SoundSync-v1.0.0.apk)
[![Windows Installer](https://img.shields.io/badge/Download-Windows%20Setup%20(v1.0.0)-blue?style=for-the-badge&logo=windows)](https://github.com/Ranit2op/soundsync/releases/download/v1.0.0/SoundSync-Setup-v1.0.0.exe)
[![Windows Portable](https://img.shields.io/badge/Download-Windows%20Portable%20(v1.0.0)-lightgrey?style=for-the-badge&logo=windows)](https://github.com/Ranit2op/soundsync/releases/download/v1.0.0/SoundSync-v1.0.0-Portable.exe)
[![Release](https://img.shields.io/github/v/release/Ranit2op/soundsync?style=for-the-badge&color=purple)](https://github.com/Ranit2op/soundsync/releases)

**SoundSync** is a cross-platform (Windows & Android) application designed for seamless, ultra-low-latency real-time system audio streaming over a local Wi-Fi network. Easily broadcast your PC or phone's audio to any listening device with zero audio degradation.

---

## ✨ Features

- 📡 **Real-time Wi-Fi Streaming:** Broadcast and stream lossless system audio across devices over your local Wi-Fi network.
- 💻 **Windows Desktop Host & Listener:** Native loopback capture on Windows via Electron & Web Audio API to stream any system sound (music, movies, games, meetings) to connected clients.
- 📱 **Android Mobile Host & Listener:** Built-in Kotlin native background services (`AudioCaptureService` and `AudioPlayerModule`) supporting Android `MediaProjection` and low-latency `AudioTrack` playback.
- 🔄 **Bidirectional & Multi-device Support:** Any device can act as an **Audio Host** (broadcaster) or **Listener** (receiver) in real-time.
- 🎨 **Modern Futuristic UI:** Sleek indigo-purple theme with custom 3D glowing sonic ring mascot, smooth gradients, and intuitive one-tap controls.

---

## 🛠️ Tech Stack & Architecture

- **Mobile Framework:** React Native 0.86 & Expo SDK 57 (New Architecture)
- **Desktop Framework:** Electron 41 with Chromium system loopback capture
- **Native Android Modules:** Kotlin, Java 17, Android NDK CMake, Gradle 9.3
- **Networking:** Low-latency raw TCP sockets (`react-native-tcp-socket` on mobile, Node.js `net` on desktop)
- **UI & Styling:** React Native Paper, Expo Linear Gradient, Material Community Icons

---

## 🚀 Getting Started

### 1. Prerequisites & Installation
```bash
# Clone the repository
git clone https://github.com/Ranit2op/soundsync.git
cd soundsync

# Checkout multi branch
git checkout multi

# Install dependencies
npm install
```

### 2. Run Mobile App (Android / Expo)
```bash
npx expo start
```
- Press `a` to run on Android device / emulator

### 3. Run Desktop App (Windows)
```bash
npm run desktop:dev
```

---

## 📦 Building Releases

### 📱 Android Standalone APK
```bash
cd android
.\gradlew.bat assembleRelease
```
The output APK is generated at:
```
android/app/build/outputs/apk/release/app-release.apk
```

### 💻 Windows Desktop (.exe Installer & Portable)
```bash
npm run desktop:build:win
```
The output executables are generated at:
```
dist-desktop/SoundSync Setup 1.0.0.exe
dist-desktop/SoundSync 1.0.0.exe
```

---

## 👤 Author

Developed by **Ranit Saha** ([@Ranit2op](https://github.com/Ranit2op))
