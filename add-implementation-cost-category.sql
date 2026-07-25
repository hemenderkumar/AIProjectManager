-- Adds an "IMPLEMENTATION" value to the cost_item_category enum so the Charter's
-- Implementation cost line (previously a single number) can be broken down into itemized
-- cost_items rows, same as Material and Ongoing support already are.
ALTER TYPE cost_item_category ADD VALUE IF NOT EXISTS 'IMPLEMENTATION';
