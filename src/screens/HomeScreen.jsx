import React from 'react';
import { View, StyleSheet, StatusBar, TouchableOpacity } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';

export function HomeScreen({ onSelectHost, onSelectListener }) {
  return (
    <LinearGradient
      colors={['#EAE4F8', '#F4F1FA', '#F8F7FC']}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#EAE4F8" />

      {/* Header section with floating badge */}
      <View style={styles.header}>
        <View style={styles.logoBadgeContainer}>
          <LinearGradient
            colors={['#8B75F5', '#6C5CE7']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoBadge}
          >
            <IconButton icon="wifi" size={28} iconColor="#FFFFFF" style={styles.iconZero} />
          </LinearGradient>
        </View>

        <Text variant="headlineLarge" style={styles.title}>
          Wi-Fi Audio Sync
        </Text>
        <Text variant="bodyLarge" style={styles.subtitle}>
          Stream live system audio seamlessly between devices over Wi-Fi
        </Text>
      </View>

      {/* Cards Container */}
      <View style={styles.cardsContainer}>
        {/* Host Card */}
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={onSelectHost}
          style={styles.cardTouchable}
        >
          <View style={styles.card}>
            <LinearGradient
              colors={['#8B75F5', '#6C5CE7']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconBadge}
            >
              <IconButton icon="broadcast" size={28} iconColor="#FFFFFF" style={styles.iconZero} />
            </LinearGradient>

            <View style={styles.cardTextContainer}>
              <Text variant="titleLarge" style={styles.cardTitle}>
                Host Audio
              </Text>
              <Text variant="bodyMedium" style={styles.cardDescription}>
                Broadcast your system audio live to all nearby listening devices.
              </Text>
            </View>

            <View style={styles.chevronCircle}>
              <IconButton icon="chevron-right" size={20} iconColor="#6C5CE7" style={styles.iconZero} />
            </View>
          </View>
        </TouchableOpacity>

        {/* Listener Card */}
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={onSelectListener}
          style={styles.cardTouchable}
        >
          <View style={styles.card}>
            <LinearGradient
              colors={['#10B981', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconBadge}
            >
              <IconButton icon="headphones" size={28} iconColor="#FFFFFF" style={styles.iconZero} />
            </LinearGradient>

            <View style={styles.cardTextContainer}>
              <Text variant="titleLarge" style={styles.cardTitle}>
                Join as Listener
              </Text>
              <Text variant="bodyMedium" style={styles.cardDescription}>
                Discover local hosts automatically and listen to live audio in sync.
              </Text>
            </View>

            <View style={styles.chevronCircle}>
              <IconButton icon="chevron-right" size={20} iconColor="#059669" style={styles.iconZero} />
            </View>
          </View>
        </TouchableOpacity>
      </View>

      {/* Footer Info */}
      <View style={styles.footerContainer}>
        <View style={styles.footerPill}>
          <IconButton icon="wifi-check" size={16} iconColor="#7C7594" style={styles.iconZero} />
          <Text variant="bodySmall" style={styles.footerText}>
            Devices must be connected to the same Wi-Fi
          </Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
  },
  logoBadgeContainer: {
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
    marginBottom: 20,
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconZero: {
    margin: 0,
  },
  title: {
    fontWeight: '800',
    color: '#1E1B2E',
    textAlign: 'center',
    letterSpacing: -0.5,
    fontSize: 28,
  },
  subtitle: {
    color: '#6E6782',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 22,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  cardsContainer: {
    gap: 18,
    marginVertical: 'auto',
  },
  cardTouchable: {
    borderRadius: 24,
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E8E2F4',
  },
  iconBadge: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  cardTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  cardTitle: {
    fontWeight: '700',
    color: '#1E1B2E',
    fontSize: 18,
    marginBottom: 4,
  },
  cardDescription: {
    color: '#6E6782',
    fontSize: 13,
    lineHeight: 18,
  },
  chevronCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F4F1FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerContainer: {
    alignItems: 'center',
    marginBottom: 10,
  },
  footerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E8E2F4',
  },
  footerText: {
    color: '#7C7594',
    fontSize: 13,
    fontWeight: '500',
  },
});
