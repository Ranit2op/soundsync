import React, { useState, useEffect } from 'react';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { setAudioModeAsync } from 'expo-audio';
import { paperTheme } from './src/theme/paperTheme';
import { HomeScreen } from './src/screens/HomeScreen';
import { HostScreen } from './src/screens/HostScreen';
import { ListenerScreen } from './src/screens/ListenerScreen';

export default function App() {
  const [screen, setScreen] = useState('home');

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
    }).catch(console.error);
  }, []);

  return (
    <SafeAreaProvider>
      <PaperProvider theme={paperTheme}>
        {screen === 'home' && (
          <HomeScreen
            onSelectHost={() => setScreen('host')}
            onSelectListener={() => setScreen('listener')}
          />
        )}
        {screen === 'host' && <HostScreen onBack={() => setScreen('home')} />}
        {screen === 'listener' && <ListenerScreen onBack={() => setScreen('home')} />}
      </PaperProvider>
    </SafeAreaProvider>
  );
}
