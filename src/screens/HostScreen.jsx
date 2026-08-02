import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, StyleSheet, Platform, Alert, PermissionsAndroid } from 'react-native';
import { Button, Text, Card, IconButton, Chip } from 'react-native-paper';
import * as Network from 'expo-network';
import { HostServer } from '../network/HostServer';

// States for the broadcast lifecycle
const STATE = {
  IDLE: 'idle',           // Initial - ready to start
  REQUESTING: 'requesting', // Waiting for MediaProjection permission
  BROADCASTING: 'broadcasting', // Actively streaming
  ERROR: 'error',
};

export function HostScreen({ onBack }) {
  const [broadcastState, setBroadcastState] = useState(STATE.IDLE);
  const [ip, setIp] = useState('');
  const [statusText, setStatusText] = useState('Tap "Start Broadcast" to begin streaming live audio.');
  const serverRef = useRef(null);

  // Stop server and reset state on unmount
  useEffect(() => {
    return () => {
      if (serverRef.current) {
        serverRef.current.stop();
        serverRef.current = null;
      }
    };
  }, []);

 const startBroadcast = useCallback(async () => {
    try {
      setBroadcastState(STATE.REQUESTING);
      setStatusText('Waiting for Android permission...');

      // ✅ NEW — RECORD_AUDIO runtime permission chaite hobe, noyle
      // native audio policy register korte partbe na
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission Required',
            message: 'This app needs microphone permission to capture and broadcast system audio.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          }
        );

        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          setBroadcastState(STATE.ERROR);
          setStatusText('Microphone permission denied.');
          Alert.alert(
            'Permission Required',
            'Microphone permission is required to broadcast audio. Please allow it in app settings.',
            [{ text: 'OK' }]
          );
          return;
        }
      }

      const localIp = await Network.getIpAddressAsync();
      setIp(localIp);

      serverRef.current = new HostServer();

      // This calls AudioCaptureModule.startCapture() internally,
      // which triggers the Android MediaProjection permission dialog.
      // No file selection needed — it captures live system audio.
      await serverRef.current.start((errMsg) => {
        // ✅ NEW — native capture fail korle ei callback ashbe
        setBroadcastState(STATE.ERROR);
        setStatusText(`Broadcast failed: ${errMsg}`);
        Alert.alert('Broadcast Stopped', errMsg, [{ text: 'OK' }]);
      });

      setBroadcastState(STATE.BROADCASTING);
      setStatusText('🔴 Live — streaming system audio to listeners');
    } catch (e) {
      console.error('[HostScreen] Failed to start broadcast:', e);
      setBroadcastState(STATE.ERROR);
      const msg = e?.message || String(e);
      setStatusText(`Error: ${msg}`);

      if (serverRef.current) {
        serverRef.current.stop();
        serverRef.current = null;
      }

      Alert.alert(
        'Broadcast Failed',
        msg.includes('PERMISSION_DENIED')
          ? 'Permission was denied. Please allow audio capture when prompted.'
          : `Could not start broadcast: ${msg}`,
        [{ text: 'OK' }]
      );
    }
  }, []);

  const stopBroadcast = useCallback(() => {
    serverRef.current?.stop();
    serverRef.current = null;
    setBroadcastState(STATE.IDLE);
    setStatusText('Broadcast stopped.');
  }, []);

  const isRequesting = broadcastState === STATE.REQUESTING;
  const isBroadcasting = broadcastState === STATE.BROADCASTING;

  return (
    <View style={styles.container}>
      <Button icon="arrow-left" mode="text" onPress={onBack} style={styles.backButton}>
        Back
      </Button>

      <Text variant="displaySmall" style={styles.title}>Host</Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        Stream live system audio to nearby listeners
      </Text>

      {/* Status Card */}
      <Card style={[styles.card, isBroadcasting && styles.cardLive]} mode="elevated">
        <Card.Content style={styles.cardContent}>
          <View style={styles.statusIconRow}>
            <IconButton
              icon={isBroadcasting ? 'broadcast' : isRequesting ? 'loading' : 'cast-audio'}
              size={40}
              iconColor={isBroadcasting ? '#ef4444' : '#6366f1'}
              style={[styles.statusIcon, isBroadcasting && styles.statusIconLive]}
            />
          </View>

          {isBroadcasting && ip ? (
            <View style={styles.chipRow}>
              <Chip icon="wifi" style={styles.chip} textStyle={styles.chipText}>
                {ip}
              </Chip>
              <Chip icon="circle" style={styles.liveChip} textStyle={styles.liveChipText}>
                LIVE
              </Chip>
            </View>
          ) : null}

          <Text variant="bodyLarge" style={styles.statusText}>
            {statusText}
          </Text>

          {!isBroadcasting && (
            <Text variant="bodySmall" style={styles.hintText}>
              Any audio playing on this device (YouTube, music, etc.) will be streamed live.
            </Text>
          )}
        </Card.Content>
      </Card>

      {/* Action Button */}
      {!isBroadcasting ? (
        <Button
          mode="contained"
          onPress={startBroadcast}
          disabled={isRequesting}
          loading={isRequesting}
          icon="broadcast"
          style={styles.startButton}
          contentStyle={styles.startButtonContent}
          labelStyle={styles.startButtonLabel}
        >
          {isRequesting ? 'Requesting Permission…' : 'Start Broadcast'}
        </Button>
      ) : (
        <Button
          mode="contained"
          onPress={stopBroadcast}
          icon="stop-circle"
          style={styles.stopButton}
          contentStyle={styles.startButtonContent}
          labelStyle={styles.startButtonLabel}
          buttonColor="#ef4444"
        >
          Stop Broadcast
        </Button>
      )}

      {broadcastState === STATE.ERROR && (
        <Button
          mode="outlined"
          onPress={() => {
            setBroadcastState(STATE.IDLE);
            setStatusText('Tap "Start Broadcast" to begin streaming live audio.');
          }}
          style={styles.retryButton}
        >
          Try Again
        </Button>
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
  cardLive: {
    borderWidth: 2,
    borderColor: '#ef4444',
  },
  cardContent: {
    padding: 24,
    alignItems: 'center',
  },
  statusIconRow: {
    marginBottom: 12,
  },
  statusIcon: {
    backgroundColor: '#eef2ff',
    borderRadius: 40,
  },
  statusIconLive: {
    backgroundColor: '#fee2e2',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  chip: {
    backgroundColor: '#eef2ff',
  },
  chipText: {
    fontSize: 13,
  },
  liveChip: {
    backgroundColor: '#fee2e2',
  },
  liveChipText: {
    fontSize: 13,
    color: '#ef4444',
    fontWeight: '700',
  },
  statusText: {
    textAlign: 'center',
    color: '#1a1a1a',
    fontWeight: '500',
    marginBottom: 8,
  },
  hintText: {
    textAlign: 'center',
    color: '#6b7280',
    marginTop: 4,
  },
  startButton: {
    borderRadius: 16,
    marginTop: 8,
    backgroundColor: '#6366f1',
  },
  stopButton: {
    borderRadius: 16,
    marginTop: 8,
  },
  retryButton: {
    borderRadius: 16,
    marginTop: 12,
  },
  startButtonContent: {
    paddingVertical: 8,
  },
  startButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
});
