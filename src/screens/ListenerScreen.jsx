import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Button, Text, Card, ActivityIndicator, TextInput, IconButton } from 'react-native-paper';
import { ListenerClient } from '../network/ListenerClient';

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

  return (
    <View style={styles.container}>
      <Button icon="arrow-left" mode="text" onPress={handleBack} style={styles.backButton}>
        Back
      </Button>

      <Text variant="displaySmall" style={styles.title}>Listener</Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        Connect to a broadcasting host nearby
      </Text>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Status / Active Connection Card */}
        <Card style={styles.card} mode="elevated">
          <Card.Content style={styles.statusCardContent}>
            {isConnecting && <ActivityIndicator animating={true} size="large" style={styles.loader} />}

            <Text variant="titleMedium" style={styles.statusHeader}>
              {connectedHostIp ? `Connected to ${connectedHostIp}` : 'Network Status'}
            </Text>
            
            {status ? <Text variant="bodyMedium" style={styles.statusText}>{status}</Text> : null}

            {/* Scan Progress Bar & Stop Button */}
            {isScanning && (
              <View style={styles.scanningContainer}>
                <Text style={styles.progressText}>
                  Scanning subnet... ({scanProgress.current}/{scanProgress.total})
                </Text>
                <Button
                  mode="outlined"
                  icon="stop-circle-outline"
                  onPress={stopScan}
                  style={styles.stopButton}
                  compact
                >
                  Stop Search
                </Button>
              </View>
            )}

            {/* Connected Actions */}
            {connectedHostIp && (
              <Button
                mode="contained-tonal"
                icon="close-circle-outline"
                onPress={disconnectSession}
                style={styles.disconnectButton}
              >
                Disconnect
              </Button>
            )}

            {/* Rescan Button if not connected */}
            {!connectedHostIp && !isScanning && !isConnecting && (
              <Button
                mode="contained"
                icon="radar"
                onPress={startScan}
                style={styles.rescanButton}
              >
                Rescan Network
              </Button>
            )}

            {/* Error Message Display */}
            {errorMsg && !isConnecting && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Discovered Hosts Section */}
        {!connectedHostIp && (
          <View style={styles.hostsSection}>
            <Text variant="titleMedium" style={styles.sectionHeader}>
              Available Hosts ({discoveredHosts.length})
            </Text>

            {discoveredHosts.length === 0 && !isScanning && !isConnecting ? (
              <Card style={styles.emptyCard} mode="outlined">
                <Card.Content style={styles.emptyContent}>
                  <Text variant="bodyMedium" style={styles.emptyText}>
                    No hosts found on your local network. Make sure the Host device has started broadcasting.
                  </Text>
                </Card.Content>
              </Card>
            ) : (
              discoveredHosts.map((host) => (
                <Card key={host.ip} style={styles.hostCard} mode="elevated">
                  <Card.Content style={styles.hostCardContent}>
                    <IconButton icon="broadcast" size={28} style={styles.hostIcon} />
                    <View style={styles.hostDetails}>
                      <Text variant="titleMedium" style={styles.hostIp}>
                        {host.ip}
                      </Text>
                      <Text variant="bodySmall" style={styles.hostTrack} numberOfLines={1}>
                        🎵 {host.fileName}
                      </Text>
                    </View>
                    <Button
                      mode="contained"
                      onPress={() => connectToHost(host.ip)}
                      disabled={isConnecting}
                      compact
                    >
                      Connect
                    </Button>
                  </Card.Content>
                </Card>
              ))
            )}
          </View>
        )}

        {/* Manual IP Section */}
        {!connectedHostIp && (
          <View style={styles.manualSection}>
            {!showManualInput ? (
              <Button
                mode="text"
                icon="keyboard-outline"
                onPress={() => setShowManualInput(true)}
                style={styles.manualToggle}
              >
                Connect via IP Address Manually
              </Button>
            ) : (
              <Card style={styles.card} mode="outlined">
                <Card.Content style={styles.manualCardContent}>
                  <TextInput
                    label="Host IP Address"
                    value={manualIp}
                    onChangeText={setManualIp}
                    placeholder="e.g. 192.168.0.110"
                    keyboardType="numeric"
                    mode="outlined"
                    disabled={isConnecting}
                    style={styles.input}
                  />
                  <View style={styles.manualActions}>
                    <Button
                      mode="contained"
                      onPress={() => connectToHost(manualIp.trim())}
                      disabled={!manualIp.trim() || isConnecting}
                      style={{ flex: 1 }}
                    >
                      Connect
                    </Button>
                    <Button mode="text" onPress={() => setShowManualInput(false)}>
                      Hide
                    </Button>
                  </View>
                </Card.Content>
              </Card>
            )}
          </View>
        )}
      </ScrollView>
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
  scrollContent: {
    paddingBottom: 40,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 12,
    marginLeft: -8,
  },
  title: {
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  subtitle: {
    color: '#6b7280',
    marginTop: 4,
    marginBottom: 20,
  },
  card: {
    borderRadius: 20,
    backgroundColor: '#ffffff',
    marginBottom: 20,
    elevation: 3,
  },
  statusCardContent: {
    padding: 20,
    alignItems: 'center',
  },
  statusHeader: {
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  statusText: {
    color: '#4b5563',
    textAlign: 'center',
    marginBottom: 12,
  },
  loader: {
    marginBottom: 12,
  },
  scanningContainer: {
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  progressText: {
    fontSize: 12,
    color: '#6b7280',
  },
  stopButton: {
    borderColor: '#ef4444',
  },
  disconnectButton: {
    marginTop: 12,
  },
  rescanButton: {
    marginTop: 8,
    borderRadius: 12,
  },
  errorContainer: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    width: '100%',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 13,
    textAlign: 'center',
  },
  hostsSection: {
    marginBottom: 20,
  },
  sectionHeader: {
    fontWeight: '700',
    color: '#374151',
    marginBottom: 12,
  },
  emptyCard: {
    borderRadius: 16,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  emptyContent: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    color: '#9ca3af',
    textAlign: 'center',
  },
  hostCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    marginBottom: 10,
    elevation: 2,
  },
  hostCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  hostIcon: {
    backgroundColor: '#eef2ff',
    marginRight: 12,
  },
  hostDetails: {
    flex: 1,
    marginRight: 8,
  },
  hostIp: {
    fontWeight: '700',
    color: '#111827',
  },
  hostTrack: {
    color: '#6b7280',
    marginTop: 2,
  },
  manualSection: {
    marginTop: 8,
  },
  manualToggle: {
    alignSelf: 'center',
  },
  manualCardContent: {
    padding: 16,
    gap: 12,
  },
  input: {
    backgroundColor: '#ffffff',
  },
  manualActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
