
DROP VIEW eligible_users;

CREATE TABLE user_modules_new (
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  module TEXT NOT NULL,
  PRIMARY KEY ( user_id, module )
);
INSERT INTO user_modules_new ( user_id, module ) SELECT user_id, module FROM user_modules;
DROP TABLE user_modules;
ALTER TABLE user_modules_new RENAME TO user_modules;

CREATE VIEW eligible_users AS
  SELECT u.id AS user_id, um.module, u.vault_dir
  FROM users u JOIN user_modules um ON um.user_id = u.id
  WHERE u.status = 'active';
