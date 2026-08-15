import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import React from 'react';

import { FloatingTabBar, TabBarItem } from '@/components/ui/FloatingTabBar';
import { colors } from '@/constants/theme';
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
  const router = useRouter();
  const { unreadCount } = useNotifications();

  const items: TabBarItem[] = Object.entries(TABS).map(([name, { title, icon, iconFocused }]) => ({
    name,
    title,
    icon: (focused: boolean) => (
      <Ionicons
        name={focused ? iconFocused : icon}
        size={22}
        color={focused ? colors.primary : colors.textMuted}
      />
    ),
  }));

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
      tabBar={(props) => (
        <FloatingTabBar
          items={items}
          active={props.state.routes[props.state.index].name}
          unreadBadge={
            unreadCount > 0
              ? { name: 'notifications', count: unreadCount }
              : undefined
          }
          onSelect={(name) => {
            const state = props.state;
            if (state.index === state.routes.findIndex((r) => r.name === name)) {
              return;
            }
            router.navigate(name as never);
          }}
        />
      )}
    >
      {Object.keys(TABS).map((name) => (
        <Tabs.Screen key={name} name={name} />
      ))}
    </Tabs>
  );
}