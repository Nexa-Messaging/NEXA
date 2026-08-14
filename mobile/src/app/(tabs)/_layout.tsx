import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';

import { colors, fontWeights, spacing } from '@/constants/theme';
import { useNotifications } from '@/hooks/useNotifications';

type IoniconName = keyof typeof Ionicons.glyphMap;

interface TabSpec {
  title: string;
  icon: IoniconName;
  iconFocused: IoniconName;
}

const TABS: Record<string, TabSpec> = {
  home: { title: 'Home', icon: 'home-outline', iconFocused: 'home' },
  chats: { title: 'Chats', icon: 'chatbubble-ellipses-outline', iconFocused: 'chatbubble-ellipses' },
  camera: { title: 'Camera', icon: 'camera-outline', iconFocused: 'camera' },
  notifications: { title: 'Alerts', icon: 'notifications-outline', iconFocused: 'notifications' },
  communities: { title: 'Circles', icon: 'people-outline', iconFocused: 'people' },
  profile: { title: 'Profile', icon: 'person-circle-outline', iconFocused: 'person-circle' },
};

export default function TabsLayout() {
  const { unreadCount } = useNotifications();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: { fontSize: 11, fontWeight: fontWeights.medium },
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
        },
      }}
    >
      {Object.entries(TABS).map(([name, { title, icon, iconFocused }]) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? iconFocused : icon} size={size} color={color} />
            ),
            tabBarBadge:
              name === 'notifications' && unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
            tabBarBadgeStyle: {
              backgroundColor: colors.danger,
              color: colors.surface,
              fontSize: 10,
              fontWeight: fontWeights.bold,
            },
          }}
        />
      ))}
    </Tabs>
  );
}