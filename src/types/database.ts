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
      component_events: {
        Row: {
          aircraft_id: string | null
          component_id: string
          cost_usd: number | null
          created_at_utc: string
          cycles_at_event: number | null
          documentation_reference: string | null
          event_date_utc: string
          event_payload: Json | null
          event_type: string
          facility: string | null
          finding_description: string | null
          finding_severity: string | null
          flight_hours_at_event: number | null
          id: string
          linked_signal_id: string | null
          linked_task_id: string | null
          org_id: string
          performed_by: string | null
          source_reference_id: string | null
          source_system: string
          station: string | null
        }
        Insert: {
          aircraft_id?: string | null
          component_id: string
          cost_usd?: number | null
          created_at_utc?: string
          cycles_at_event?: number | null
          documentation_reference?: string | null
          event_date_utc: string
          event_payload?: Json | null
          event_type: string
          facility?: string | null
          finding_description?: string | null
          finding_severity?: string | null
          flight_hours_at_event?: number | null
          id?: string
          linked_signal_id?: string | null
          linked_task_id?: string | null
          org_id: string
          performed_by?: string | null
          source_reference_id?: string | null
          source_system?: string
          station?: string | null
        }
        Update: {
          aircraft_id?: string | null
          component_id?: string
          cost_usd?: number | null
          created_at_utc?: string
          cycles_at_event?: number | null
          documentation_reference?: string | null
          event_date_utc?: string
          event_payload?: Json | null
          event_type?: string
          facility?: string | null
          finding_description?: string | null
          finding_severity?: string | null
          flight_hours_at_event?: number | null
          id?: string
          linked_signal_id?: string | null
          linked_task_id?: string | null
          org_id?: string
          performed_by?: string | null
          source_reference_id?: string | null
          source_system?: string
          station?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "component_events_aircraft_id_fkey"
            columns: ["aircraft_id"]
            isOneToOne: false
            referencedRelation: "aircraft"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "component_events_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "component_events_linked_signal_id_fkey"
            columns: ["linked_signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "component_events_linked_task_id_fkey"
            columns: ["linked_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "component_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      component_health_history: {
        Row: {
          component_id: string
          computed_at_utc: string
          health_score: number
          id: string
          org_id: string
          score_contributors: Json | null
        }
        Insert: {
          component_id: string
          computed_at_utc?: string
          health_score: number
          id?: string
          org_id: string
          score_contributors?: Json | null
        }
        Update: {
          component_id?: string
          computed_at_utc?: string
          health_score?: number
          id?: string
          org_id?: string
          score_contributors?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "component_health_history_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "component_health_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      components: {
        Row: {
          aircraft_id: string | null
          component_type: string
          created_at_utc: string
          current_cycles: number | null
          current_flight_hours: number | null
          cycles_since_new: number | null
          cycles_since_overhaul: number | null
          flight_hours_since_new: number | null
          flight_hours_since_overhaul: number | null
          health_score: number | null
          health_score_updated_at_utc: string | null
          id: string
          installed_at_utc: string | null
          limit_cycles: number | null
          limit_flight_hours: number | null
          manufacturer: string | null
          next_scheduled_event_due_cycles: number | null
          next_scheduled_event_due_date: string | null
          next_scheduled_event_due_hours: number | null
          next_scheduled_event_type: string | null
          org_id: string
          overhaul_interval_cycles: number | null
          overhaul_interval_hours: number | null
          part_number: string
          position_code: string | null
          removed_at_utc: string | null
          serial_number: string
          status: string
          updated_at_utc: string
        }
        Insert: {
          aircraft_id?: string | null
          component_type: string
          created_at_utc?: string
          current_cycles?: number | null
          current_flight_hours?: number | null
          cycles_since_new?: number | null
          cycles_since_overhaul?: number | null
          flight_hours_since_new?: number | null
          flight_hours_since_overhaul?: number | null
          health_score?: number | null
          health_score_updated_at_utc?: string | null
          id?: string
          installed_at_utc?: string | null
          limit_cycles?: number | null
          limit_flight_hours?: number | null
          manufacturer?: string | null
          next_scheduled_event_due_cycles?: number | null
          next_scheduled_event_due_date?: string | null
          next_scheduled_event_due_hours?: number | null
          next_scheduled_event_type?: string | null
          org_id: string
          overhaul_interval_cycles?: number | null
          overhaul_interval_hours?: number | null
          part_number: string
          position_code?: string | null
          removed_at_utc?: string | null
          serial_number: string
          status?: string
          updated_at_utc?: string
        }
        Update: {
          aircraft_id?: string | null
          component_type?: string
          created_at_utc?: string
          current_cycles?: number | null
          current_flight_hours?: number | null
          cycles_since_new?: number | null
          cycles_since_overhaul?: number | null
          flight_hours_since_new?: number | null
          flight_hours_since_overhaul?: number | null
          health_score?: number | null
          health_score_updated_at_utc?: string | null
          id?: string
          installed_at_utc?: string | null
          limit_cycles?: number | null
          limit_flight_hours?: number | null
          manufacturer?: string | null
          next_scheduled_event_due_cycles?: number | null
          next_scheduled_event_due_date?: string | null
          next_scheduled_event_due_hours?: number | null
          next_scheduled_event_type?: string | null
          org_id?: string
          overhaul_interval_cycles?: number | null
          overhaul_interval_hours?: number | null
          part_number?: string
          position_code?: string | null
          removed_at_utc?: string | null
          serial_number?: string
          status?: string
          updated_at_utc?: string
        }
        Relationships: [
          {
            foreignKeyName: "components_aircraft_id_fkey"
            columns: ["aircraft_id"]
            isOneToOne: false
            referencedRelation: "aircraft"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "components_org_id_fkey"
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
      genealogy_exports: {
        Row: {
          created_at_utc: string
          export_downloaded_at_utc: string | null
          export_format: string | null
          export_purpose: string | null
          export_recipient: string | null
          export_snapshot_hash: string
          exported_by_user_id: string
          id: string
          org_id: string
          serial_genealogy_id: string
        }
        Insert: {
          created_at_utc?: string
          export_downloaded_at_utc?: string | null
          export_format?: string | null
          export_purpose?: string | null
          export_recipient?: string | null
          export_snapshot_hash: string
          exported_by_user_id: string
          id?: string
          org_id: string
          serial_genealogy_id: string
        }
        Update: {
          created_at_utc?: string
          export_downloaded_at_utc?: string | null
          export_format?: string | null
          export_purpose?: string | null
          export_recipient?: string | null
          export_snapshot_hash?: string
          exported_by_user_id?: string
          id?: string
          org_id?: string
          serial_genealogy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "genealogy_exports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "genealogy_exports_serial_genealogy_id_fkey"
            columns: ["serial_genealogy_id"]
            isOneToOne: false
            referencedRelation: "serial_genealogies"
            referencedColumns: ["id"]
          },
        ]
      }
      genealogy_ownership_history: {
        Row: {
          created_at_utc: string
          from_org_id: string | null
          id: string
          serial_genealogy_id: string
          to_org_id: string
          transfer_date_utc: string
          transfer_documentation_refs: Json | null
          transfer_reference: string | null
          transfer_type: string | null
        }
        Insert: {
          created_at_utc?: string
          from_org_id?: string | null
          id?: string
          serial_genealogy_id: string
          to_org_id: string
          transfer_date_utc: string
          transfer_documentation_refs?: Json | null
          transfer_reference?: string | null
          transfer_type?: string | null
        }
        Update: {
          created_at_utc?: string
          from_org_id?: string | null
          id?: string
          serial_genealogy_id?: string
          to_org_id?: string
          transfer_date_utc?: string
          transfer_documentation_refs?: Json | null
          transfer_reference?: string | null
          transfer_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "genealogy_ownership_history_from_org_id_fkey"
            columns: ["from_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "genealogy_ownership_history_serial_genealogy_id_fkey"
            columns: ["serial_genealogy_id"]
            isOneToOne: false
            referencedRelation: "serial_genealogies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "genealogy_ownership_history_to_org_id_fkey"
            columns: ["to_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      genealogy_records: {
        Row: {
          attachments: Json | null
          confidence: string
          content_hash: string
          created_at_utc: string
          id: string
          previous_record_hash: string | null
          record_date_utc: string
          record_payload: Json
          record_seq: number
          record_type: string
          serial_genealogy_id: string
          source_aircraft_id: string | null
          source_component_event_id: string | null
          source_component_id: string | null
          source_org_id: string | null
          verification_source: string | null
        }
        Insert: {
          attachments?: Json | null
          confidence?: string
          content_hash: string
          created_at_utc?: string
          id?: string
          previous_record_hash?: string | null
          record_date_utc: string
          record_payload: Json
          record_seq?: number
          record_type: string
          serial_genealogy_id: string
          source_aircraft_id?: string | null
          source_component_event_id?: string | null
          source_component_id?: string | null
          source_org_id?: string | null
          verification_source?: string | null
        }
        Update: {
          attachments?: Json | null
          confidence?: string
          content_hash?: string
          created_at_utc?: string
          id?: string
          previous_record_hash?: string | null
          record_date_utc?: string
          record_payload?: Json
          record_seq?: number
          record_type?: string
          serial_genealogy_id?: string
          source_aircraft_id?: string | null
          source_component_event_id?: string | null
          source_component_id?: string | null
          source_org_id?: string | null
          verification_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "genealogy_records_serial_genealogy_id_fkey"
            columns: ["serial_genealogy_id"]
            isOneToOne: false
            referencedRelation: "serial_genealogies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "genealogy_records_source_aircraft_id_fkey"
            columns: ["source_aircraft_id"]
            isOneToOne: false
            referencedRelation: "aircraft"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "genealogy_records_source_component_event_id_fkey"
            columns: ["source_component_event_id"]
            isOneToOne: false
            referencedRelation: "component_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "genealogy_records_source_component_id_fkey"
            columns: ["source_component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "genealogy_records_source_org_id_fkey"
            columns: ["source_org_id"]
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
      serial_genealogies: {
        Row: {
          birth_certificate_date: string | null
          birth_certificate_reference: string | null
          birth_manufacturer_facility: string | null
          component_type: string
          created_at_utc: string
          current_component_id: string | null
          current_owner_org_id: string | null
          id: string
          last_verified_at_utc: string | null
          lifetime_cycles: number | null
          lifetime_flight_hours: number | null
          manufacturer: string
          part_number: string
          serial_number: string
          total_findings: number | null
          total_installations: number | null
          total_overhauls: number | null
          updated_at_utc: string
          verification_state: string
        }
        Insert: {
          birth_certificate_date?: string | null
          birth_certificate_reference?: string | null
          birth_manufacturer_facility?: string | null
          component_type: string
          created_at_utc?: string
          current_component_id?: string | null
          current_owner_org_id?: string | null
          id?: string
          last_verified_at_utc?: string | null
          lifetime_cycles?: number | null
          lifetime_flight_hours?: number | null
          manufacturer: string
          part_number: string
          serial_number: string
          total_findings?: number | null
          total_installations?: number | null
          total_overhauls?: number | null
          updated_at_utc?: string
          verification_state?: string
        }
        Update: {
          birth_certificate_date?: string | null
          birth_certificate_reference?: string | null
          birth_manufacturer_facility?: string | null
          component_type?: string
          created_at_utc?: string
          current_component_id?: string | null
          current_owner_org_id?: string | null
          id?: string
          last_verified_at_utc?: string | null
          lifetime_cycles?: number | null
          lifetime_flight_hours?: number | null
          manufacturer?: string
          part_number?: string
          serial_number?: string
          total_findings?: number | null
          total_installations?: number | null
          total_overhauls?: number | null
          updated_at_utc?: string
          verification_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "serial_genealogies_current_component_id_fkey"
            columns: ["current_component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serial_genealogies_current_owner_org_id_fkey"
            columns: ["current_owner_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
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
          component_id: string | null
          duration_ms: number | null
          error: string | null
          generation_context_hash: string | null
          id: string
          input_tokens: number | null
          model_used: string | null
          org_id: string
          output_tokens: number | null
          run_kind: string
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
          component_id?: string | null
          duration_ms?: number | null
          error?: string | null
          generation_context_hash?: string | null
          id?: string
          input_tokens?: number | null
          model_used?: string | null
          org_id: string
          output_tokens?: number | null
          run_kind?: string
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
          component_id?: string | null
          duration_ms?: number | null
          error?: string | null
          generation_context_hash?: string | null
          id?: string
          input_tokens?: number | null
          model_used?: string | null
          org_id?: string
          output_tokens?: number | null
          run_kind?: string
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
            foreignKeyName: "signal_generation_runs_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
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
          accuracy_measured_at_utc: string | null
          accuracy_notes: string | null
          accuracy_result: string
          aircraft_id: string | null
          category: string
          component_id: string | null
          confidence: string
          confidence_reasoning: string
          created_at_utc: string
          evidence_refs: Json
          generated_at_utc: string
          generated_by_model: string
          generation_context_hash: string
          generation_ms: number | null
          historical_baseline: Json | null
          id: string
          input_tokens: number | null
          is_active: boolean
          narrative: string
          org_id: string
          output_tokens: number | null
          predicted_event_type: string | null
          prediction_horizon: Json | null
          recommendation: string | null
          resolution_note: string | null
          resolved_at_utc: string | null
          severity: string
          signal_class: string
          suggested_actions: Json | null
          superseded_by_signal_id: string | null
          title: string
          updated_at_utc: string
        }
        Insert: {
          accuracy_measured_at_utc?: string | null
          accuracy_notes?: string | null
          accuracy_result?: string
          aircraft_id?: string | null
          category: string
          component_id?: string | null
          confidence: string
          confidence_reasoning: string
          created_at_utc?: string
          evidence_refs?: Json
          generated_at_utc?: string
          generated_by_model: string
          generation_context_hash: string
          generation_ms?: number | null
          historical_baseline?: Json | null
          id?: string
          input_tokens?: number | null
          is_active?: boolean
          narrative: string
          org_id: string
          output_tokens?: number | null
          predicted_event_type?: string | null
          prediction_horizon?: Json | null
          recommendation?: string | null
          resolution_note?: string | null
          resolved_at_utc?: string | null
          severity: string
          signal_class?: string
          suggested_actions?: Json | null
          superseded_by_signal_id?: string | null
          title: string
          updated_at_utc?: string
        }
        Update: {
          accuracy_measured_at_utc?: string | null
          accuracy_notes?: string | null
          accuracy_result?: string
          aircraft_id?: string | null
          category?: string
          component_id?: string | null
          confidence?: string
          confidence_reasoning?: string
          created_at_utc?: string
          evidence_refs?: Json
          generated_at_utc?: string
          generated_by_model?: string
          generation_context_hash?: string
          generation_ms?: number | null
          historical_baseline?: Json | null
          id?: string
          input_tokens?: number | null
          is_active?: boolean
          narrative?: string
          org_id?: string
          output_tokens?: number | null
          predicted_event_type?: string | null
          prediction_horizon?: Json | null
          recommendation?: string | null
          resolution_note?: string | null
          resolved_at_utc?: string | null
          severity?: string
          signal_class?: string
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
            foreignKeyName: "signals_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
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
      compute_component_health: {
        Args: { p_component_id: string }
        Returns: number
      }
      create_component: {
        Args: {
          p_aircraft_id: string
          p_attrs?: Json
          p_component_type: string
          p_manufacturer?: string
          p_part_number: string
          p_position_code?: string
          p_serial_number: string
          p_status?: string
        }
        Returns: string
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
      export_genealogy_bundle: {
        Args: {
          p_format: string
          p_purpose: string
          p_recipient: string
          p_serial_genealogy_id: string
        }
        Returns: Json
      }
      genealogy_build_record: { Args: { p_event_id: string }; Returns: string }
      genealogy_upsert_serial: {
        Args: { p_component_id: string }
        Returns: string
      }
      generate_predictive_signals_for_aircraft: {
        Args: {
          p_aircraft_id: string
          p_force_regenerate?: boolean
          p_run_type?: string
        }
        Returns: Json
      }
      generate_predictive_signals_for_component: {
        Args: {
          p_component_id: string
          p_force_regenerate?: boolean
          p_run_type?: string
        }
        Returns: Json
      }
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
      get_component_detail: { Args: { p_component_id: string }; Returns: Json }
      get_component_genealogy: {
        Args: { p_component_id: string }
        Returns: Json
      }
      get_components_for_aircraft: {
        Args: { p_aircraft_id: string }
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
      get_genealogy_directory: { Args: never; Returns: Json }
      get_or_create_demo_counterparty: { Args: never; Returns: string }
      get_predictive_signals_summary: {
        Args: { p_fleet_id?: string }
        Returns: Json
      }
      get_serial_genealogy: {
        Args: {
          p_manufacturer: string
          p_part_number: string
          p_serial_number: string
        }
        Returns: Json
      }
      get_serial_genealogy_by_id: { Args: { p_sid: string }; Returns: Json }
      get_signals_for_aircraft: {
        Args: { p_aircraft_id: string; p_include_resolved?: boolean }
        Returns: Json
      }
      get_station_drawer_summary: {
        Args: { p_fleet_id?: string; p_station_code: string }
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
      org_display_name: { Args: { p_org: string }; Returns: string }
      predictive_context_hash: {
        Args: { p_aircraft_id: string }
        Returns: string
      }
      record_component_event: {
        Args: {
          p_attrs?: Json
          p_component_id: string
          p_event_date: string
          p_event_type: string
        }
        Returns: string
      }
      seed_avir_demo: { Args: { p_user_id: string }; Returns: string }
      seed_demo_components: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: number
      }
      seed_demo_flight_schedules: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: number
      }
      seed_demo_tasks: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: number
      }
      signal_context_hash: { Args: { p_aircraft_id: string }; Returns: string }
      sync_component_genealogy: {
        Args: { p_component_id: string }
        Returns: number
      }
      task_severity: {
        Args: { p_aog: boolean; p_blocking: boolean; p_risk: string }
        Returns: string
      }
      transfer_serial_ownership: {
        Args: {
          p_documentation_refs?: Json
          p_serial_genealogy_id: string
          p_to_org_id: string
          p_transfer_date_utc: string
          p_transfer_reference: string
          p_transfer_type: string
        }
        Returns: string
      }
      verify_genealogy_record: {
        Args: { p_genealogy_record_id: string; p_verification_source: string }
        Returns: undefined
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
