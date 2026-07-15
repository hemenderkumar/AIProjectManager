-- Creates a real admin user to replace the DISABLE_AUTH bypass ("bypass-admin"), which has
-- no actual row in the users table and causes foreign-key errors (500s) anywhere the app
-- tries to reference the current user's id in another table -- e.g. adding you as a project
-- member when creating a project, or writing an audit log entry.
--
-- Login after running this:
--   email:    hemender.kumar@gmail.com
--   password: 1ipqnAZvVlnf
--
-- Change this password after your first login if you'd like a memorable one instead --
-- there's no in-app "change password" screen yet, so for now that means running another
-- UPDATE statement like:
--   UPDATE users SET password_hash = '<new bcrypt hash>' WHERE email = 'hemender.kumar@gmail.com';

INSERT INTO users (id, name, email, password_hash, role, organization_id)
VALUES (
  'admin-hemender-001',
  'Hemender Kumar',
  'hemender.kumar@gmail.com',
  '$2b$10$Ihaq4NPKCbkYwclnIkhZjOAbllGVekmMJw25HbM1WQ7quBzgXGnC2',
  'ADMIN',
  NULL
)
ON CONFLICT (email) DO NOTHING;
