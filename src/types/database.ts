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
      aircraft: {
        Row: {
          aircraft_type: string
          base_station: string | null
          created_at: string
          delivery_date: string | null
          id: string
          org_id: string
          ownership_type: string | null
          serial_number: string | null
          tail_number: string
          updated_at: string
        }
        Insert: {
          aircraft_type: string
          base_station?: string | null
          created_at?: string
          delivery_date?: string | null
          id?: string
          org_id: string
          ownership_type?: string | null
          serial_number?: string | null
          tail_number: string
          updated_at?: string
        }
        Update: {
          aircraft_type?: string
          base_station?: string | null
          created_at?: string
          delivery_date?: string | null
          id?: string
          org_id?: string
          ownership_type?: string | null
          serial_number?: string | null
          tail_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aircraft_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      aircraft_state: {
        Row: {
          aircraft_id: string
          current_station: string | null
          last_transition_at: string | null
          next_event_at: string | null
          next_event_type: string | null
          state: string
          state_confidence: string
          state_source: string
          updated_at: string
        }
        Insert: {
          aircraft_id: string
          current_station?: string | null
          last_transition_at?: string | null
          next_event_at?: string | null
          next_event_type?: string | null
          state?: string
          state_confidence?: string
          state_source?: string
          updated_at?: string
        }
        Update: {
          aircraft_id?: string
          current_station?: string | null
          last_transition_at?: string | null
          next_event_at?: string | null
          next_event_type?: string | null
          state?: string
          state_confidence?: string
          state_source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aircraft_state_aircraft_id_fkey"
            columns: ["aircraft_id"]
            isOneToOne: true
            referencedRelation: "aircraft"
            referencedColumns: ["id"]
          },
        ]
      }
      aircraft_state_history: {
        Row: {
          aircraft_id: string
          created_at: string
          id: string
          note: string | null
          org_id: string
          previous_state: string | null
          state: string
          state_source: string | null
          transitioned_at: string
        }
        Insert: {
          aircraft_id: string
          created_at?: string
          id?: string
          note?: string | null
          org_id: string
          previous_state?: string | null
          state: string
          state_source?: string | null
          transitioned_at?: string
        }
        Update: {
          aircraft_id?: string
          created_at?: string
          id?: string
          note?: string | null
          org_id?: string
          previous_state?: string | null
          state?: string
          state_source?: string | null
          transitioned_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aircraft_state_history_aircraft_id_fkey"
            columns: ["aircraft_id"]
            isOneToOne: false
            referencedRelation: "aircraft"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aircraft_state_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          event_payload: Json
          event_type: string
          id: string
          org_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          event_payload?: Json
          event_type: string
          id?: string
          org_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event_payload?: Json
          event_type?: string
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_aircraft: {
        Row: {
          aircraft_id: string
          fleet_id: string
        }
        Insert: {
          aircraft_id: string
          fleet_id: string
        }
        Update: {
          aircraft_id?: string
          fleet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_aircraft_aircraft_id_fkey"
            columns: ["aircraft_id"]
            isOneToOne: false
            referencedRelation: "aircraft"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_aircraft_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      fleets: {
        Row: {
          aircraft_type_focus: string | null
          created_at: string
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          aircraft_type_focus?: string | null
          created_at?: string
          id?: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          aircraft_type_focus?: string | null
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_schedules: {
        Row: {
          aircraft_id: string
          created_at_utc: string
          delay_minutes: number
          destination_station: string
          flight_number: string | null
          id: string
          org_id: string
          origin_station: string
          scheduled_arrival_utc: string
          scheduled_departure_utc: string
          source_system: string
          status: string
          updated_at_utc: string
        }
        Insert: {
          aircraft_id: string
          created_at_utc?: string
          delay_minutes?: number
          destination_station: string
          flight_number?: string | null
          id?: string
          org_id: string
          origin_station: string
          scheduled_arrival_utc: string
          scheduled_departure_utc: string
          source_system?: string
          status?: string
          updated_at_utc?: string
        }
        Update: {
          aircraft_id?: string
          created_at_utc?: string
          delay_minutes?: number
          destination_station?: string
          flight_number?: string | null
          id?: string
          org_id?: string
          origin_station?: string
          scheduled_arrival_utc?: string
          scheduled_departure_utc?: string
          source_system?: string
          status?: string
          updated_at_utc?: string
        }
        Relationships: [
          {
            foreignKeyName: "flight_schedules_aircraft_id_fkey"
            columns: ["aircraft_id"]
            isOneToOne: false
            referencedRelation: "aircraft"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string
          id: string
          name: string
          plan: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan?: string
        }
        Relationships: []
      }
      signal_actions: {
        Row: {
          action_payload: Json | null
          action_type: string
          actor_user_id: string
          created_at_utc: string
          dismissal_reason: string | null
          id: string
          org_id: string
          outcome_task_id: string | null
          signal_id: string
        }
        Insert: {
          action_payload?: Json | null
          action_type: string
          actor_user_id: string
          created_at_utc?: string
          dismissal_reason?: string | null
          id?: string
          org_id: string
          outcome_task_id?: string | null
          signal_id: string
        }
        Update: {
          action_payload?: Json | null
          action_type?: string
          actor_user_id?: string
          created_at_utc?: string
          dismissal_reason?: string | null
          id?: string
          org_id?: string
          outcome_task_id?: string | null
          signal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_actions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signal_actions_outcome_task_id_fkey"
            columns: ["outcome_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signal_actions_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_generation_runs: {
        Row: {
          aircraft_id: string | null
          completed_at_utc: string | null
          duration_ms: number | null
          error: string | null
          generation_context_hash: string | null
          id: string
          input_tokens: number | null
          model_used: string | null
          org_id: string
          output_tokens: number | null
          run_type: string | null
          signals_generated: number | null
          signals_suppressed: number | null
          started_at_utc: string
          status: string | null
          total_cost_usd: number | null
          trigger_reference: string | null
        }
        Insert: {
          aircraft_id?: string | null
          completed_at_utc?: string | null
          duration_ms?: number | null
          error?: string | null
          generation_context_hash?: string | null
          id?: string
          input_tokens?: number | null
          model_used?: string | null
          org_id: string
          output_tokens?: number | null
          run_type?: string | null
          signals_generated?: number | null
          signals_suppressed?: number | null
          started_at_utc?: string
          status?: string | null
          total_cost_usd?: number | null
          trigger_reference?: string | null
        }
        Update: {
          aircraft_id?: string | null
          completed_at_utc?: string | null
          duration_ms?: number | null
          error?: string | null
          generation_context_hash?: string | null
          id?: string
          input_tokens?: number | null
          model_used?: string | null
          org_id?: string
          output_tokens?: number | null
          run_type?: string | null
          signals_generated?: number | null
          signals_suppressed?: number | null
          started_at_utc?: string
          status?: string | null
          total_cost_usd?: number | null
          trigger_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signal_generation_runs_aircraft_id_fkey"
            columns: ["aircraft_id"]
            isOneToOne: false
            referencedRelation: "aircraft"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signal_generation_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      signals: {
        Row: {
          aircraft_id: string | null
          category: string
          confidence: string
          confidence_reasoning: string
          created_at_utc: string
          evidence_refs: Json
          generated_at_utc: string
          generated_by_model: string
          generation_context_hash: string
          generation_ms: number | null
          id: string
          input_tokens: number | null
          is_active: boolean
          narrative: string
          org_id: string
          output_tokens: number | null
          recommendation: string | null
          resolution_note: string | null
          resolved_at_utc: string | null
          severity: string
          suggested_actions: Json | null
          superseded_by_signal_id: string | null
          title: string
          updated_at_utc: string
        }
        Insert: {
          aircraft_id?: string | null
          category: string
          confidence: string
          confidence_reasoning: string
          created_at_utc?: string
          evidence_refs?: Json
          generated_at_utc?: string
          generated_by_model: string
          generation_context_hash: string
          generation_ms?: number | null
          id?: string
          input_tokens?: number | null
          is_active?: boolean
          narrative: string
          org_id: string
          output_tokens?: number | null
          recommendation?: string | null
          resolution_note?: string | null
          resolved_at_utc?: string | null
          severity: string
          suggested_actions?: Json | null
          superseded_by_signal_id?: string | null
          title: string
          updated_at_utc?: string
        }
        Update: {
          aircraft_id?: string | null
          category?: string
          confidence?: string
          confidence_reasoning?: string
          created_at_utc?: string
          evidence_refs?: Json
          generated_at_utc?: string
          generated_by_model?: string
          generation_context_hash?: string
          generation_ms?: number | null
          id?: string
          input_tokens?: number | null
          is_active?: boolean
          narrative?: string
          org_id?: string
          output_tokens?: number | null
          recommendation?: string | null
          resolution_note?: string | null
          resolved_at_utc?: string | null
          severity?: string
          suggested_actions?: Json | null
          superseded_by_signal_id?: string | null
          title?: string
          updated_at_utc?: string
        }
        Relationships: [
          {
            foreignKeyName: "signals_aircraft_id_fkey"
            columns: ["aircraft_id"]
            isOneToOne: false
            referencedRelation: "aircraft"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_superseded_by_signal_id_fkey"
            columns: ["superseded_by_signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      task_acknowledgements: {
        Row: {
          acknowledged_at_utc: string
          task_id: string
          user_id: string
        }
        Insert: {
          acknowledged_at_utc?: string
          task_id: string
          user_id: string
        }
        Update: {
          acknowledged_at_utc?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_acknowledgements_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          created_at_utc: string
          file_size_bytes: number
          filename: string
          id: string
          mime_type: string
          org_id: string
          storage_path: string
          task_id: string
          uploaded_by_user_id: string
        }
        Insert: {
          created_at_utc?: string
          file_size_bytes: number
          filename: string
          id?: string
          mime_type: string
          org_id: string
          storage_path: string
          task_id: string
          uploaded_by_user_id: string
        }
        Update: {
          created_at_utc?: string
          file_size_bytes?: number
          filename?: string
          id?: string
          mime_type?: string
          org_id?: string
          storage_path?: string
          task_id?: string
          uploaded_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_dependencies: {
        Row: {
          created_at_utc: string
          dependency_type: string
          from_task_id: string
          id: string
          org_id: string
          to_task_id: string
        }
        Insert: {
          created_at_utc?: string
          dependency_type?: string
          from_task_id: string
          id?: string
          org_id: string
          to_task_id: string
        }
        Update: {
          created_at_utc?: string
          dependency_type?: string
          from_task_id?: string
          id?: string
          org_id?: string
          to_task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_from_task_id_fkey"
            columns: ["from_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_to_task_id_fkey"
            columns: ["to_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_events: {
        Row: {
          actor_user_id: string | null
          body: string | null
          created_at_utc: string
          event_payload: Json
          event_type: string
          id: string
          org_id: string
          task_id: string
        }
        Insert: {
          actor_user_id?: string | null
          body?: string | null
          created_at_utc?: string
          event_payload?: Json
          event_type: string
          id?: string
          org_id: string
          task_id: string
        }
        Update: {
          actor_user_id?: string | null
          body?: string | null
          created_at_utc?: string
          event_payload?: Json
          event_type?: string
          id?: string
          org_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_sources: {
        Row: {
          first_seen_at_utc: string
          id: string
          last_seen_at_utc: string
          source_reference_id: string | null
          source_system: string
          source_url: string | null
          task_id: string
        }
        Insert: {
          first_seen_at_utc?: string
          id?: string
          last_seen_at_utc?: string
          source_reference_id?: string | null
          source_system: string
          source_url?: string | null
          task_id: string
        }
        Update: {
          first_seen_at_utc?: string
          id?: string
          last_seen_at_utc?: string
          source_reference_id?: string | null
          source_system?: string
          source_url?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_sources_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_type_catalog: {
        Row: {
          active: boolean
          display_name: string
          parent_type: string
          sort_rank: number
          sub_type: string
        }
        Insert: {
          active?: boolean
          display_name: string
          parent_type: string
          sort_rank?: number
          sub_type: string
        }
        Update: {
          active?: boolean
          display_name?: string
          parent_type?: string
          sort_rank?: number
          sub_type?: string
        }
        Relationships: []
      }
      task_work_logs: {
        Row: {
          created_at_utc: string
          description: string | null
          id: string
          org_id: string
          task_id: string
          time_spent_minutes: number
          updated_at_utc: string
          user_id: string
          work_date: string
        }
        Insert: {
          created_at_utc?: string
          description?: string | null
          id?: string
          org_id: string
          task_id: string
          time_spent_minutes: number
          updated_at_utc?: string
          user_id: string
          work_date: string
        }
        Update: {
          created_at_utc?: string
          description?: string | null
          id?: string
          org_id?: string
          task_id?: string
          time_spent_minutes?: number
          updated_at_utc?: string
          user_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_work_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_work_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          aircraft_id: string
          aog: boolean
          assignee_user_id: string | null
          board_rank: number | null
          canonical_group_id: string | null
          created_at_utc: string
          dispatch_blocking: boolean
          due_at_utc: string | null
          estimated_duration_hours: number | null
          facility: string | null
          id: string
          org_id: string
          parent_type: string
          pinned: boolean
          reporter_user_id: string | null
          risk_band: string
          started_at_utc: string | null
          station_code: string | null
          status: string
          sub_type: string
          title: string
          updated_at_utc: string
          why_summary: string | null
        }
        Insert: {
          aircraft_id: string
          aog?: boolean
          assignee_user_id?: string | null
          board_rank?: number | null
          canonical_group_id?: string | null
          created_at_utc?: string
          dispatch_blocking?: boolean
          due_at_utc?: string | null
          estimated_duration_hours?: number | null
          facility?: string | null
          id?: string
          org_id: string
          parent_type: string
          pinned?: boolean
          reporter_user_id?: string | null
          risk_band?: string
          started_at_utc?: string | null
          station_code?: string | null
          status?: string
          sub_type: string
          title: string
          updated_at_utc?: string
          why_summary?: string | null
        }
        Update: {
          aircraft_id?: string
          aog?: boolean
          assignee_user_id?: string | null
          board_rank?: number | null
          canonical_group_id?: string | null
          created_at_utc?: string
          dispatch_blocking?: boolean
          due_at_utc?: string | null
          estimated_duration_hours?: number | null
          facility?: string | null
          id?: string
          org_id?: string
          parent_type?: string
          pinned?: boolean
          reporter_user_id?: string | null
          risk_band?: string
          started_at_utc?: string | null
          station_code?: string | null
          status?: string
          sub_type?: string
          title?: string
          updated_at_utc?: string
          why_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_aircraft_id_fkey"
            columns: ["aircraft_id"]
            isOneToOne: false
            referencedRelation: "aircraft"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_type_sub_type_fkey"
            columns: ["parent_type", "sub_type"]
            isOneToOne: false
            referencedRelation: "task_type_catalog"
            referencedColumns: ["parent_type", "sub_type"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acknowledge_task: { Args: { p_task_id: string }; Returns: undefined }
      act_on_signal: {
        Args: {
          p_action_payload?: Json
          p_action_type: string
          p_dismissal_reason?: string
          p_outcome_task_id?: string
          p_signal_id: string
        }
        Returns: string
      }
      assign_task: {
        Args: { p_assignee_user_id: string; p_task_id: string }
        Returns: undefined
      }
      create_task: {
        Args: {
          p_aircraft_id: string
          p_aog?: boolean
          p_dispatch_blocking?: boolean
          p_due_at_utc?: string
          p_estimated_duration_hours?: number
          p_facility?: string
          p_parent_type: string
          p_risk_band?: string
          p_source_reference_id?: string
          p_source_system?: string
          p_station_code?: string
          p_sub_type: string
          p_title: string
          p_why_summary: string
        }
        Returns: string
      }
      create_task_event: {
        Args: {
          p_body?: string
          p_event_payload?: Json
          p_event_type: string
          p_task_id: string
        }
        Returns: string
      }
      current_user_org_ids: { Args: never; Returns: string[] }
      generate_signals_for_aircraft: {
        Args: {
          p_aircraft_id: string
          p_force_regenerate?: boolean
          p_run_type?: string
        }
        Returns: Json
      }
      get_aircraft_drawer_summary: {
        Args: { p_aircraft_id: string }
        Returns: Json
      }
      get_command_center_insights: {
        Args: { p_limit?: number; p_severity?: string[] }
        Returns: Json
      }
      get_command_center_queue: {
        Args: {
          p_assigned_to_me?: boolean
          p_categories?: string[]
          p_limit?: number
          p_severity?: string[]
          p_source_systems?: string[]
          p_time_window_hours?: number
        }
        Returns: Json
      }
      get_command_center_snapshot: {
        Args: { p_fleet_id?: string; p_time_window_hours?: number }
        Returns: Json
      }
      get_fleet_board: {
        Args: {
          p_aircraft_types?: string[]
          p_fleet_id?: string
          p_parent_types?: string[]
          p_risk_bands?: string[]
          p_search?: string
          p_station_codes?: string[]
        }
        Returns: Json
      }
      get_signals_for_aircraft: {
        Args: { p_aircraft_id: string; p_include_resolved?: boolean }
        Returns: Json
      }
      get_task_detail: { Args: { p_task_id: string }; Returns: Json }
      is_org_member: { Args: { p_org: string }; Returns: boolean }
      log_work: {
        Args: {
          p_description: string
          p_task_id: string
          p_time_spent_minutes: number
          p_work_date?: string
        }
        Returns: string
      }
      move_task_status: {
        Args: { p_new_rank?: number; p_new_status: string; p_task_id: string }
        Returns: undefined
      }
      seed_avir_demo: { Args: { p_user_id: string }; Returns: string }
      seed_demo_flight_schedules: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: number
      }
      seed_demo_tasks: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: number
      }
      signal_context_hash: { Args: { p_aircraft_id: string }; Returns: string }
      task_severity: {
        Args: { p_aog: boolean; p_blocking: boolean; p_risk: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
    Enums: {},
  },
} as const
