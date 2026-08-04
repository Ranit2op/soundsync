import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, StyleSheet, Platform, Alert, PermissionsAndroid, TouchableOpacity } from 'react-native';
import { Button, Text, IconButton, Chip } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import * as Network from 'expo-network';
import { HostServer } from '../network/HostServer';
import { AudioOrb } from '../components/AudioOrb';

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
  const [statusText, setStatusText] = useState('Tap to start live system audio broadcast');
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

      await serverRef.current.start((errMsg) => {
        setBroadcastState(STATE.ERROR);
        setStatusText(`Broadcast failed: ${errMsg}`);
        Alert.alert('Broadcast Stopped', errMsg, [{ text: 'OK' }]);
      });

      setBroadcastState(STATE.BROADCASTING);
      setStatusText('Streaming system audio live');
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
    <LinearGradient
      colors={['#EAE4F8', '#F4F1FA', '#F8F7FC']}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      {/* Navigation Top Bar - Inspired by reference image */}
      <View style={styles.navHeader}>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={onBack}
          style={styles.circularBackButton}
        >
          <IconButton icon="chevron-left" size={24} iconColor="#1E1B2E" style={styles.iconZero} />
        </TouchableOpacity>

        <Text variant="titleMedium" style={styles.navTitle}>
          Host Audio
        </Text>

        <View style={styles.statusBadgeRight}>
          <View style={[styles.badgeDot, isBroadcasting ? styles.badgeDotLive : styles.badgeDotIdle]} />
          <Text style={styles.badgeText}>
            {isBroadcasting ? 'LIVE' : isRequesting ? 'REQ' : 'READY'}
          </Text>
        </View>
      </View>

      {/* Main Content Area with Glowing Orb */}
      <View style={styles.mainContent}>
        {/* Status Heading */}
        <View style={styles.headingContainer}>
          <Text variant="headlineSmall" style={styles.headingTitle}>
            {isBroadcasting ? 'Broadcasting Live' : 'Start Audio Host'}
          </Text>

          {isBroadcasting && ip ? (
            <View style={styles.ipContainer}>
              <Chip icon="wifi" style={styles.ipChip} textStyle={styles.ipChipText}>
                {ip}
              </Chip>
            </View>
          ) : null}
        </View>

        {/* Central Audio Visualizer Orb */}
        <View style={styles.orbWrapper}>
          <AudioOrb active={isBroadcasting} size={190} />
        </View>

        {/* Status Message */}
        <View style={styles.statusTextContainer}>
          <Text variant="bodyLarge" style={styles.statusMainText}>
            {statusText}
          </Text>
          {!isBroadcasting && (
            <Text variant="bodySmall" style={styles.statusSubText}>
              Any audio playing on this device (YouTube, Spotify, etc.) will stream live to connected listeners.
            </Text>
          )}
        </View>
      </View>

      {/* Bottom Controls Area - Circular Floating Button */}
      <View style={styles.bottomBarContainer}>
        {!isBroadcasting ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={startBroadcast}
            disabled={isRequesting}
            style={styles.actionBtnTouchable}
          >
            <View style={styles.outerGlowRing}>
              <LinearGradient
                colors={isRequesting ? ['#9CA3AF', '#6B7280'] : ['#8B75F5', '#6C5CE7', '#4834D4']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.mainActionOrb}
              >
                <IconButton
                  icon={isRequesting ? 'sync' : 'broadcast'}
                  size={34}
                  iconColor="#FFFFFF"
                  style={styles.iconZero}
                />
              </LinearGradient>
            </View>
            <Text style={styles.actionBtnLabel}>
              {isRequesting ? 'Requesting Permission...' : 'Start Broadcast'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={stopBroadcast}
            style={styles.actionBtnTouchable}
          >
            <View style={[styles.outerGlowRing, styles.glowRingStop]}>
              <LinearGradient
                colors={['#FF6B6B', '#EF4444', '#DC2626']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.mainActionOrb}
              >
                <IconButton icon="stop" size={32} iconColor="#FFFFFF" style={styles.iconZero} />
              </LinearGradient>
            </View>
            <Text style={[styles.actionBtnLabel, { color: '#EF4444' }]}>
              Stop Broadcast
            </Text>
          </TouchableOpacity>
        )}

        {broadcastState === STATE.ERROR && (
          <Button
            mode="text"
            onPress={() => {
              setBroadcastState(STATE.IDLE);
              setStatusText('Tap to start live system audio broadcast');
            }}
            textColor="#6C5CE7"
            style={styles.retryButton}
          >
            Try Again
          </Button>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 54,
    paddingBottom: 36,
    justifyContent: 'space-between',
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  circularBackButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  iconZero: {
    margin: 0,
  },
  navTitle: {
    fontWeight: '700',
    color: '#1E1B2E',
    fontSize: 17,
  },
  statusBadgeRight: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  badgeDotLive: {
    backgroundColor: '#EF4444',
  },
  badgeDotIdle: {
    backgroundColor: '#10B981',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E1B2E',
    letterSpacing: 0.5,
  },
  mainContent: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  headingContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  headingTitle: {
    fontWeight: '800',
    color: '#1E1B2E',
    fontSize: 24,
    textAlign: 'center',
  },
  ipContainer: {
    marginTop: 10,
  },
  ipChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8E2F4',
  },
  ipChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6C5CE7',
  },
  orbWrapper: {
    marginVertical: 16,
  },
  statusTextContainer: {
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 20,
  },
  statusMainText: {
    textAlign: 'center',
    fontWeight: '600',
    color: '#1E1B2E',
    fontSize: 16,
  },
  statusSubText: {
    textAlign: 'center',
    color: '#7C7594',
    marginTop: 8,
    lineHeight: 20,
    fontSize: 13,
  },
  bottomBarContainer: {
    alignItems: 'center',
    marginBottom: 10,
  },
  actionBtnTouchable: {
    alignItems: 'center',
  },
  outerGlowRing: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: 'rgba(108, 92, 231, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRingStop: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  mainActionOrb: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  actionBtnLabel: {
    marginTop: 10,
    fontWeight: '700',
    fontSize: 14,
    color: '#6C5CE7',
  },
  retryButton: {
    marginTop: 8,
  },
});
