import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Image } from 'expo-image';
import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.backgroundElement,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Baixar',
          tabBarIcon: ({ color }) => (
            <Image
              source={require('@/assets/images/tabIcons/home.png')}
              style={{ width: 24, height: 24, tintColor: color }}
              contentFit="contain"
            />
          ),
        }}
      />

      <Tabs.Screen
        name="downloads"
        options={{
          title: 'Downloads',
          tabBarIcon: ({ color }) => (
            <Image
              source={require('@/assets/images/tabIcons/download.png')}
              style={{ width: 24, height: 24, tintColor: color }}
              contentFit="contain"
            />
          ),
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          title: 'Biblioteca',
          tabBarIcon: ({ color }) => (
            <Image
              source={require('@/assets/images/tabIcons/explore.png')}
              style={{ width: 24, height: 24, tintColor: color }}
              contentFit="contain"
            />
          ),
        }}
      />
    </Tabs>
  );
}
