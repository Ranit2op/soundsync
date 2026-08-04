import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Button, Text, ActivityIndicator, TextInput, IconButton, Card } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { ListenerClient } from '../network/ListenerClient';
import { AudioOrb } from '../components/AudioOrb';

export function ListenerScreen({ onBack }) {
  const [status, setStatus] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 253 });
  const [discoveredHosts, setDiscoveredHosts] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectedHostIp, setConnectedHostIp] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [manualIp, setManualIp] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  const [client] = useState(() => new ListenerClient());
  const isMounted = useRef(true);

  const startScan = useCallback(async () => {
    if (!client) return;

    setIsScanning(true);
    setErrorMsg(null);
    setDiscoveredHosts([]);
    setStatus('Scanning local network for hosts...');
    setScanProgress({ current: 0, total: 253 });

    try {
      await client.discoverHosts(
        (newHost) => {
          if (!isMounted.current) return;
          setDiscoveredHosts((prev) => {
            if (prev.some((h) => h.ip === newHost.ip)) return prev;
            return [...prev, newHost];
          });
        },
        (current, total) => {
          if (isMounted.current) {
            setScanProgress({ current, total });
          }
        }
      );
    } catch (e) {
      if (isMounted.current) setErrorMsg(e.message);
    } finally {
      if (isMounted.current) {
        setIsScanning(false);
      }
    }
  }, [client]);

  const stopScan = useCallback(() => {
    client.stopScan();
    setIsScanning(false);
    setStatus('Scan stopped.');
  }, [client]);

  const connectToHost = useCallback(async (targetIp) => {
    if (!client || !targetIp) return;

    stopScan();
    setIsConnecting(true);
    setErrorMsg(null);
    setStatus(`Connecting to ${targetIp}...`);

    try {
      await client.connect(
        targetIp,
        () => {
          if (isMounted.current) {
            setConnectedHostIp(targetIp);
            setStatus('Connected. Listening to live audio stream...');
          }
        },
        () => {
          if (isMounted.current) {
            setConnectedHostIp(null);
            setStatus('Disconnected from host.');
          }
        }
      );

      if (!isMounted.current) return;
      setConnectedHostIp(targetIp);
      setStatus('Connected. Listening to live audio stream...');
    } catch (e) {
      if (isMounted.current) {
        setErrorMsg(e.message);
        setStatus(`Failed to connect to ${targetIp}`);
        setConnectedHostIp(null);
      }
    } finally {
      if (isMounted.current) {
        setIsConnecting(false);
      }
    }
  }, [client, stopScan]);

  const disconnectSession = useCallback(() => {
    client.disconnect();
    setConnectedHostIp(null);
    setStatus('Disconnected.');
  }, [client]);

  const handleBack = () => {
    client.disconnect();
    onBack();
  };

  useEffect(() => {
    isMounted.current = true;
    const scanTimer = setTimeout(startScan, 0);

    return () => {
      clearTimeout(scanTimer);
      isMounted.current = false;
      client.disconnect();
    };
  }, [client, startScan]);

  const scanPercent = scanProgress.total > 0
    ? Math.round((scanProgress.current / scanProgress.total) * 100)
    : 0;

  return (
    <LinearGradient
      colors={['#EAE4F8', '#F4F1FA', '#F8F7FC']}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      {/* Top Bar with Floating Back Button - Reference Inspired */}
      <View style={styles.navHeader}>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={handleBack}
          style={styles.circularBackButton}
        >
          <IconButton icon="chevron-left" size={24} iconColor="#1E1B2E" style={styles.iconZero} />
        </TouchableOpacity>

        <Text variant="titleMedium" style={styles.navTitle}>
          Audio Listener
        </Text>

        <View style={styles.statusBadgeRight}>
          <View style={[styles.badgeDot, connectedHostIp ? styles.badgeDotGreen : styles.badgeDotGray]} />
          <Text style={styles.badgeText}>
            {connectedHostIp ? 'CONNECTED' : isScanning ? 'SCANNING' : 'IDLE'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Connected Immersive Visualizer Mode (Inspired directly by user reference image) */}
        {connectedHostIp ? (
          <View style={styles.connectedSection}>
            <View style={styles.connectedHeader}>
              <Text variant="headlineSmall" style={styles.connectedTitle}>
                Receiving Live Stream
              </Text>
              <View style={styles.ipBadgePill}>
                <IconButton icon="wifi" size={14} iconColor="#059669" style={styles.iconZero} />
                <Text style={styles.ipBadgeText}>{connectedHostIp}</Text>
              </View>
            </View>

            {/* Glowing Animated Audio Visualizer Orb */}
            <View style={styles.orbWrapper}>
              <AudioOrb active={true} size={200} />
            </View>

            <Text variant="bodyLarge" style={styles.liveStatusText}>
              {status || 'Listening to synchronized live audio...'}
            </Text>

            {/* Glowing Disconnect Button - Reference Image Control Bar */}
            <View style={styles.connectedBottomBar}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={disconnectSession}
                style={styles.disconnectTouchable}
              >
                <View style={styles.disconnectGlowRing}>
                  <LinearGradient
                    colors={['#FF6B6B', '#EF4444']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.disconnectOrb}
                  >
                    <IconButton icon="power" size={30} iconColor="#FFFFFF" style={styles.iconZero} />
                  </LinearGradient>
                </View>
                <Text style={styles.disconnectLabel}>Disconnect Stream</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* Unconnected / Scanning & Host Discovery Mode */
          <View style={styles.discoverySection}>
            {/* Status Card / Scan Progress */}
            <View style={styles.statusCard}>
              {isConnecting && (
                <ActivityIndicator animating={true} size="large" color="#6C5CE7" style={styles.loader} />
              )}

              <Text variant="titleMedium" style={styles.statusCardTitle}>
                {isScanning ? 'Searching Local Network...' : 'Host Discovery'}
              </Text>

              {status ? <Text style={styles.statusCardSubtext}>{status}</Text> : null}

              {/* Progress Bar when Scanning */}
              {isScanning && (
                <View style={styles.scanProgressBlock}>
                  <View style={styles.progressTrack}>
                    <LinearGradient
                      colors={['#8B75F5', '#6C5CE7']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.progressFill, { width: `${scanPercent}%` }]}
                    />
                  </View>
                  <View style={styles.progressRow}>
                    <Text style={styles.progressDetailsText}>
                      Scanning subnet ({scanProgress.current}/{scanProgress.total})
                    </Text>
                    <TouchableOpacity onPress={stopScan}>
                      <Text style={styles.stopSearchText}>Stop</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Rescan Action Button */}
              {!isScanning && !isConnecting && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={startScan}
                  style={styles.rescanTouchable}
                >
                  <LinearGradient
                    colors={['#8B75F5', '#6C5CE7']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.rescanGradient}
                  >
                    <IconButton icon="radar" size={20} iconColor="#FFFFFF" style={styles.iconZero} />
                    <Text style={styles.rescanText}>Scan for Hosts</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}

              {/* Error Display */}
              {errorMsg && !isConnecting && (
                <View style={styles.errorBanner}>
                  <IconButton icon="alert-circle-outline" size={20} iconColor="#EF4444" style={styles.iconZero} />
                  <Text style={styles.errorText}>{errorMsg}</Text>
                </View>
              )}
            </View>

            {/* Discovered Hosts Cards */}
            <View style={styles.hostsHeaderRow}>
              <Text variant="titleMedium" style={styles.hostsSectionTitle}>
                Available Hosts
              </Text>
              <View style={styles.countPill}>
                <Text style={styles.countPillText}>{discoveredHosts.length}</Text>
              </View>
            </View>

            {discoveredHosts.length === 0 && !isScanning && !isConnecting ? (
              <View style={styles.emptyCard}>
                <IconButton icon="wifi-off" size={32} iconColor="#A49DBA" style={styles.iconZero} />
                <Text style={styles.emptyText}>
                  No active broadcasting hosts found nearby. Ensure Host device started streaming.
                </Text>
              </View>
            ) : (
              discoveredHosts.map((host) => (
                <TouchableOpacity
                  key={host.ip}
                  activeOpacity={0.88}
                  onPress={() => connectToHost(host.ip)}
                  disabled={isConnecting}
                  style={styles.hostCardTouchable}
                >
                  <View style={styles.hostCard}>
                    <LinearGradient
                      colors={['#8B75F5', '#6C5CE7']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.hostIconBadge}
                    >
                      <IconButton icon="broadcast" size={20} iconColor="#FFFFFF" style={styles.iconZero} />
                    </LinearGradient>

                    <View style={styles.hostMeta}>
                      <Text variant="titleMedium" style={styles.hostIpText}>
                        {host.ip}
                      </Text>
                      <Text variant="bodySmall" style={styles.hostTrackText} numberOfLines={1}>
                        {host.fileName || 'Live System Audio'}
                      </Text>
                    </View>

                    <View style={styles.connectPill}>
                      <Text style={styles.connectPillText}>Connect</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}

            {/* Manual IP Entry Section */}
            <View style={styles.manualSection}>
              {!showManualInput ? (
                <TouchableOpacity
                  onPress={() => setShowManualInput(true)}
                  style={styles.manualToggleBtn}
                >
                  <IconButton icon="keyboard-outline" size={18} iconColor="#6C5CE7" style={styles.iconZero} />
                  <Text style={styles.manualToggleText}>Connect via IP Manually</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.manualCard}>
                  <TextInput
                    label="Host IP Address"
                    value={manualIp}
                    onChangeText={setManualIp}
                    placeholder="e.g. 192.168.1.100"
                    keyboardType="numeric"
                    mode="outlined"
                    disabled={isConnecting}
                    style={styles.manualInput}
                    outlineColor="#E8E2F4"
                    activeOutlineColor="#6C5CE7"
                  />
                  <View style={styles.manualActionRow}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => connectToHost(manualIp.trim())}
                      disabled={!manualIp.trim() || isConnecting}
                      style={[
                        styles.manualConnectBtn,
                        (!manualIp.trim() || isConnecting) && { opacity: 0.5 },
                      ]}
                    >
                      <Text style={styles.manualConnectText}>Connect</Text>
                    </TouchableOpacity>
                    <Button mode="text" onPress={() => setShowManualInput(false)} textColor="#7C7594">
                      Close
                    </Button>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 54,
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
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
  badgeDotGreen: {
    backgroundColor: '#10B981',
  },
  badgeDotGray: {
    backgroundColor: '#9CA3AF',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E1B2E',
    letterSpacing: 0.5,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  /* Connected Mode Styles */
  connectedSection: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  connectedHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  connectedTitle: {
    fontWeight: '800',
    color: '#1E1B2E',
    fontSize: 24,
    textAlign: 'center',
  },
  ipBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 10,
    gap: 4,
  },
  ipBadgeText: {
    color: '#047857',
    fontWeight: '700',
    fontSize: 13,
  },
  orbWrapper: {
    marginVertical: 24,
  },
  liveStatusText: {
    textAlign: 'center',
    fontWeight: '600',
    color: '#1E1B2E',
    fontSize: 16,
    marginHorizontal: 20,
  },
  connectedBottomBar: {
    marginTop: 40,
    alignItems: 'center',
  },
  disconnectTouchable: {
    alignItems: 'center',
  },
  disconnectGlowRing: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disconnectOrb: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  disconnectLabel: {
    marginTop: 10,
    fontWeight: '700',
    fontSize: 14,
    color: '#EF4444',
  },

  /* Discovery / Unconnected Mode Styles */
  discoverySection: {
    marginTop: 8,
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E8E2F4',
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  loader: {
    marginBottom: 12,
  },
  statusCardTitle: {
    fontWeight: '700',
    color: '#1E1B2E',
    fontSize: 17,
  },
  statusCardSubtext: {
    color: '#6E6782',
    marginTop: 4,
    fontSize: 14,
  },
  scanProgressBlock: {
    marginTop: 14,
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#F0EBF9',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressDetailsText: {
    fontSize: 12,
    color: '#7C7594',
  },
  stopSearchText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EF4444',
  },
  rescanTouchable: {
    marginTop: 14,
    borderRadius: 18,
    overflow: 'hidden',
  },
  rescanGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 8,
  },
  rescanText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 14,
    marginTop: 12,
    gap: 8,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    flex: 1,
  },
  hostsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  hostsSectionTitle: {
    fontWeight: '700',
    color: '#1E1B2E',
    fontSize: 18,
  },
  countPill: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  countPillText: {
    color: '#6C5CE7',
    fontWeight: '800',
    fontSize: 12,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E8E2F4',
    borderStyle: 'dashed',
    marginBottom: 20,
  },
  emptyText: {
    textAlign: 'center',
    color: '#7C7594',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  hostCardTouchable: {
    marginBottom: 12,
    borderRadius: 20,
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  hostCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8E2F4',
  },
  hostIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  hostMeta: {
    flex: 1,
    marginRight: 8,
  },
  hostIpText: {
    fontWeight: '700',
    color: '#1E1B2E',
    fontSize: 16,
  },
  hostTrackText: {
    color: '#7C7594',
    fontSize: 12,
    marginTop: 2,
  },
  connectPill: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  connectPillText: {
    color: '#6C5CE7',
    fontWeight: '700',
    fontSize: 13,
  },
  manualSection: {
    marginTop: 16,
  },
  manualToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  manualToggleText: {
    color: '#6C5CE7',
    fontWeight: '600',
    fontSize: 14,
  },
  manualCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E8E2F4',
    gap: 12,
  },
  manualInput: {
    backgroundColor: '#FFFFFF',
  },
  manualActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  manualConnectBtn: {
    flex: 1,
    backgroundColor: '#6C5CE7',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  manualConnectText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
