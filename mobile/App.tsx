import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// Screens (scaffold - expand with real components from web demo logic)
function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>FF Arena Home</Text>
      <Text>Hot tournaments, quick join, upcoming list</Text>
      {/* Add components from demo: banners, cards, countdowns */}
    </View>
  );
}

function TournamentsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tournaments</Text>
      <Text>Search, filters, join modals, live bracket</Text>
    </View>
  );
}

function LeaderboardScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Leaderboard</Text>
    </View>
  );
}

function WalletScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Wallet</Text>
      <Text>Balance, deposit, withdraw, tx history</Text>
    </View>
  );
}

function ProfileScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Text>Stats, FF UID verify, referral, KYC</Text>
    </View>
  );
}

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: '#FF6B00', tabBarStyle: { backgroundColor: '#1A1A2E' } }}>
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Tournaments" component={TournamentsScreen} />
        <Tab.Screen name="Leaderboard" component={LeaderboardScreen} />
        <Tab.Screen name="Wallet" component={WalletScreen} />
        <Tab.Screen name="Profile" component={ProfileScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F1A', alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
});