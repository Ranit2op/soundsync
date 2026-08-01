import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { Text, Card, IconButton } from 'react-native-paper';

export function HomeScreen({
  onSelectHost,
  onSelectListener,
}) {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Text variant="displaySmall" style={styles.title}>
          Wi-Fi Audio Sync
        </Text>
        <Text variant="bodyLarge" style={styles.subtitle}>
          Share and listen to music with nearby devices over Wi-Fi
        </Text>
      </View>

      <View style={styles.cardsContainer}>
        {/* Host Card */}
        <Card style={styles.card} mode="elevated" onPress={onSelectHost}>
          <Card.Content style={styles.cardContent}>
            <View style={[styles.iconContainer, styles.hostIconBg]}>
              <IconButton icon="broadcast" size={36} iconColor="#4F46E5" />
            </View>
            <Text variant="titleLarge" style={styles.cardTitle}>
              Host
            </Text>
            <Text variant="bodyMedium" style={styles.cardDescription}>
              Share your audio with others. Pick a file and broadcast it to nearby listeners.
            </Text>
          </Card.Content>
        </Card>

        {/* Listener Card */}
        <Card style={styles.card} mode="elevated" onPress={onSelectListener}>
          <Card.Content style={styles.cardContent}>
            <View style={[styles.iconContainer, styles.listenerIconBg]}>
              <IconButton icon="headphones" size={36} iconColor="#0891b2" />
            </View>
            <Text variant="titleLarge" style={styles.cardTitle}>
              Listener
            </Text>
            <Text variant="bodyMedium" style={styles.cardDescription}>
              Join a nearby host automatically and listen to their shared audio in sync.
            </Text>
          </Card.Content>
        </Card>
      </View>

      <Text variant="bodySmall" style={styles.footer}>
        Both devices must be on the same Wi-Fi network
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 80,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
  },
  header: {
    marginBottom: 40,
    alignItems: 'center',
  },
  title: {
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'center',
  },
  subtitle: {
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 24,
    paddingHorizontal: 16,
  },
  cardsContainer: {
    gap: 16,
  },
  card: {
    borderRadius: 24,
    backgroundColor: '#ffffff',
    elevation: 4,
  },
  cardContent: {
    padding: 28,
    alignItems: 'center',
  },
  iconContainer: {
    borderRadius: 24,
    marginBottom: 16,
  },
  hostIconBg: {
    backgroundColor: '#eef2ff',
  },
  listenerIconBg: {
    backgroundColor: '#ecfeff',
  },
  cardTitle: {
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  cardDescription: {
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  footer: {
    textAlign: 'center',
    color: '#9ca3af',
    marginTop: 32,
  },
});
