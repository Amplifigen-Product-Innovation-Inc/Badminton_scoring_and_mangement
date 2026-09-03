export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      courts: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      cross_category_qualifications: {
        Row: {
          created_at: string
          id: string
          qualification_rank: number
          source_group_id: string
          stage_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          qualification_rank: number
          source_group_id: string
          stage_id: string
        }
        Update: {
          created_at?: string
          id?: string
          qualification_rank?: number
          source_group_id?: string
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cross_category_qualifications_source_group_id_fkey"
            columns: ["source_group_id"]
            isOneToOne: false
            referencedRelation: "tournament_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cross_category_qualifications_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "tournament_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          game_number: number
          id: string
          match_id: string
          status: Database["public"]["Enums"]["game_status"]
          team_1_score: number
          team_2_score: number
          winner_team_id: string | null
        }
        Insert: {
          game_number: number
          id?: string
          match_id: string
          status?: Database["public"]["Enums"]["game_status"]
          team_1_score?: number
          team_2_score?: number
          winner_team_id?: string | null
        }
        Update: {
          game_number?: number
          id?: string
          match_id?: string
          status?: Database["public"]["Enums"]["game_status"]
          team_1_score?: number
          team_2_score?: number
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "games_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      group_players: {
        Row: {
          group_id: string
          id: string
          player_id: string
        }
        Insert: {
          group_id: string
          id?: string
          player_id: string
        }
        Update: {
          group_id?: string
          id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_players_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "tournament_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      group_qualifications: {
        Row: {
          created_at: string
          group_id: string
          id: string
          is_override: boolean
          overridden_by: string | null
          player_id: string
          qualification_rank: number
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          is_override?: boolean
          overridden_by?: string | null
          player_id: string
          qualification_rank: number
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          is_override?: boolean
          overridden_by?: string | null
          player_id?: string
          qualification_rank?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_qualifications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "tournament_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_qualifications_overridden_by_fkey"
            columns: ["overridden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_qualifications_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_qualifications_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      match_participants: {
        Row: {
          id: string
          match_id: string
          player_id: string
          team_id: string
        }
        Insert: {
          id?: string
          match_id: string
          player_id: string
          team_id: string
        }
        Update: {
          id?: string
          match_id?: string
          player_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_participants_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_participants_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_participants_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_participants_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          best_of: number
          completed_at: string | null
          court_id: string | null
          first_server_player_id: string | null
          group_id: string | null
          id: string
          match_number: number
          match_type: Database["public"]["Enums"]["match_type"]
          scorer_id: string | null
          stage_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["match_status"]
          tournament_id: string
          winner_team_id: string | null
        }
        Insert: {
          best_of?: number
          completed_at?: string | null
          court_id?: string | null
          first_server_player_id?: string | null
          group_id?: string | null
          id?: string
          match_number: number
          match_type: Database["public"]["Enums"]["match_type"]
          scorer_id?: string | null
          stage_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          tournament_id: string
          winner_team_id?: string | null
        }
        Update: {
          best_of?: number
          completed_at?: string | null
          court_id?: string | null
          first_server_player_id?: string | null
          group_id?: string | null
          id?: string
          match_number?: number
          match_type?: Database["public"]["Enums"]["match_type"]
          scorer_id?: string | null
          stage_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          tournament_id?: string
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_first_server_player_id_fkey"
            columns: ["first_server_player_id"]
            isOneToOne: false
            referencedRelation: "player_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_first_server_player_id_fkey"
            columns: ["first_server_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "tournament_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_scorer_id_fkey"
            columns: ["scorer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "tournament_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      player_rating_history: {
        Row: {
          created_at: string
          id: string
          match_id: string | null
          match_performance: number
          new_rating: number
          player_id: string
          previous_rating: number
          tournament_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          match_id?: string | null
          match_performance: number
          new_rating: number
          player_id: string
          previous_rating: number
          tournament_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string | null
          match_performance?: number
          new_rating?: number
          player_id?: string
          previous_rating?: number
          tournament_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_rating_history_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_rating_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_rating_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_rating_history_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      player_ratings: {
        Row: {
          category_id: string | null
          confidence_status: Database["public"]["Enums"]["rating_confidence_status"]
          id: string
          matches_count: number
          player_id: string
          rating: number
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          confidence_status?: Database["public"]["Enums"]["rating_confidence_status"]
          id?: string
          matches_count?: number
          player_id: string
          rating?: number
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          confidence_status?: Database["public"]["Enums"]["rating_confidence_status"]
          id?: string
          matches_count?: number
          player_id?: string
          rating?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_ratings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "rating_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_ratings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "player_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_ratings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auth_user_id: string
          created_at: string
          id: string
          player_id: string | null
          role: Database["public"]["Enums"]["profile_role"]
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          id?: string
          player_id?: string | null
          role: Database["public"]["Enums"]["profile_role"]
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          id?: string
          player_id?: string | null
          role?: Database["public"]["Enums"]["profile_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      rallies: {
        Row: {
          created_at: string
          created_by: string | null
          event_type: Database["public"]["Enums"]["rally_event_type"]
          game_id: string
          id: string
          losing_player_id: string | null
          player_id: string | null
          sequence_number: number
          winning_team_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_type: Database["public"]["Enums"]["rally_event_type"]
          game_id: string
          id?: string
          losing_player_id?: string | null
          player_id?: string | null
          sequence_number?: never
          winning_team_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_type?: Database["public"]["Enums"]["rally_event_type"]
          game_id?: string
          id?: string
          losing_player_id?: string | null
          player_id?: string | null
          sequence_number?: never
          winning_team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rallies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rallies_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rallies_losing_player_id_fkey"
            columns: ["losing_player_id"]
            isOneToOne: false
            referencedRelation: "player_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rallies_losing_player_id_fkey"
            columns: ["losing_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rallies_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rallies_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rallies_winning_team_id_fkey"
            columns: ["winning_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      rating_categories: {
        Row: {
          display_order: number
          id: string
          max_rating: number
          min_rating: number
          name: string
        }
        Insert: {
          display_order: number
          id?: string
          max_rating: number
          min_rating: number
          name: string
        }
        Update: {
          display_order?: number
          id?: string
          max_rating?: number
          min_rating?: number
          name?: string
        }
        Relationships: []
      }
      teams: {
        Row: {
          id: string
          match_id: string
          source_category: string | null
          source_group_id: string | null
          team_number: number
        }
        Insert: {
          id?: string
          match_id: string
          source_category?: string | null
          source_group_id?: string | null
          team_number: number
        }
        Update: {
          id?: string
          match_id?: string
          source_category?: string | null
          source_group_id?: string | null
          team_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "teams_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_source_group_id_fkey"
            columns: ["source_group_id"]
            isOneToOne: false
            referencedRelation: "tournament_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_courts: {
        Row: {
          court_id: string
          id: string
          status: Database["public"]["Enums"]["tournament_court_status"]
          tournament_id: string
        }
        Insert: {
          court_id: string
          id?: string
          status?: Database["public"]["Enums"]["tournament_court_status"]
          tournament_id: string
        }
        Update: {
          court_id?: string
          id?: string
          status?: Database["public"]["Enums"]["tournament_court_status"]
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_courts_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_courts_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_groups: {
        Row: {
          category: string | null
          id: string
          name: string
          stage_id: string
        }
        Insert: {
          category?: string | null
          id?: string
          name: string
          stage_id: string
        }
        Update: {
          category?: string | null
          id?: string
          name?: string
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_groups_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "tournament_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_player_stats: {
        Row: {
          average_performance: number | null
          drops: number
          id: string
          matches_lost: number
          matches_played: number
          matches_won: number
          player_id: string
          splits: number
          tournament_id: string
          tournament_points: number
          tournament_rating: number | null
          winning_shots: number
        }
        Insert: {
          average_performance?: number | null
          drops?: number
          id?: string
          matches_lost?: number
          matches_played?: number
          matches_won?: number
          player_id: string
          splits?: number
          tournament_id: string
          tournament_points?: number
          tournament_rating?: number | null
          winning_shots?: number
        }
        Update: {
          average_performance?: number | null
          drops?: number
          id?: string
          matches_lost?: number
          matches_played?: number
          matches_won?: number
          player_id?: string
          splits?: number
          tournament_id?: string
          tournament_points?: number
          tournament_rating?: number | null
          winning_shots?: number
        }
        Relationships: [
          {
            foreignKeyName: "tournament_player_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_player_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_player_stats_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_players: {
        Row: {
          id: string
          joined_at: string
          player_id: string
          status: Database["public"]["Enums"]["tournament_player_status"]
          tournament_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          player_id: string
          status?: Database["public"]["Enums"]["tournament_player_status"]
          tournament_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          player_id?: string
          status?: Database["public"]["Enums"]["tournament_player_status"]
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_stages: {
        Row: {
          id: string
          name: string
          stage_order: number
          stage_type: Database["public"]["Enums"]["stage_type"]
          status: Database["public"]["Enums"]["stage_status"]
          tournament_id: string
        }
        Insert: {
          id?: string
          name: string
          stage_order: number
          stage_type: Database["public"]["Enums"]["stage_type"]
          status?: Database["public"]["Enums"]["stage_status"]
          tournament_id: string
        }
        Update: {
          id?: string
          name?: string
          stage_order?: number
          stage_type?: Database["public"]["Enums"]["stage_type"]
          status?: Database["public"]["Enums"]["stage_status"]
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_stages_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          created_at: string
          created_by: string | null
          date: string | null
          description: string | null
          format: string | null
          id: string
          location: string | null
          max_score: number
          name: string
          num_courts: number | null
          status: Database["public"]["Enums"]["tournament_status"]
          target_score: number
          updated_at: string
          win_by: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date?: string | null
          description?: string | null
          format?: string | null
          id?: string
          location?: string | null
          max_score?: number
          name: string
          num_courts?: number | null
          status?: Database["public"]["Enums"]["tournament_status"]
          target_score?: number
          updated_at?: string
          win_by?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string | null
          description?: string | null
          format?: string | null
          id?: string
          location?: string | null
          max_score?: number
          name?: string
          num_courts?: number | null
          status?: Database["public"]["Enums"]["tournament_status"]
          target_score?: number
          updated_at?: string
          win_by?: number
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      player_directory: {
        Row: {
          current_category: string | null
          current_rating: number | null
          email: string | null
          first_joined: string | null
          id: string | null
          is_returning: boolean | null
          last_played: string | null
          matches_played: number | null
          matches_won: number | null
          name: string | null
          phone: string | null
          rating_confidence:
            | Database["public"]["Enums"]["rating_confidence_status"]
            | null
          tournaments_played: number | null
          win_pct: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_player_rating_update: {
        Args: {
          p_match_id: string
          p_match_performance: number
          p_player_id: string
          p_tournament_id: string
        }
        Returns: number
      }
      auth_profile_id: { Args: never; Returns: string }
      auth_role: {
        Args: never
        Returns: Database["public"]["Enums"]["profile_role"]
      }
      calculate_match_result: {
        Args: { p_match_id: string }
        Returns: {
          team1_games_won: number
          team2_games_won: number
          winner_team_id: string
        }[]
      }
      calculate_player_match_performance: {
        Args: { p_match_id: string; p_player_id: string }
        Returns: number
      }
      complete_match: { Args: { p_match_id: string }; Returns: undefined }
      compute_cross_category_qualification: {
        Args: { p_stage_id: string }
        Returns: undefined
      }
      compute_group_qualification: {
        Args: { p_group_id: string }
        Returns: undefined
      }
      cross_category_standings: {
        Args: { p_stage_id: string }
        Returns: {
          lost: number
          played: number
          player_names: string
          points: number
          rank: number
          source_group_id: string
          team_label: string
          total_score: number
          won: number
        }[]
      }
      group_standings: {
        Args: { p_group_id: string }
        Returns: {
          aggregate_performance: number
          game_differential: number
          lost: number
          played: number
          player_id: string
          player_name: string
          rank: number
          tournament_points: number
          won: number
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_scorer: { Args: never; Returns: boolean }
      override_group_qualification: {
        Args: { p_group_id: string; p_player_id: string; p_rank: number }
        Returns: undefined
      }
      player_leaderboard: {
        Args: never
        Returns: {
          career_tournament_points: number
          category: string
          confidence: Database["public"]["Enums"]["rating_confidence_status"]
          current_rating: number
          name: string
          player_id: string
          tournaments_played: number
        }[]
      }
      recompute_game_score: { Args: { p_game_id: string }; Returns: undefined }
      reopen_match: { Args: { p_match_id: string }; Returns: undefined }
      reset_match: { Args: { p_match_id: string }; Returns: undefined }
      start_match: {
        Args: { p_first_server_player_id?: string; p_match_id: string }
        Returns: undefined
      }
      start_next_game: { Args: { p_match_id: string }; Returns: undefined }
      undo_last_rally: { Args: { p_game_id: string }; Returns: undefined }
    }
    Enums: {
      game_status: "IN_PROGRESS" | "COMPLETED"
      match_status: "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED"
      match_type: "SINGLES" | "DOUBLES"
      profile_role: "ADMIN" | "SCORER"
      rally_event_type: "WINNER" | "DROP" | "SPLIT"
      rating_confidence_status: "PROVISIONAL" | "EMERGING" | "ESTABLISHED"
      stage_status: "PENDING" | "ACTIVE" | "COMPLETED"
      stage_type: "GROUP" | "CROSS_CATEGORY" | "FINAL"
      tournament_court_status: "AVAILABLE" | "ASSIGNED" | "LIVE" | "COMPLETED"
      tournament_player_status: "ACTIVE" | "WITHDRAWN"
      tournament_status:
        | "DRAFT"
        | "OPEN"
        | "IN_PROGRESS"
        | "COMPLETED"
        | "CANCELLED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      game_status: ["IN_PROGRESS", "COMPLETED"],
      match_status: ["SCHEDULED", "LIVE", "COMPLETED", "CANCELLED"],
      match_type: ["SINGLES", "DOUBLES"],
      profile_role: ["ADMIN", "SCORER"],
      rally_event_type: ["WINNER", "DROP", "SPLIT"],
      rating_confidence_status: ["PROVISIONAL", "EMERGING", "ESTABLISHED"],
      stage_status: ["PENDING", "ACTIVE", "COMPLETED"],
      stage_type: ["GROUP", "CROSS_CATEGORY", "FINAL"],
      tournament_court_status: ["AVAILABLE", "ASSIGNED", "LIVE", "COMPLETED"],
      tournament_player_status: ["ACTIVE", "WITHDRAWN"],
      tournament_status: [
        "DRAFT",
        "OPEN",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
      ],
    },
  },
} as const
