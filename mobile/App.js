import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, ActivityIndicator } from 'react-native';

import FeedScreen from './src/screens/FeedScreen';
import RulesScreen from './src/screens/RulesScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import PersonasScreen from './src/screens/PersonasScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import AuthScreen from './src/screens/AuthScreen';
import MemeToolsScreen from './src/screens/MemeToolsScreen';
import { useAuth } from './src/useAuth';

const Tab = createBottomTabNavigator();

function TabIcon({ icon, focused }) {
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.4 }}>{icon}</Text>
  );
}

export default function App() {
  const { user, loading, signIn, signOut } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f0f0f', justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#3a86ff" />
      </View>
    );
  }

  if (!user) {
    return (
      <>
        <StatusBar style="light" />
        <AuthScreen onSignIn={signIn} />
      </>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#0f0f0f', borderBottomColor: '#2d2d4e', borderBottomWidth: 1 },
          headerTintColor: '#e0e0e0',
          headerTitleStyle: { fontWeight: '700' },
          tabBarStyle: { backgroundColor: '#0f0f0f', borderTopColor: '#2d2d4e' },
          tabBarActiveTintColor: '#3a86ff',
          tabBarInactiveTintColor: '#6c757d',
          tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        }}
      >
        <Tab.Screen
          name="Feed"
          component={FeedScreen}
          options={{
            title: 'Message Feed',
            tabBarLabel: 'Feed',
            tabBarIcon: ({ focused }) => <TabIcon icon="💬" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Rules"
          component={RulesScreen}
          options={{
            title: 'Auto-Reply Rules',
            tabBarLabel: 'Rules',
            tabBarIcon: ({ focused }) => <TabIcon icon="⚡" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Analytics"
          component={AnalyticsScreen}
          options={{
            title: 'Analytics',
            tabBarLabel: 'Analytics',
            tabBarIcon: ({ focused }) => <TabIcon icon="📊" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Personas"
          component={PersonasScreen}
          options={{
            title: 'Personas',
            tabBarLabel: 'Personas',
            tabBarIcon: ({ focused }) => <TabIcon icon="🎭" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Memes"
          component={MemeToolsScreen}
          options={{
            title: 'Meme Tools',
            tabBarLabel: 'Memes',
            tabBarIcon: ({ focused }) => <TabIcon icon="🎨" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Settings"
          options={{
            title: 'Settings',
            tabBarLabel: 'Settings',
            tabBarIcon: ({ focused }) => <TabIcon icon="⚙️" focused={focused} />,
          }}
        >
          {() => <SettingsScreen onSignOut={signOut} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}
