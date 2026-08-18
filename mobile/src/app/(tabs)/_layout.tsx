import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import React from 'react';

import { FloatingTabBar, TabBarItem } from '@/components/ui/FloatingTabBar';
import { useCommunities } from '@/hooks/useCommunities';
import { usePendingFriendRequestCount } from '@/hooks/usePendingFriendRequestCount';
import { useUnreadConversationCount } from '@/hooks/useUnreadConversationCount';
import { useAppTheme } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

interface TabSpec {
  title: string;
  icon: IoniconName;
  iconFocused: IoniconName;
}

const TABS: Record<string, TabSpec> = {
  home: { title: 'Home', icon: 'home-outline', iconFocused: 'home' },
  chats: { title: 'Chat', icon: 'chatbubble-ellipses-outline', iconFocused: 'chatbubble-ellipses' },
  friends: { title: 'Friends', icon: 'person-add-outline', iconFocused: 'person-add' },
  communities: { title: 'Circles', icon: 'people-outline', iconFocused: 'people' },
  profile: { title: 'Profile', icon: 'person-circle-outline', iconFocused: 'person-circle' },
};

export default function TabsLayout() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const chatUnread = useUnreadConversationCount();
  const friendsUnread = usePendingFriendRequestCount();
  const { items: communities } = useCommunities();

  // Distinct communities with unread activity, mirroring the Chat badge's
  // "count conversations, not messages" rule.
  const circlesUnread = communities.filter((entry) => entry.is_member && entry.unread_count > 0).length;

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
          badges={{
            chats: chatUnread,
            friends: friendsUnread,
            communities: circlesUnread,
          }}
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