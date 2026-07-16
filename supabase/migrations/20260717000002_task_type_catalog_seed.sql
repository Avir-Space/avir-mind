-- 0102: seed the global task taxonomy.
-- Idempotent via ON CONFLICT so re-running is safe.

insert into public.task_type_catalog (parent_type, sub_type, display_name, sort_rank) values
  ('powerplant',   'engine_borescope',     'Engine Borescope',        10),
  ('powerplant',   'oil_analysis',         'Oil Analysis',            20),
  ('powerplant',   'fod_inspection',       'FOD Inspection',          30),
  ('powerplant',   'vibration_survey',     'Vibration Survey',        40),
  ('powerplant',   'cycle_limit',          'Cycle Limit',             50),

  ('avionics',     'efis_fault',           'EFIS Fault',              10),
  ('avionics',     'fms_navigation',       'FMS Navigation',          20),
  ('avionics',     'transponder_check',    'Transponder Check',       30),
  ('avionics',     'autopilot_diagnostic', 'Autopilot Diagnostic',    40),
  ('avionics',     'radio_altimeter',      'Radio Altimeter',         50),

  ('structures',   'fuselage_inspection',  'Fuselage Inspection',     10),
  ('structures',   'hard_landing_check',   'Hard Landing Check',      20),
  ('structures',   'corrosion_survey',     'Corrosion Survey',        30),
  ('structures',   'skin_repair',          'Skin Repair',             40),

  ('landing_gear', 'cycle_limit',          'Cycle Limit',             10),
  ('landing_gear', 'brake_wear',           'Brake Wear',              20),
  ('landing_gear', 'tire_change',          'Tire Change',             30),
  ('landing_gear', 'strut_service',        'Strut Service',           40),

  ('interior',     'galley_repair',        'Galley Repair',           10),
  ('interior',     'seat_repair',          'Seat Repair',             20),
  ('interior',     'ife_diagnostic',       'IFE Diagnostic',          30),
  ('interior',     'cabin_configuration',  'Cabin Configuration',     40),

  ('flight_ops',   'fuel_discrepancy',     'Fuel Discrepancy',        10),
  ('flight_ops',   'weather_deviation',    'Weather Deviation',       20),
  ('flight_ops',   'runway_incursion',     'Runway Incursion',        30),
  ('flight_ops',   'atc_report',           'ATC Report',              40),

  ('crew',         'duty_extension',       'Duty Extension',          10),
  ('crew',         'qualification_gap',    'Qualification Gap',       20),
  ('crew',         'medical_lapse',        'Medical Lapse',           30),
  ('crew',         'training_due',         'Training Due',            40),

  ('compliance',   'ad_compliance',        'AD Compliance',           10),
  ('compliance',   'sb_evaluation',        'SB Evaluation',           20),
  ('compliance',   'certificate_renewal',  'Certificate Renewal',     30),
  ('compliance',   'mel_reconciliation',   'MEL Reconciliation',      40),

  ('inventory',    'stock_out_risk',       'Stock-out Risk',          10),
  ('inventory',    'alternate_part_needed','Alternate Part Needed',   20),
  ('inventory',    'supplier_delay',       'Supplier Delay',          30),
  ('inventory',    'warranty_claim',       'Warranty Claim',          40),

  ('ground_ops',   'ramp_incident',        'Ramp Incident',           10),
  ('ground_ops',   'deicing_issue',        'De-icing Issue',          20),
  ('ground_ops',   'ground_handler_report','Ground Handler Report',   30)
on conflict (parent_type, sub_type) do update
  set display_name = excluded.display_name,
      sort_rank = excluded.sort_rank,
      active = true;
