CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS node_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES data_models(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(32),
  icon VARCHAR(64),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(model_id, name)
);

CREATE TABLE IF NOT EXISTS nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES data_models(id) ON DELETE CASCADE,
  node_type_id UUID REFERENCES node_types(id) ON DELETE SET NULL,
  parent_id UUID REFERENCES nodes(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  path VARCHAR(2048) NOT NULL DEFAULT '',
  depth INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dynamic_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES data_models(id) ON DELETE CASCADE,
  node_type_id UUID REFERENCES node_types(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key VARCHAR(128) NOT NULL,
  field_type VARCHAR(64) NOT NULL DEFAULT 'text',
  behavior VARCHAR(64) NOT NULL DEFAULT 'manual',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_value JSONB,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(model_id, key)
);

CREATE TABLE IF NOT EXISTS field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES dynamic_fields(id) ON DELETE CASCADE,
  value JSONB NOT NULL,
  value_text TEXT,
  value_number NUMERIC,
  value_date TIMESTAMP,
  updated_by UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(node_id, field_id)
);

CREATE TABLE IF NOT EXISTS relation_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES data_models(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key VARCHAR(128) NOT NULL,
  cardinality VARCHAR(64) NOT NULL DEFAULT 'many_to_many',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(model_id, key)
);

CREATE TABLE IF NOT EXISTS node_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relation_type_id UUID NOT NULL REFERENCES relation_types(id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(relation_type_id, source_node_id, target_node_id)
);

CREATE TABLE IF NOT EXISTS formula_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL UNIQUE REFERENCES dynamic_fields(id) ON DELETE CASCADE,
  expression TEXT NOT NULL,
  compiled JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calculation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES dynamic_fields(id) ON DELETE CASCADE,
  value JSONB,
  value_text TEXT,
  value_number NUMERIC,
  status VARCHAR(64) NOT NULL DEFAULT 'ok',
  error TEXT,
  trace JSONB NOT NULL DEFAULT '[]'::jsonb,
  calculated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(node_id, field_id)
);

CREATE TABLE IF NOT EXISTS model_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES data_models(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  view_type VARCHAR(64) NOT NULL DEFAULT 'tree',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_created_by ON workspaces(created_by);
CREATE INDEX IF NOT EXISTS idx_data_models_workspace ON data_models(workspace_id);
CREATE INDEX IF NOT EXISTS idx_node_types_model ON node_types(model_id);
CREATE INDEX IF NOT EXISTS idx_nodes_model ON nodes(model_id);
CREATE INDEX IF NOT EXISTS idx_nodes_node_type ON nodes(node_type_id);
CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_nodes_model_parent_order ON nodes(model_id, parent_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_dynamic_fields_model ON dynamic_fields(model_id);
CREATE INDEX IF NOT EXISTS idx_dynamic_fields_node_type ON dynamic_fields(node_type_id);
CREATE INDEX IF NOT EXISTS idx_field_values_node ON field_values(node_id);
CREATE INDEX IF NOT EXISTS idx_field_values_field ON field_values(field_id);
CREATE INDEX IF NOT EXISTS idx_relation_types_model ON relation_types(model_id);
CREATE INDEX IF NOT EXISTS idx_node_relationships_source ON node_relationships(source_node_id);
CREATE INDEX IF NOT EXISTS idx_node_relationships_target ON node_relationships(target_node_id);
CREATE INDEX IF NOT EXISTS idx_calculation_results_node ON calculation_results(node_id);
CREATE INDEX IF NOT EXISTS idx_calculation_results_field ON calculation_results(field_id);
CREATE INDEX IF NOT EXISTS idx_model_views_model ON model_views(model_id);
