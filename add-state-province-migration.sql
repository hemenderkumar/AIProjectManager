-- Adds the new "State/Province" field paired with the existing project Country tag.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS state_province text;
