-- Detailed Design deliverables gain a pictorial architecture/component diagram (Mermaid syntax,
-- same convention as projects.architecture_diagram) in addition to the narrative content.
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS diagram text;
