CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cards (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  slug VARCHAR(64) NOT NULL UNIQUE,
  card_type VARCHAR(16) NOT NULL CHECK (card_type IN ('personal', 'company', 'organization')),
  name VARCHAR(80) NOT NULL,
  tagline VARCHAR(120) NOT NULL DEFAULT '',
  phone VARCHAR(30) NOT NULL DEFAULT '',
  contact_email VARCHAR(254) NOT NULL DEFAULT '',
  wechat VARCHAR(80) NOT NULL DEFAULT '',
  wechat_qr_url VARCHAR(500) NOT NULL DEFAULT '',
  region VARCHAR(100) NOT NULL DEFAULT '',
  avatar_url VARCHAR(500) NOT NULL DEFAULT '',
  bio VARCHAR(200) NOT NULL DEFAULT '',
  occupation VARCHAR(100) NOT NULL DEFAULT '',
  expertise VARCHAR(200) NOT NULL DEFAULT '',
  main_business VARCHAR(200) NOT NULL DEFAULT '',
  founded_at VARCHAR(30) NOT NULL DEFAULT '',
  team_size VARCHAR(50) NOT NULL DEFAULT '',
  company_name VARCHAR(120) NOT NULL DEFAULT '',
  department VARCHAR(100) NOT NULL DEFAULT '',
  job_title VARCHAR(100) NOT NULL DEFAULT '',
  telephone VARCHAR(30) NOT NULL DEFAULT '',
  website VARCHAR(300) NOT NULL DEFAULT '',
  address VARCHAR(200) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Existing MVP databases are migrated in place. card_type is retained only for
-- backward compatibility; the new editor no longer treats person/company as opposites.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS company_name VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS department VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS job_title VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS telephone VARCHAR(30) NOT NULL DEFAULT '';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS website VARCHAR(300) NOT NULL DEFAULT '';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS address VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS wechat_qr_url VARCHAR(500) NOT NULL DEFAULT '';
ALTER TABLE cards ALTER COLUMN card_type SET DEFAULT 'personal';

UPDATE cards SET job_title = occupation
WHERE job_title = '' AND occupation <> '';

UPDATE cards SET company_name = name
WHERE company_name = '' AND card_type IN ('company', 'organization');

CREATE INDEX IF NOT EXISTS idx_cards_slug ON cards(slug);

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  card_id BIGINT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(320) NOT NULL DEFAULT '',
  image_url VARCHAR(500) NOT NULL,
  external_url VARCHAR(1000) NOT NULL DEFAULT '',
  source_type VARCHAR(20) NOT NULL DEFAULT 'manual',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS description VARCHAR(320) NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_products_card_id ON products(card_id);
