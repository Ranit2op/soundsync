import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Button, Text, Card, IconButton, Chip, Divider } from 'react-native-paper';
import * as DocumentPicker from 'expo-document-picker';
import * as Network from 'expo-network';
import { useAudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { HostServer } from '../network/HostServer';

export function HostScreen({ onBack }) {
  const [fileName, setFileName] = useState(null);
  const [fileUri, setFileUri] = useState(null);
  const [ip, setIp] = useState('');
  const [serverRunning, setServerRunning] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState('');
  const serverRef = useRef(null);
  const intervalRef = useRef(null);
  const player = useAudioPlayer(fileUri ?? undefined);

  // Ensure server is stopped when component unmounts (e.g. going back or hot reloading)
  useEffect(() => {
    return () => {
      if (serverRef.current) {
        serverRef.current.stop();
        serverRef.current = null;
      }
    };
  }, []);

  const pickFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*' });
      if (result.canceled) return;

      const pickedAsset = result.assets[0];
      const targetUri = `${FileSystem.cacheDirectory}${pickedAsset.name}`;
      
      setStatus('Preparing audio file...');
      await FileSystem.copyAsync({
        from: pickedAsset.uri,
        to: targetUri,
      });

      setFileUri(targetUri);
      setFileName(pickedAsset.name);
      setStatus('File ready to broadcast.');
    } catch (e) {
      setStatus(`Error picking file: ${e.message}`);
    }
  }, []);

  const startServer = useCallback(async () => {
    if (!fileUri || !fileName) return;
    try {
      const localIp = await Network.getIpAddressAsync();
      setIp(localIp);

      serverRef.current = new HostServer();
      serverRef.current.start(fileUri, fileName);
      setServerRunning(true);
      setStatus('Waiting for listeners to join...');
    } catch (e) {
      setStatus(`Error starting server: ${e.message}`);
    }
  }, [fileUri, fileName]);

  const startPlayback = useCallback(() => {
    if (!serverRef.current) return;
    const startAt = Date.now() + 3000;
    serverRef.current.broadcastStartAt(startAt);

    const delay = startAt - Date.now();
    setStatus(`Starting in ${Math.round(delay / 1000)}s...`);
    setTimeout(() => {
      player.seekTo(0);
      player.play();
      setIsPlaying(true);
      setStatus('Playing 🎵');
    }, Math.max(delay, 0));
  }, [player]);

  const stopServer = useCallback(() => {
    serverRef.current?.stop();
    player.pause();
    setServerRunning(false);
    setIsPlaying(false);
    setStatus('');
  }, [player]);

  return (
    <View style={styles.container}>
      <Button icon="arrow-left" mode="text" onPress={onBack} style={styles.backButton}>
        Back
      </Button>

      <Text variant="displaySmall" style={styles.title}>Host</Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        Share your audio with nearby devices
      </Text>

      {/* File Selection Card */}
      <Card style={styles.card} mode="elevated">
        <Card.Content style={styles.fileCardContent}>
          <View style={styles.fileInfo}>
            <IconButton
              icon={fileName ? 'music-note' : 'file-music-outline'}
              size={32}
              style={styles.fileIcon}
            />
            <View style={{ flex: 1 }}>
              <Text variant="labelLarge" style={styles.fileLabel}>
                {fileName ? 'Selected File' : 'No File Selected'}
              </Text>
              <Text
                variant="bodySmall"
                style={styles.fileName}
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {fileName ?? 'Tap below to choose an audio file'}
              </Text>
            </View>
          </View>
          <Divider style={styles.divider} />
          <Button
            icon="folder-open-outline"
            mode="text"
            onPress={pickFile}
            style={styles.pickButton}
          >
            Choose Audio File
          </Button>
        </Card.Content>
      </Card>

      {/* Server Status / Controls */}
      {!serverRunning ? (
        <Button
          mode="contained"
          onPress={startServer}
          disabled={!fileUri}
          icon="broadcast"
          style={styles.startButton}
          contentStyle={styles.startButtonContent}
          labelStyle={styles.startButtonLabel}
        >
          Start Broadcasting
        </Button>
      ) : (
        <Card style={styles.card} mode="elevated">
          <Card.Content style={styles.serverCardContent}>
            <View style={styles.statusRow}>
              <Chip icon="wifi" style={styles.chip} textStyle={styles.chipText}>
                {ip}
              </Chip>
            </View>

            <Text variant="bodyLarge" style={styles.statusText}>{status}</Text>

            <View style={styles.serverActions}>
              {!isPlaying ? (
                <Button
                  mode="contained"
                  icon="play"
                  onPress={startPlayback}
                  style={styles.playButton}
                  contentStyle={styles.actionButtonContent}
                >
                  Start Playback
                </Button>
              ) : (
                <Button
                  mode="contained"
                  icon="pause"
                  onPress={() => { 
                    player.pause(); 
                    setIsPlaying(false); 
                    setStatus('Paused');
                    serverRef.current?.stopPlayback();
                  }}
                  style={styles.pauseButton}
                  contentStyle={styles.actionButtonContent}
                >
                  Pause
                </Button>
              )}
              <Button
                mode="outlined"
                icon="stop"
                onPress={stopServer}
                style={styles.stopButton}
                contentStyle={styles.actionButtonContent}
              >
                Stop Server
              </Button>
            </View>
          </Card.Content>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 60,
    backgroundColor: '#f8f9fa',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 20,
    marginLeft: -8,
  },
  title: {
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  subtitle: {
    color: '#6b7280',
    marginTop: 4,
    marginBottom: 28,
  },
  card: {
    borderRadius: 24,
    backgroundColor: '#ffffff',
    marginBottom: 20,
    elevation: 4,
  },
  fileCardContent: {
    padding: 20,
  },
  fileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fileIcon: {
    backgroundColor: '#eef2ff',
    borderRadius: 16,
  },
  fileLabel: {
    color: '#1a1a1a',
    fontWeight: '600',
  },
  fileName: {
    color: '#6b7280',
    marginTop: 2,
  },
  divider: {
    marginVertical: 16,
  },
  pickButton: {
    alignSelf: 'center',
  },
  startButton: {
    borderRadius: 16,
    marginTop: 8,
  },
  startButtonContent: {
    paddingVertical: 8,
  },
  startButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  serverCardContent: {
    padding: 24,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    backgroundColor: '#eef2ff',
  },
  listenerChip: {
    backgroundColor: '#ecfdf5',
  },
  chipText: {
    fontSize: 13,
  },
  statusText: {
    textAlign: 'center',
    color: '#4a4a4a',
    fontWeight: '500',
    marginBottom: 20,
  },
  serverActions: {
    gap: 10,
  },
  playButton: {
    borderRadius: 14,
    backgroundColor: '#16a34a',
  },
  pauseButton: {
    borderRadius: 14,
    backgroundColor: '#f59e0b',
  },
  stopButton: {
    borderRadius: 14,
  },
  actionButtonContent: {
    paddingVertical: 6,
  },
});
