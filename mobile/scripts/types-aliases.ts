import type { Database } from '../src/types/database';

// Convenience aliases over the generated `Database` interface.
// This file is the maintained source of truth; the type generator appends
// it (without this import line) to the generated database.ts.

/** The public `profiles` row used across the app. */
export type Profile = Database['public']['Tables']['profiles']['Row'];

/** Fields a user can update about themselves. */
export type ProfileUpdate = Omit<
  Database['public']['Tables']['profiles']['Update'],
  'id' | 'email' | 'created_at' | 'updated_at'
>;

/** A direct-message row. */
export type MessageRow = Database['public']['Tables']['messages']['Row'];

/** Chat-list summary returned by `list_conversations`. */
export type ConversationSummary = Database['public']['Functions']['list_conversations']['Returns'];

/** Peer info returned by `conversation_info`. */
export type ConversationInfo = Database['public']['Functions']['conversation_info']['Returns'];

/** A story row stored in `public.stories`. */
export type StoryRow = Database['public']['Tables']['stories']['Row'];

/** A story as returned by `list_stories` (feed row with view/reaction info). */
export type StoryFeedRow = Database['public']['Functions']['list_stories']['Returns'];

/** A viewer entry returned by `story_viewers`. */
export type StoryViewer = Database['public']['Functions']['story_viewers']['Returns'];

/** A reply entry returned by `list_story_replies`. */
export type StoryReplyFeed = Database['public']['Functions']['list_story_replies']['Returns'];

/** A group chat row stored in `public.group_chats`. */
export type GroupChatRow = Database['public']['Tables']['group_chats']['Row'];

/** A group membership row stored in `public.group_members`. */
export type GroupMemberRow = Database['public']['Tables']['group_members']['Row'];

/** A group message row stored in `public.group_messages`. */
export type GroupMessageRow = Database['public']['Tables']['group_messages']['Row'];

/** Header info returned by `group_chat_info` (member only). */
export type GroupChatInfo = Database['public']['Functions']['group_chat_info']['Returns'];

/** Group chat-list summary returned by `list_group_chats`. */
export type GroupChatSummary = Database['public']['Functions']['list_group_chats']['Returns'];

/** Group members with profiles, returned by `group_members_list`. */
export type GroupMemberInfo = Database['public']['Functions']['group_members_list']['Returns'];

/** A group message with sender profile info, from `list_group_messages`. */
export type GroupMessageFeed = Database['public']['Functions']['list_group_messages']['Returns'];

/** Group role literal used across the app. */
export type GroupRole = 'owner' | 'admin' | 'member';

/** A community row stored in `public.communities`. */
export type CommunityRow = Database['public']['Tables']['communities']['Row'];

/** A community membership row stored in `public.community_members`. */
export type CommunityMemberRow = Database['public']['Tables']['community_members']['Row'];

/** A community channel row stored in `public.community_channels`. */
export type CommunityChannelRow = Database['public']['Tables']['community_channels']['Row'];

/** A community message row stored in `public.community_messages`. */
export type CommunityMessageRow = Database['public']['Tables']['community_messages']['Row'];

/** Community list entry returned by `list_communities`. */
export type CommunityListEntry = Database['public']['Functions']['list_communities']['Returns'];

/** Header info returned by `community_info` (member only). */
export type CommunityInfo = Database['public']['Functions']['community_info']['Returns'];

/** Community members with profiles, returned by `list_community_members`. */
export type CommunityMemberInfo = Database['public']['Functions']['list_community_members']['Returns'];

/** Classmate candidates returned by `list_class_users`. */
export type ClassmateInfo = Database['public']['Functions']['list_class_users']['Returns'];

/** Channel summary returned by `list_community_channels`. */
export type CommunityChannelSummary = Database['public']['Functions']['list_community_channels']['Returns'];

/** Open-channel context returned by `channel_info`. */
export type CommunityChannelInfo = Database['public']['Functions']['channel_info']['Returns'];

/** A channel message with sender profile info, from `list_channel_messages`. */
export type CommunityMessageFeed = Database['public']['Functions']['list_channel_messages']['Returns'];

/** Community role literal used across the app. */
export type CommunityRole = 'owner' | 'admin' | 'member';

/** A community poll row stored in `public.community_polls`. */
export type CommunityPollRow = Database['public']['Tables']['community_polls']['Row'];

/** A community poll option row stored in `public.community_poll_options`. */
export type CommunityPollOptionRow = Database['public']['Tables']['community_poll_options']['Row'];

/** A community poll vote row stored in `public.community_poll_votes`. */
export type CommunityPollVoteRow = Database['public']['Tables']['community_poll_votes']['Row'];

/** Poll feed entry (one row per option) returned by `list_community_polls`. */
export type CommunityPollFeed = Database['public']['Functions']['list_community_polls']['Returns'];

/** Voter breakdown returned by `list_community_poll_voters` (non-anonymous). */
export type CommunityPollVoter = Database['public']['Functions']['list_community_poll_voters']['Returns'];

/** A community event row stored in `public.community_events`. */
export type CommunityEventRow = Database['public']['Tables']['community_events']['Row'];

/** A community event RSVP row stored in `public.community_event_rsvps`. */
export type CommunityEventRsvpRow = Database['public']['Tables']['community_event_rsvps']['Row'];

/** Event feed entry returned by `list_community_events`. */
export type CommunityEventFeed = Database['public']['Functions']['list_community_events']['Returns'];

/** RSVP response literal used across the app. */
export type EventResponse = 'going' | 'maybe' | 'not_going';

/** A notification row stored in `public.notifications`. */
export type NotificationRow = Database['public']['Tables']['notifications']['Row'];

/** A notification with the actor's profile, from `list_notifications`. */
export type NotificationFeed = Database['public']['Functions']['list_notifications']['Returns'];

/** In-app notification type literals. */
export type NotificationType =
  | 'message'
  | 'friend_request'
  | 'friend_request_accepted'
  | 'message_reaction'
  | 'story_reaction'
  | 'story_reply'
  | 'community_announcement'
  | 'poll'
  | 'event_reminder'
  | 'mention';

/** A unified search result row returned by `search_all`. */
export type SearchResultRow = Database['public']['Functions']['search_all']['Returns'][number];

/** Searchable category literals used by the search tabs. */
export type SearchCategory = 'all' | 'users' | 'communities' | 'posts' | 'events' | 'resources';

/** A recent search query returned by `list_recent_searches`. */
export type RecentSearch = Database['public']['Functions']['list_recent_searches']['Returns'][number];
