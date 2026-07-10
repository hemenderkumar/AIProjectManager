-- Adds contingency %, ongoing support estimate, material/support cost items,
-- vendor invoice tracking, and task time-log entries. Run once in Supabase's SQL Editor.

-- 1. Contingency + ongoing support on projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contingency_percent real DEFAULT 10;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ongoing_support_monthly_cost real;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ongoing_support_plan text;

-- 2. Cost items (material costs like licenses/servers, and ongoing support cost items)
DO $$ BEGIN
  CREATE TYPE cost_item_category AS ENUM ('MATERIAL', 'ONGOING_SUPPORT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS cost_items (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category cost_item_category NOT NULL DEFAULT 'MATERIAL',
  name text NOT NULL,
  amount real NOT NULL DEFAULT 0,
  is_recurring boolean NOT NULL DEFAULT false,
  cadence text,
  notes text,
  created_by_ai boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now()
);

-- 3. Vendor / contractor invoice tracking
DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'DISPUTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS invoices (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vendor text NOT NULL,
  invoice_number text,
  amount real NOT NULL DEFAULT 0,
  invoice_date timestamp,
  due_date timestamp,
  status invoice_status NOT NULL DEFAULT 'PENDING',
  notes text,
  created_at timestamp NOT NULL DEFAULT now()
);

-- 4. Task effort/time-log entries
CREATE TABLE IF NOT EXISTS time_entries (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  resource_id text REFERENCES resources(id),
  hours real NOT NULL DEFAULT 0,
  entry_date timestamp NOT NULL DEFAULT now(),
  notes text,
  created_at timestamp NOT NULL DEFAULT now()
);
