export type GenealogyRecord = {
  id: string;
  record_type: string;
  record_date_utc: string;
  source_org_id: string | null;
  source_org_name: string | null;
  source_aircraft_id: string | null;
  aircraft_tail: string | null;
  record_payload: Record<string, unknown>;
  attachments: { filename?: string; storage_path?: string; content_hash?: string; uploaded_at?: string }[];
  content_hash: string;
  previous_record_hash: string | null;
  record_seq: number;
  confidence: string;
  verification_source: string | null;
  created_at_utc: string;
};

export type OwnershipEntry = {
  id: string;
  from_org_id: string | null;
  from_org_name: string | null;
  to_org_id: string;
  to_org_name: string | null;
  transfer_type: string | null;
  transfer_date_utc: string;
  transfer_reference: string | null;
};

export type SerialMeta = {
  id: string;
  manufacturer: string;
  part_number: string;
  serial_number: string;
  component_type: string;
  birth_certificate_date: string | null;
  birth_manufacturer_facility: string | null;
  current_owner_org_id: string | null;
  current_owner_name: string | null;
  current_component_id: string | null;
  lifetime_cycles: number | null;
  lifetime_flight_hours: number | null;
  total_installations: number | null;
  total_overhauls: number | null;
  total_findings: number | null;
  verification_state: string;
};

export type GenealogyView = {
  serial: SerialMeta;
  records: GenealogyRecord[];
  ownership_history: OwnershipEntry[];
  stats: { records_count: number; verified_count: number; chain_ok: boolean };
  export_count: number;
};

export type GenealogyDirectoryItem = {
  id: string;
  serial_number: string;
  part_number: string;
  manufacturer: string;
  component_type: string;
  current_owner_org_id: string | null;
  current_owner_name: string | null;
  current_component_id: string | null;
  lifetime_cycles: number | null;
  lifetime_flight_hours: number | null;
  verification_state: string;
  owned: boolean;
  records_count: number;
  last_event_date: string | null;
};
