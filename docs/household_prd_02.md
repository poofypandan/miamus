# PRD 02: Household Inventory & Procurement System
## 1. Objective
Enable staff to log physical inventory counts via scheduled stock-check checklists in Indonesian, while providing the Owner with an English dashboard tracking levels, run-out forecasts, and an auto-generated procurement list.

## 2. Inventory Classification & Cadence
- **Fresh Food (Weekly Check):** Milk, Egg, Chicken Thigh, Fish, Beef, Shrimp, Kale, Spinach.
- **Pantry Staples (Bi-Weekly Check):** Red Rice, White Rice, Wild Black Rice, Barley, Yellow Quinoa, Olive Oil, Palm Oil, Flour.
- **Household Supplies (Monthly Check / Quarterly Reorder):** Dishwashing Soap, Rinso, Wood Cleaner, Marble Cleaner, Alcohol, Enzyme Cleaner.
- **Dog Supplies (Weekly Check / High Priority):** Mocha Food (Renal Royal Canin), Matcha Food (Salmon Bravery), Millo Zz Food (tracked by protein type), Pee Pads, Kojima Dog Toothpaste.

## 3. Data Schema
### Table: `inventory_items`
- `id` (uuid, primary key)
- `name` (text, not null)
- `category` (text: 'fresh_food', 'pantry', 'household_supplies', 'dog_supplies')
- `variant` (text, nullable)
- `unit_type` (text)
- `boxes_count` (numeric, default 0)
- `loose_units_count` (numeric, default 0)
- `units_per_box` (numeric, default 1)
- `min_threshold` (numeric, not null)
- `audit_frequency_days` (integer: 7 for weekly, 14 for bi-weekly, 30 for monthly)
- `last_audited_at` (timestamptz, nullable)
- `notes` (text, nullable)

### Table: `inventory_audit_logs`
- `id` (uuid, primary key)
- `item_id` (uuid references `inventory_items(id)`)
- `audited_by` (uuid references `staff_profiles(id)`)
- `boxes_counted` (numeric)
- `loose_units_counted` (numeric)
- `photo_url` (text, nullable)
- `created_at` (timestamptz, default now())
