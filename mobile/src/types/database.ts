/**
 * Type definitions matching the NEXA PostgreSQL schema.
 *
 * These mirror the output `supabase gen types` would produce. Regenerate or
 * update them whenever the schema in `supabase/migrations` changes.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string;
          username: string;
          avatar_url: string | null;
          bio: string | null;
          school: string | null;
          department: string | null;
          level: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name: string;
          username: string;
          avatar_url?: string | null;
          bio?: string | null;
          school?: string | null;
          department?: string | null;
          level?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string;
          username?: string;
          avatar_url?: string | null;
          bio?: string | null;
          school?: string | null;
          department?: string | null;
          level?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_id_fkey';
            columns: ['id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      friendships: {
        Row: {
          user_id: string;
          friend_id: string;
          status: 'pending' | 'accepted';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          friend_id: string;
          status?: 'pending' | 'accepted';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          friend_id?: string;
          status?: 'pending' | 'accepted';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'friendships_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'friendships_friend_id_fkey';
            columns: ['friend_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      blocks: {
        Row: {
          user_id: string;
          blocked_user_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          blocked_user_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          blocked_user_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'blocks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blocks_blocked_user_id_fkey';
            columns: ['blocked_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      conversations: {
        Row: {
          id: string;
          user_a_id: string;
          user_b_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_a_id: string;
          user_b_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_a_id?: string;
          user_b_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversations_user_a_id_fkey';
            columns: ['user_a_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversations_user_b_id_fkey';
            columns: ['user_b_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      messages: {
        Row: {
          id: string;
          seq: number;
          conversation_id: string;
          sender_id: string;
          body: string | null;
          client_id: string | null;
          reply_to_id: string | null;
          reactions: Json;
          created_at: string;
          delivered_at: string | null;
          read_at: string | null;
          edited_at: string | null;
          deleted_at: string | null;
          message_type: 'text' | 'image' | 'video' | 'voice';
          media_path: string | null;
          media_mime: string | null;
          media_width: number | null;
          media_height: number | null;
          media_duration: number | null;
          media_size: number | null;
        };
        Insert: {
          id?: string;
          seq?: number;
          conversation_id: string;
          sender_id: string;
          body?: string | null;
          client_id?: string | null;
          reply_to_id?: string | null;
          reactions?: Json;
          created_at?: string;
          delivered_at?: string | null;
          read_at?: string | null;
          edited_at?: string | null;
          deleted_at?: string | null;
          message_type?: 'text' | 'image' | 'video' | 'voice';
          media_path?: string | null;
          media_mime?: string | null;
          media_width?: number | null;
          media_height?: number | null;
          media_duration?: number | null;
          media_size?: number | null;
        };
        Update: {
          id?: string;
          seq?: number;
          conversation_id?: string;
          sender_id?: string;
          body?: string | null;
          client_id?: string | null;
          reply_to_id?: string | null;
          reactions?: Json;
          created_at?: string;
          delivered_at?: string | null;
          read_at?: string | null;
          edited_at?: string | null;
          deleted_at?: string | null;
          message_type?: 'text' | 'image' | 'video' | 'voice';
          media_path?: string | null;
          media_mime?: string | null;
          media_width?: number | null;
          media_height?: number | null;
          media_duration?: number | null;
          media_size?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_reply_to_id_fkey';
            columns: ['reply_to_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
        ];
      };
      group_chats: {
        Row: {
          id: string;
          name: string;
          avatar_path: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          avatar_path?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          avatar_path?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_chats_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      group_members: {
        Row: {
          chat_id: string;
          user_id: string;
          role: 'owner' | 'admin' | 'member';
          joined_at: string;
          last_read_seq: number;
        };
        Insert: {
          chat_id: string;
          user_id: string;
          role?: 'owner' | 'admin' | 'member';
          joined_at?: string;
          last_read_seq?: number;
        };
        Update: {
          chat_id?: string;
          user_id?: string;
          role?: 'owner' | 'admin' | 'member';
          joined_at?: string;
          last_read_seq?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'group_members_chat_id_fkey';
            columns: ['chat_id'];
            isOneToOne: false;
            referencedRelation: 'group_chats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      group_messages: {
        Row: {
          id: string;
          seq: number;
          chat_id: string;
          sender_id: string;
          body: string | null;
          reply_to_id: string | null;
          reactions: Json;
          message_type: 'text' | 'image' | 'video' | 'voice';
          media_path: string | null;
          media_mime: string | null;
          media_width: number | null;
          media_height: number | null;
          media_duration: number | null;
          media_size: number | null;
          created_at: string;
          edited_at: string | null;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          seq?: number;
          chat_id: string;
          sender_id: string;
          body?: string | null;
          reply_to_id?: string | null;
          reactions?: Json;
          message_type?: 'text' | 'image' | 'video' | 'voice';
          media_path?: string | null;
          media_mime?: string | null;
          media_width?: number | null;
          media_height?: number | null;
          media_duration?: number | null;
          media_size?: number | null;
          created_at?: string;
          edited_at?: string | null;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          seq?: number;
          chat_id?: string;
          sender_id?: string;
          body?: string | null;
          reply_to_id?: string | null;
          reactions?: Json;
          message_type?: 'text' | 'image' | 'video' | 'voice';
          media_path?: string | null;
          media_mime?: string | null;
          media_width?: number | null;
          media_height?: number | null;
          media_duration?: number | null;
          media_size?: number | null;
          created_at?: string;
          edited_at?: string | null;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'group_messages_chat_id_fkey';
            columns: ['chat_id'];
            isOneToOne: false;
            referencedRelation: 'group_chats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_messages_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_messages_reply_to_id_fkey';
            columns: ['reply_to_id'];
            isOneToOne: false;
            referencedRelation: 'group_messages';
            referencedColumns: ['id'];
          },
        ];
      };
      communities: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          avatar_path: string | null;
          school: string;
          department: string;
          level: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          avatar_path?: string | null;
          school: string;
          department: string;
          level: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          avatar_path?: string | null;
          school?: string;
          department?: string;
          level?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'communities_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      community_members: {
        Row: {
          community_id: string;
          user_id: string;
          role: 'owner' | 'admin' | 'member';
          joined_at: string;
        };
        Insert: {
          community_id: string;
          user_id: string;
          role?: 'owner' | 'admin' | 'member';
          joined_at?: string;
        };
        Update: {
          community_id?: string;
          user_id?: string;
          role?: 'owner' | 'admin' | 'member';
          joined_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'community_members_community_id_fkey';
            columns: ['community_id'];
            isOneToOne: false;
            referencedRelation: 'communities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'community_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      community_channels: {
        Row: {
          id: string;
          community_id: string;
          name: string;
          kind: 'general' | 'academics' | 'announcements' | 'social';
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          community_id: string;
          name: string;
          kind: 'general' | 'academics' | 'announcements' | 'social';
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          community_id?: string;
          name?: string;
          kind?: 'general' | 'academics' | 'announcements' | 'social';
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'community_channels_community_id_fkey';
            columns: ['community_id'];
            isOneToOne: false;
            referencedRelation: 'communities';
            referencedColumns: ['id'];
          },
        ];
      };
      community_messages: {
        Row: {
          id: string;
          seq: number;
          community_id: string;
          channel_id: string;
          sender_id: string;
          body: string | null;
          reply_to_id: string | null;
          reactions: Json;
          message_type: 'text' | 'image' | 'video' | 'voice';
          media_path: string | null;
          media_mime: string | null;
          media_width: number | null;
          media_height: number | null;
          media_duration: number | null;
          media_size: number | null;
          created_at: string;
          edited_at: string | null;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          seq?: number;
          community_id: string;
          channel_id: string;
          sender_id: string;
          body?: string | null;
          reply_to_id?: string | null;
          reactions?: Json;
          message_type?: 'text' | 'image' | 'video' | 'voice';
          media_path?: string | null;
          media_mime?: string | null;
          media_width?: number | null;
          media_height?: number | null;
          media_duration?: number | null;
          media_size?: number | null;
          created_at?: string;
          edited_at?: string | null;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          seq?: number;
          community_id?: string;
          channel_id?: string;
          sender_id?: string;
          body?: string | null;
          reply_to_id?: string | null;
          reactions?: Json;
          message_type?: 'text' | 'image' | 'video' | 'voice';
          media_path?: string | null;
          media_mime?: string | null;
          media_width?: number | null;
          media_height?: number | null;
          media_duration?: number | null;
          media_size?: number | null;
          created_at?: string;
          edited_at?: string | null;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'community_messages_community_id_fkey';
            columns: ['community_id'];
            isOneToOne: false;
            referencedRelation: 'communities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'community_messages_channel_id_fkey';
            columns: ['channel_id'];
            isOneToOne: false;
            referencedRelation: 'community_channels';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'community_messages_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'community_messages_reply_to_id_fkey';
            columns: ['reply_to_id'];
            isOneToOne: false;
            referencedRelation: 'community_messages';
            referencedColumns: ['id'];
          },
        ];
      };
      community_channel_reads: {
        Row: {
          community_id: string;
          channel_id: string;
          user_id: string;
          last_read_seq: number;
        };
        Insert: {
          community_id: string;
          channel_id: string;
          user_id: string;
          last_read_seq?: number;
        };
        Update: {
          community_id?: string;
          channel_id?: string;
          user_id?: string;
          last_read_seq?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'community_channel_reads_community_id_fkey';
            columns: ['community_id'];
            isOneToOne: false;
            referencedRelation: 'communities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'community_channel_reads_channel_id_fkey';
            columns: ['channel_id'];
            isOneToOne: false;
            referencedRelation: 'community_channels';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'community_channel_reads_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      community_polls: {
        Row: {
          id: string;
          community_id: string;
          created_by: string;
          question: string;
          is_anonymous: boolean;
          expires_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          community_id: string;
          created_by: string;
          question: string;
          is_anonymous?: boolean;
          expires_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          community_id?: string;
          created_by?: string;
          question?: string;
          is_anonymous?: boolean;
          expires_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'community_polls_community_id_fkey';
            columns: ['community_id'];
            isOneToOne: false;
            referencedRelation: 'communities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'community_polls_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      community_poll_options: {
        Row: {
          id: string;
          poll_id: string;
          option_text: string;
          position: number;
        };
        Insert: {
          id?: string;
          poll_id: string;
          option_text: string;
          position?: number;
        };
        Update: {
          id?: string;
          poll_id?: string;
          option_text?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'community_poll_options_poll_id_fkey';
            columns: ['poll_id'];
            isOneToOne: false;
            referencedRelation: 'community_polls';
            referencedColumns: ['id'];
          },
        ];
      };
      community_poll_votes: {
        Row: {
          poll_id: string;
          option_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          poll_id: string;
          option_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          poll_id?: string;
          option_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'community_poll_votes_poll_id_fkey';
            columns: ['poll_id'];
            isOneToOne: false;
            referencedRelation: 'community_polls';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'community_poll_votes_option_id_fkey';
            columns: ['option_id'];
            isOneToOne: false;
            referencedRelation: 'community_poll_options';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'community_poll_votes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      community_events: {
        Row: {
          id: string;
          community_id: string;
          created_by: string;
          title: string;
          description: string | null;
          starts_at: string;
          location: string | null;
          image_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          community_id: string;
          created_by: string;
          title: string;
          description?: string | null;
          starts_at: string;
          location?: string | null;
          image_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          community_id?: string;
          created_by?: string;
          title?: string;
          description?: string | null;
          starts_at?: string;
          location?: string | null;
          image_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'community_events_community_id_fkey';
            columns: ['community_id'];
            isOneToOne: false;
            referencedRelation: 'communities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'community_events_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      community_event_rsvps: {
        Row: {
          event_id: string;
          user_id: string;
          response: 'going' | 'maybe' | 'not_going';
          updated_at: string;
        };
        Insert: {
          event_id: string;
          user_id: string;
          response: 'going' | 'maybe' | 'not_going';
          updated_at?: string;
        };
        Update: {
          event_id?: string;
          user_id?: string;
          response?: 'going' | 'maybe' | 'not_going';
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'community_event_rsvps_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'community_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'community_event_rsvps_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      community_event_reminders: {
        Row: {
          event_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          event_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          event_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'community_event_reminders_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'community_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'community_event_reminders_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          actor_id: string | null;
          type: string;
          title: string;
          body: string;
          data: Json;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          actor_id?: string | null;
          type: string;
          title: string;
          body: string;
          data?: Json;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          actor_id?: string | null;
          type?: string;
          title?: string;
          body?: string;
          data?: Json;
          is_read?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      recent_searches: {
        Row: {
          id: string;
          user_id: string;
          query: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          query: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          query?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'recent_searches_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      stories: {
        Row: {
          id: string;
          user_id: string;
          kind: 'photo' | 'video' | 'text';
          media_path: string | null;
          media_mime: string | null;
          media_width: number | null;
          media_height: number | null;
          media_duration: number | null;
          media_size: number | null;
          body: string | null;
          created_at: string;
          expires_at: string;
          is_deleted: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          kind: 'photo' | 'video' | 'text';
          media_path?: string | null;
          media_mime?: string | null;
          media_width?: number | null;
          media_height?: number | null;
          media_duration?: number | null;
          media_size?: number | null;
          body?: string | null;
          created_at?: string;
          expires_at: string;
          is_deleted?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          kind?: 'photo' | 'video' | 'text';
          media_path?: string | null;
          media_mime?: string | null;
          media_width?: number | null;
          media_height?: number | null;
          media_duration?: number | null;
          media_size?: number | null;
          body?: string | null;
          created_at?: string;
          expires_at?: string;
          is_deleted?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'stories_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      story_views: {
        Row: {
          story_id: string;
          viewer_id: string;
          created_at: string;
        };
        Insert: {
          story_id: string;
          viewer_id: string;
          created_at?: string;
        };
        Update: {
          story_id?: string;
          viewer_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'story_views_story_id_fkey';
            columns: ['story_id'];
            isOneToOne: false;
            referencedRelation: 'stories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'story_views_viewer_id_fkey';
            columns: ['viewer_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      story_reactions: {
        Row: {
          id: number;
          story_id: string;
          user_id: string;
          emoji: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          story_id: string;
          user_id: string;
          emoji: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          story_id?: string;
          user_id?: string;
          emoji?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'story_reactions_story_id_fkey';
            columns: ['story_id'];
            isOneToOne: false;
            referencedRelation: 'stories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'story_reactions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      story_replies: {
        Row: {
          id: string;
          story_id: string;
          reply_from: string;
          reply_to: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          story_id: string;
          reply_from: string;
          reply_to: string;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          story_id?: string;
          reply_from?: string;
          reply_to?: string;
          body?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'story_replies_story_id_fkey';
            columns: ['story_id'];
            isOneToOne: false;
            referencedRelation: 'stories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'story_replies_reply_from_fkey';
            columns: ['reply_from'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'story_replies_reply_to_fkey';
            columns: ['reply_to'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      moderation_reports: {
        Row: {
          id: string;
          reporter_id: string;
          target_type: 'user' | 'message' | 'group_message' | 'community_message';
          target_id: string;
          category:
            | 'spam'
            | 'harassment'
            | 'impersonation'
            | 'scam'
            | 'inappropriate_content'
            | 'other';
          details: string | null;
          content: string | null;
          status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
          created_at: string;
        };
        Insert: {
          id?: string;
          reporter_id: string;
          target_type: 'user' | 'message' | 'group_message' | 'community_message';
          target_id: string;
          category:
            | 'spam'
            | 'harassment'
            | 'impersonation'
            | 'scam'
            | 'inappropriate_content'
            | 'other';
          details?: string | null;
          content?: string | null;
          status?: 'open' | 'reviewing' | 'resolved' | 'dismissed';
          created_at?: string;
        };
        Update: {
          id?: string;
          reporter_id?: string;
          target_type?: 'user' | 'message' | 'group_message' | 'community_message';
          target_id?: string;
          category?:
            | 'spam'
            | 'harassment'
            | 'impersonation'
            | 'scam'
            | 'inappropriate_content'
            | 'other';
          details?: string | null;
          content?: string | null;
          status?: 'open' | 'reviewing' | 'resolved' | 'dismissed';
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'moderation_reports_reporter_id_fkey';
            columns: ['reporter_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      conversation_mutes: {
        Row: {
          user_id: string;
          scope: 'dm' | 'group' | 'community';
          target_id: string;
          muted_at: string;
        };
        Insert: {
          user_id: string;
          scope: 'dm' | 'group' | 'community';
          target_id: string;
          muted_at?: string;
        };
        Update: {
          user_id?: string;
          scope?: 'dm' | 'group' | 'community';
          target_id?: string;
          muted_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversation_mutes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      friend_status: {
        Args: { p_other: string };
        Returns: string;
      };
      request_friend: {
        Args: { p_target: string };
        Returns: undefined;
      };
      respond_friend_request: {
        Args: { p_sender: string; p_accept: boolean };
        Returns: undefined;
      };
      cancel_friend_request: {
        Args: { p_target: string };
        Returns: undefined;
      };
      remove_friend: {
        Args: { p_other: string };
        Returns: undefined;
      };
      block_user: {
        Args: { p_target: string };
        Returns: undefined;
      };
      unblock_user: {
        Args: { p_target: string };
        Returns: undefined;
      };
      start_conversation: {
        Args: { p_other: string };
        Returns: string;
      };
      send_message: {
        Args: { p_conversation: string; p_body: string; p_reply_to?: string; p_client_id?: string };
        Returns: string;
      };
      send_media_message: {
        Args: {
          p_conversation: string;
          p_media_path: string;
          p_mime: string;
          p_type: string;
          p_caption?: string;
          p_reply_to?: string;
          p_width?: number;
          p_height?: number;
          p_duration?: number;
          p_size?: number;
          p_client_id?: string;
        };
        Returns: string;
      };
      mark_messages_delivered: {
        Args: { p_conversation: string };
        Returns: number;
      };
      mark_messages_read: {
        Args: { p_conversation: string };
        Returns: number;
      };
      delete_message: {
        Args: { p_message: string };
        Returns: undefined;
      };
      react_to_message: {
        Args: { p_message: string; p_emoji: string };
        Returns: undefined;
      };
      unreact_to_message: {
        Args: { p_message: string; p_emoji: string };
        Returns: undefined;
      };
      list_conversations: {
        Args: Record<PropertyKey, never>;
        Returns: {
          conversation_id: string;
          other_user_id: string;
          display_name: string;
          username: string;
          avatar_url: string | null;
          last_message: string | null;
          last_at: string;
          unread_count: number;
        };
      };
      conversation_info: {
        Args: { p_conversation: string };
        Returns: {
          other_user_id: string;
          display_name: string;
          username: string;
          avatar_url: string | null;
        };
      };
      group_role: {
        Args: { p_chat: string };
        Returns: string | null;
      };
      create_group: {
        Args: { p_name: string; p_member_ids: string[] };
        Returns: string;
      };
      list_group_chats: {
        Args: Record<PropertyKey, never>;
        Returns: {
          chat_id: string;
          name: string;
          avatar_path: string | null;
          last_message: string | null;
          last_at: string;
          unread_count: number;
          member_count: number;
          my_role: string;
        };
      };
      group_chat_info: {
        Args: { p_chat: string };
        Returns: {
          id: string;
          name: string;
          avatar_path: string | null;
          created_by: string;
          created_at: string;
          my_role: string;
        };
      };
      group_members_list: {
        Args: { p_chat: string };
        Returns: {
          user_id: string;
          display_name: string;
          username: string;
          avatar_url: string | null;
          role: string;
          joined_at: string;
        };
      };
      list_group_messages: {
        Args: { p_chat: string };
        Returns: {
          id: string;
          seq: number;
          chat_id: string;
          sender_id: string;
          sender_display_name: string;
          sender_username: string;
          sender_avatar_url: string | null;
          body: string | null;
          reply_to_id: string | null;
          reactions: Json;
          message_type: string;
          media_path: string | null;
          media_mime: string | null;
          media_width: number | null;
          media_height: number | null;
          media_duration: number | null;
          media_size: number | null;
          created_at: string;
          edited_at: string | null;
          deleted_at: string | null;
        };
      };
      mark_group_read: {
        Args: { p_chat: string };
        Returns: number;
      };
      send_group_message: {
        Args: { p_chat: string; p_body: string; p_reply_to?: string };
        Returns: string;
      };
      send_group_media_message: {
        Args: {
          p_chat: string;
          p_media_path: string;
          p_mime: string;
          p_type: string;
          p_caption?: string;
          p_reply_to?: string;
          p_width?: number;
          p_height?: number;
          p_duration?: number;
          p_size?: number;
        };
        Returns: string;
      };
      delete_group_message: {
        Args: { p_message: string };
        Returns: undefined;
      };
      react_to_group_message: {
        Args: { p_message: string; p_emoji: string };
        Returns: undefined;
      };
      unreact_to_group_message: {
        Args: { p_message: string; p_emoji: string };
        Returns: undefined;
      };
      add_group_members: {
        Args: { p_chat: string; p_member_ids: string[] };
        Returns: undefined;
      };
      remove_group_member: {
        Args: { p_chat: string; p_member: string };
        Returns: undefined;
      };
      set_group_member_role: {
        Args: { p_chat: string; p_member: string; p_role: string };
        Returns: undefined;
      };
      rename_group: {
        Args: { p_chat: string; p_name: string };
        Returns: undefined;
      };
      set_group_avatar: {
        Args: { p_chat: string; p_avatar_path: string };
        Returns: undefined;
      };
      leave_group: {
        Args: { p_chat: string };
        Returns: undefined;
      };
      delete_group: {
        Args: { p_chat: string };
        Returns: undefined;
      };
      list_communities: {
        Args: Record<PropertyKey, never>;
        Returns: {
          community_id: string;
          name: string;
          description: string | null;
          avatar_path: string | null;
          school: string;
          department: string;
          level: string;
          is_member: boolean;
          my_role: string | null;
          member_count: number;
          unread_count: number;
          last_at: string;
        };
      };
      community_info: {
        Args: { p_community: string };
        Returns: {
          id: string;
          name: string;
          description: string | null;
          avatar_path: string | null;
          school: string;
          department: string;
          level: string;
          created_by: string;
          created_at: string;
          my_role: string | null;
          member_count: number;
        };
      };
      list_community_members: {
        Args: { p_community: string };
        Returns: {
          user_id: string;
          display_name: string;
          username: string;
          avatar_url: string | null;
          role: string;
          joined_at: string;
        };
      };
      list_class_users: {
        Args: { p_community: string };
        Returns: {
          user_id: string;
          display_name: string;
          username: string;
          avatar_url: string | null;
        };
      };
      list_community_channels: {
        Args: { p_community: string };
        Returns: {
          channel_id: string;
          name: string;
          kind: string;
          sort_order: number;
          last_message: string;
          last_at: string;
          unread_count: number;
          can_post: boolean;
        };
      };
      channel_info: {
        Args: { p_channel: string };
        Returns: {
          id: string;
          community_id: string;
          community_name: string;
          name: string;
          kind: string;
          my_role: string | null;
          can_post: boolean;
        };
      };
      list_channel_messages: {
        Args: { p_channel: string };
        Returns: {
          id: string;
          seq: number;
          community_id: string;
          channel_id: string;
          sender_id: string;
          sender_display_name: string;
          sender_username: string;
          sender_avatar_url: string | null;
          body: string | null;
          reply_to_id: string | null;
          reactions: Json;
          message_type: string;
          media_path: string | null;
          media_mime: string | null;
          media_width: number | null;
          media_height: number | null;
          media_duration: number | null;
          media_size: number | null;
          created_at: string;
          edited_at: string | null;
          deleted_at: string | null;
        };
      };
      mark_channel_read: {
        Args: { p_channel: string };
        Returns: number;
      };
      send_community_message: {
        Args: { p_channel: string; p_body: string; p_reply_to?: string };
        Returns: string;
      };
      send_community_media_message: {
        Args: {
          p_channel: string;
          p_media_path: string;
          p_mime: string;
          p_type: string;
          p_caption?: string;
          p_reply_to?: string;
          p_width?: number;
          p_height?: number;
          p_duration?: number;
          p_size?: number;
        };
        Returns: string;
      };
      delete_community_message: {
        Args: { p_message: string };
        Returns: undefined;
      };
      react_to_community_message: {
        Args: { p_message: string; p_emoji: string };
        Returns: undefined;
      };
      unreact_to_community_message: {
        Args: { p_message: string; p_emoji: string };
        Returns: undefined;
      };
      add_community_members: {
        Args: { p_community: string; p_member_ids: string[] };
        Returns: undefined;
      };
      remove_community_member: {
        Args: { p_community: string; p_member: string };
        Returns: undefined;
      };
      set_community_role: {
        Args: { p_community: string; p_member: string; p_role: string };
        Returns: undefined;
      };
      update_community_settings: {
        Args: { p_community: string; p_name?: string; p_description?: string };
        Returns: undefined;
      };
      set_community_avatar: {
        Args: { p_community: string; p_avatar_path: string };
        Returns: undefined;
      };
      leave_community: {
        Args: { p_community: string };
        Returns: undefined;
      };
      delete_community: {
        Args: { p_community: string };
        Returns: undefined;
      };
      join_my_class_community: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      join_community: {
        Args: { p_community: string };
        Returns: undefined;
      };
      create_community: {
        Args: {
          p_school: string;
          p_department: string;
          p_level: string;
          p_name?: string;
          p_description?: string;
        };
        Returns: string;
      };
      create_community_poll: {
        Args: {
          p_community: string;
          p_question: string;
          p_options: string[];
          p_anonymous?: boolean;
          p_expires_at?: string;
        };
        Returns: string;
      };
      list_community_polls: {
        Args: { p_community: string };
        Returns: {
          poll_id: string;
          question: string;
          is_anonymous: boolean;
          expires_at: string | null;
          created_by: string;
          creator_display_name: string;
          creator_username: string;
          created_at: string;
          my_role: string;
          my_vote_option_id: string | null;
          total_votes: number;
          is_expired: boolean;
          option_id: string;
          option_text: string;
          option_position: number;
          option_votes: number;
        };
      };
      vote_community_poll: {
        Args: { p_poll: string; p_option: string };
        Returns: undefined;
      };
      list_community_poll_voters: {
        Args: { p_poll: string };
        Returns: {
          user_id: string;
          display_name: string;
          username: string;
          avatar_url: string | null;
          option_id: string;
          voted_at: string;
        };
      };
      delete_community_poll: {
        Args: { p_poll: string };
        Returns: undefined;
      };
      create_community_event: {
        Args: {
          p_community: string;
          p_title: string;
          p_description?: string;
          p_starts_at: string;
          p_location?: string;
          p_image_path?: string;
        };
        Returns: string;
      };
      list_community_events: {
        Args: { p_community: string };
        Returns: {
          event_id: string;
          title: string;
          description: string | null;
          starts_at: string;
          location: string | null;
          image_path: string | null;
          created_by: string;
          created_at: string;
          community_id: string;
          my_role: string;
          my_response: string | null;
          reminding: boolean;
          going_count: number;
          maybe_count: number;
          not_going_count: number;
        };
      };
      respond_to_event: {
        Args: { p_event: string; p_response: string };
        Returns: undefined;
      };
      toggle_event_reminder: {
        Args: { p_event: string };
        Returns: boolean;
      };
      update_community_event: {
        Args: {
          p_event: string;
          p_title?: string;
          p_description?: string;
          p_starts_at?: string;
          p_location?: string;
          p_image_path?: string;
        };
        Returns: undefined;
      };
      delete_community_event: {
        Args: { p_event: string };
        Returns: undefined;
      };
      list_notifications: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          type: string;
          title: string;
          body: string;
          data: Json;
          is_read: boolean;
          created_at: string;
          actor_id: string | null;
          actor_display_name: string | null;
          actor_username: string | null;
          actor_avatar_url: string | null;
        };
      };
      unread_notification_count: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      mark_notification_read: {
        Args: { p_id: string };
        Returns: undefined;
      };
      mark_all_notifications_read: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      process_due_event_reminders: {
        Args: { p_window_minutes?: number };
        Returns: number;
      };
      create_story: {
        Args: {
          p_kind: string;
          p_media_path?: string;
          p_mime?: string;
          p_width?: number;
          p_height?: number;
          p_duration?: number;
          p_size?: number;
          p_body?: string;
          p_lifetime_seconds?: number;
        };
        Returns: string;
      };
      delete_story: {
        Args: { p_story: string };
        Returns: undefined;
      };
      list_stories: {
        Args: Record<PropertyKey, never>;
        Returns: {
          story_id: string;
          user_id: string;
          display_name: string;
          username: string;
          avatar_url: string | null;
          kind: string;
          media_path: string | null;
          media_mime: string | null;
          media_width: number | null;
          media_height: number | null;
          media_duration: number | null;
          media_size: number | null;
          body: string | null;
          created_at: string;
          expires_at: string;
          viewed: boolean;
          view_count: number;
          my_reaction: string | null;
        };
      };
      record_story_view: {
        Args: { p_story: string };
        Returns: undefined;
      };
      story_viewers: {
        Args: { p_story: string };
        Returns: {
          viewer_id: string;
          display_name: string;
          username: string;
          avatar_url: string | null;
          viewed_at: string;
        };
      };
      react_to_story: {
        Args: { p_story: string; p_emoji: string };
        Returns: undefined;
      };
      remove_story_reaction: {
        Args: { p_story: string };
        Returns: undefined;
      };
      list_story_replies: {
        Args: { p_story: string };
        Returns: {
          reply_id: string;
          reply_from: string;
          display_name: string;
          username: string;
          avatar_url: string | null;
          body: string;
          created_at: string;
        };
      };
      send_story_reply: {
        Args: { p_story: string; p_body: string };
        Returns: {
          reply_id: string;
          message_id: string | null;
        };
      };
      purge_expired_stories: {
        Args: { p_older_than_days?: number };
        Returns: number;
      };
      search_all: {
        Args: { p_query: string; p_category?: string; p_limit?: number };
        Returns: {
          category: string;
          id: string;
          title: string;
          subtitle: string | null;
          body: string | null;
          avatar_url: string | null;
          created_at: string;
          rank: number;
          data: Json;
        }[];
      };
      add_recent_search: {
        Args: { p_query: string };
        Returns: undefined;
      };
      list_recent_searches: {
        Args: Record<PropertyKey, never>;
        Returns: {
          query: string;
          created_at: string;
        }[];
      };
      clear_recent_searches: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      report_user: {
        Args: { p_target: string; p_category: string; p_details?: string | null };
        Returns: undefined;
      };
      report_message: {
        Args: { p_message: string; p_category: string; p_details?: string | null };
        Returns: undefined;
      };
      report_group_message: {
        Args: { p_message: string; p_category: string; p_details?: string | null };
        Returns: undefined;
      };
      report_community_message: {
        Args: { p_message: string; p_category: string; p_details?: string | null };
        Returns: undefined;
      };
      mute_conversation: {
        Args: { p_scope: string; p_target: string };
        Returns: undefined;
      };
      unmute_conversation: {
        Args: { p_scope: string; p_target: string };
        Returns: undefined;
      };
      is_conversation_muted: {
        Args: { p_scope: string; p_target: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

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