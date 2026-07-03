CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_admin BOOLEAN DEFAULT false,
  is_employee BOOLEAN DEFAULT false,
  user_role VARCHAR(50) DEFAULT 'employee',
  employee_id VARCHAR(50) UNIQUE,
  full_name VARCHAR(255),
  phone_number VARCHAR(20),
  gitlab_username VARCHAR(255),
  official_mail VARCHAR(255),
  role VARCHAR(50),
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  shift VARCHAR(20),
  status VARCHAR(20),
  is_project_lead BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES tiers(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  level INTEGER NOT NULL DEFAULT 0,
  allow_child_creation BOOLEAN DEFAULT true,
  allow_field_management BOOLEAN DEFAULT false,
  tier_color VARCHAR DEFAULT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(parent_id, name)
);

CREATE TABLE IF NOT EXISTS tier_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id UUID NOT NULL REFERENCES tiers(id) ON DELETE CASCADE,
  field_name VARCHAR(255) NOT NULL,
  field_type VARCHAR(50) NOT NULL DEFAULT 'string',
  field_options TEXT,
  display_order INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tier_id, field_name)
);

CREATE TABLE IF NOT EXISTS tier_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id UUID REFERENCES tiers(id) ON DELETE CASCADE,
  field_id UUID REFERENCES tier_fields(id) ON DELETE CASCADE,
  value NUMERIC,
  text_value TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tier_id, field_id)
);

CREATE TABLE IF NOT EXISTS field_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_by UUID REFERENCES users(id),
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS template_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES field_templates(id) ON DELETE CASCADE,
  field_name VARCHAR(255) NOT NULL,
  field_type VARCHAR(50) DEFAULT 'string',
  field_options TEXT,
  display_order INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_team_id ON users(team_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_tiers_project ON tiers(project_id);
CREATE INDEX IF NOT EXISTS idx_tiers_parent ON tiers(parent_id);
CREATE INDEX IF NOT EXISTS idx_tiers_parent_order ON tiers(parent_id, display_order);
CREATE INDEX IF NOT EXISTS idx_tier_fields_tier_id ON tier_fields(tier_id);
CREATE INDEX IF NOT EXISTS idx_tier_data_tier ON tier_data(tier_id);
CREATE INDEX IF NOT EXISTS idx_tier_data_field ON tier_data(field_id);
CREATE INDEX IF NOT EXISTS idx_field_templates_created_by ON field_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_field_templates_is_system ON field_templates(is_system);
CREATE INDEX IF NOT EXISTS idx_template_fields_template ON template_fields(template_id);

INSERT INTO users (email, password_hash, is_admin, user_role)
VALUES ('admin@example.com', 'admin123', true, 'admin')
ON CONFLICT (email) DO NOTHING;

INSERT INTO roles (name) VALUES
('Frontend Developer'),
('Backend Developer'),
('Backend Node'),
('Backend Python'),
('Backend Laravel'),
('AI Developer'),
('UI-UX Designer'),
('Flutter Developer')
ON CONFLICT (name) DO NOTHING;

INSERT INTO shifts (name) VALUES ('Day'), ('Night')
ON CONFLICT (name) DO NOTHING;

INSERT INTO statuses (name) VALUES ('Probation'), ('Permanent')
ON CONFLICT (name) DO NOTHING;

INSERT INTO teams (name) VALUES
('CyberMonk'),
('Runtime Terror'),
('Future Stack')
ON CONFLICT (name) DO NOTHING;

INSERT INTO field_templates (name, description, is_system, created_by)
VALUES
  ('Attendance', 'Track daily attendance with fields for each day of the month', true, NULL),
  ('Task Management', 'Basic task tracking with name, duration, dates, and status', true, NULL)
ON CONFLICT DO NOTHING;

INSERT INTO template_fields (template_id, field_name, field_type, display_order)
SELECT id, 'Day ' || generate_series(1, 31), 'number', generate_series(1, 31)
FROM field_templates
WHERE name = 'Attendance' AND is_system = true
ON CONFLICT DO NOTHING;

WITH task_template AS (
  SELECT id FROM field_templates WHERE name = 'Task Management' AND is_system = true LIMIT 1
)
INSERT INTO template_fields (template_id, field_name, field_type, display_order)
SELECT (SELECT id FROM task_template), 'Task Name', 'string', 1
UNION ALL SELECT (SELECT id FROM task_template), 'Duration', 'number', 2
UNION ALL SELECT (SELECT id FROM task_template), 'Start Date', 'date', 3
UNION ALL SELECT (SELECT id FROM task_template), 'End Date', 'date', 4
UNION ALL SELECT (SELECT id FROM task_template), 'Status', 'dropdown', 5
UNION ALL SELECT (SELECT id FROM task_template), 'Assigned To', 'string', 6
ON CONFLICT DO NOTHING;
