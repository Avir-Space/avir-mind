export type Part = {
  id: string;
  part_number: string;
  manufacturer: string;
  description: string;
  category: string | null;
  unit_of_measure: string;
  shelf_life_days: number | null;
  storage_conditions: string | null;
  hazmat_class: string | null;
  ata_chapter: string | null;
  compatible_aircraft_types: string[] | null;
  compatible_component_types: string[] | null;
  alternative_part_numbers: string[] | null;
  current_price_usd: number | null;
  typical_lead_time_days: number | null;
  criticality: string | null;
};

export type PartOverview = {
  id: string;
  part_number: string;
  manufacturer: string;
  description: string;
  category: string | null;
  criticality: string | null;
  unit_of_measure: string;
  current_price_usd: number | null;
  ata_chapter: string | null;
  total_available: number;
  total_reserved: number;
  location_count: number;
  below_reorder: boolean;
  total_value: number;
};

export type Holding = {
  location_id: string;
  location_code: string;
  location_name: string;
  location_type: string;
  quantity_available: number;
  quantity_reserved: number;
  quantity_in_transit: number;
  reorder_point: number | null;
  below_reorder: boolean;
};

export type SupplierLink = {
  supplier_id: string;
  supplier_name: string;
  supplier_type: string | null;
  supplier_part_reference: string | null;
  typical_lead_time_days: number | null;
  typical_unit_price_usd: number | null;
  minimum_order_quantity: number | null;
  is_preferred: boolean;
  performance_score: number | null;
};

export type Movement = {
  id: string;
  movement_type: string;
  quantity: number;
  movement_date_utc: string;
  reference_number: string | null;
  from_location_id: string | null;
  to_location_id: string | null;
  part_id?: string;
};

export type PartDetail = {
  part: Part;
  holdings: Holding[];
  suppliers: SupplierLink[];
  movements: Movement[];
  demand: { monthly: { month: string; consumed: number }[]; predicted_demand: number };
  compatible_aircraft: { id: string; tail_number: string; aircraft_type: string }[];
};

export type StockLocationRow = {
  id: string;
  location_code: string;
  location_name: string;
  location_type: string | null;
  station_code: string | null;
  climate_controlled: boolean;
  hazmat_certified: boolean;
  is_active: boolean;
};

export type SupplierPerf = {
  id: string;
  supplier_name: string;
  supplier_type: string | null;
  approved_status: string | null;
  performance_score: number | null;
  typical_lead_time_days: number | null;
  last_order_at_utc: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  part_count: number;
  preferred_count: number;
};

export type SupplierDetail = {
  supplier: SupplierPerf & { supplier_code: string | null; notes: string | null; primary_contact_phone: string | null };
  parts: {
    part_id: string;
    part_number: string;
    description: string;
    category: string | null;
    criticality: string | null;
    supplier_part_reference: string | null;
    typical_unit_price_usd: number | null;
    typical_lead_time_days: number | null;
    is_preferred: boolean;
    last_price_usd: number | null;
  }[];
  part_count: number;
};

export type LocationDetail = {
  location: StockLocationRow & { storage_capacity_m3: number | null };
  holdings: { part_id: string; part_number: string; description: string; criticality: string | null; quantity_available: number; quantity_reserved: number; reorder_point: number | null; value: number; below_reorder: boolean }[];
  movements: Movement[];
  assets: { id: string; asset_tag: string; asset_name: string; asset_type: string | null; current_status: string }[];
  total_value: number;
};

export type LowStockAlert = {
  holding_id: string;
  part_id: string;
  part_number: string;
  description: string;
  criticality: string | null;
  typical_lead_time_days: number | null;
  location_id: string;
  location_code: string;
  location_name: string;
  quantity_available: number;
  quantity_reserved: number;
  reorder_point: number;
  shortfall: number;
  consumed_30d: number;
  days_of_cover: number | null;
};

export type TransferSuggestion = {
  part_id: string;
  part_number: string;
  description: string;
  to_location_id: string;
  to_location_code: string;
  from_location_id: string;
  from_location_code: string;
  qty: number;
  from_available: number;
  to_available: number;
  to_reorder: number;
  reasoning: string;
};

export type InventoryDashboard = {
  stats: { total_skus: number; total_value: number; low_stock_count: number; reorder_count: number };
  insights: { category: string; severity: string; title: string; one_liner: string }[];
};

export type AssetRow = {
  id: string;
  asset_tag: string;
  asset_name: string;
  asset_type: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  location_id: string | null;
  current_status: string;
  purchased_date: string | null;
  purchase_cost_usd: number | null;
  calibration_required: boolean;
  calibration_due_date: string | null;
  next_service_due_date: string | null;
  assigned_to_station: string | null;
};

export type AssetEvent = {
  id: string;
  event_type: string;
  event_date: string;
  performed_by: string | null;
  cost_usd: number | null;
  documentation_reference: string | null;
};

export type AssetCalendarItem = {
  id: string;
  asset_tag: string;
  asset_name: string;
  asset_type: string | null;
  current_status: string;
  assigned_to_station: string | null;
  calibration_due_date: string | null;
  next_service_due_date: string | null;
  due_date: string;
  due_type: string;
};
