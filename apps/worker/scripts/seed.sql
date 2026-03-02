-- Seed Locations
INSERT INTO locations (id, name, address, hours_json) VALUES 
('loc_1', 'Downtown Hub', '123 Main St', '{"open":"08:00","close":"20:00"}'),
('loc_2', 'Airport Branch', 'Terminal 1', '{"open":"00:00","close":"23:59"}');

-- Seed Vehicles
INSERT INTO vehicles (id, location_id, make, model, year, class, seats, transmission, fuel, base_price_day, deposit, status) VALUES 
('v_1', 'loc_1', 'Toyota', 'Corolla', 2024, 'compact', 5, 'auto', 'gas', 50.0, 200.0, 'available'),
('v_2', 'loc_1', 'Honda', 'RAV4', 2023, 'suv', 5, 'auto', 'gas', 80.0, 300.0, 'available'),
('v_3', 'loc_2', 'Ford', 'Mustang', 2024, 'suv', 5, 'auto', 'gas', 85.0, 300.0, 'available');

-- Seed Pricing Rules
INSERT INTO pricing_rules (id, name, priority, rule_json, active) VALUES 
('pr_1', '10% off SUV Promo', 10, '{"type":"discount","valueType":"percentage","value":10,"conditions":{"vehicleClass":"suv"}}', 1),
('pr_2', 'Basic Insurance', 5, '{"type":"addon","valueType":"fixed","value":15,"conditions":{"addOnId":"insurance_basic"}}', 1),
('pr_3', 'Airport Surcharge', 1, '{"type":"tax","valueType":"fixed","value":25,"conditions":{"locationId":"loc_2"}}', 1);

-- Seed Macros
INSERT INTO macros (id, title, body, tags_json, visibility_role) VALUES 
('mac_1', 'Welcome Message', 'Hello! Welcome to our car rental service. How can I help you today?', '["greeting"]', 'agent'),
('mac_2', 'Cancel Policy', 'You can cancel for free up to 24 hours before pickup.', '["policy"]', 'agent');
