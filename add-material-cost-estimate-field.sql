-- Adds the material_cost_estimate column used by the Charter's now-editable/AI-draftable
-- Cost Summary (Material cost is no longer purely a read-only rollup of itemized cost
-- items -- it's its own directly editable figure now, same idea as budgetPlanned).
--
-- contingency_percent already exists with a DEFAULT 10 at the schema level (added in an
-- earlier migration) -- nothing further needed there; existing rows that predate that
-- column may still be NULL, which the app already treats as 10% via `?? 10` wherever it's
-- read, so no backfill is required.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS material_cost_estimate real;
