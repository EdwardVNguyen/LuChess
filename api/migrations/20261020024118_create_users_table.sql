-- +goose Up
CREATE TYPE user_role AS ENUM('user','admin');

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name VARCHAR(255) NOT NULL UNIQUE,
  biography VARCHAR(4095) NULL,
  avatar_url TEXT NULL,
  role user_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- +goose Down
DROP TABLE IF EXISTS users;
DROP TYPE user_role;
