CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  phone VARCHAR(30) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A phone number is optional at registration, but once bound it can be used
-- for the MVP's virtual SMS login and password reset flows.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
ON users(phone) WHERE phone IS NOT NULL;

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

-- ---------------------------------------------------------------------------
-- Schema v2: AI-readable entities, relationships, and embedding work queue.
--
-- cards and products remain the current UI's source of truth.  The v2 tables
-- below are an AI-oriented projection of those records, so existing pages and
-- APIs continue to work unchanged while future search can use one model for
-- people, companies, organizations, products, and services.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS entities (
  id BIGSERIAL PRIMARY KEY,
  entity_type VARCHAR(20) NOT NULL CHECK (
    entity_type IN ('person', 'company', 'organization', 'product', 'service')
  ),
  name VARCHAR(160) NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_card_id BIGINT UNIQUE REFERENCES cards(id) ON DELETE CASCADE,
  source_product_id BIGINT UNIQUE REFERENCES products(id) ON DELETE CASCADE,
  owner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (source_card_id IS NOT NULL AND source_product_id IS NULL)
    OR (source_card_id IS NULL AND source_product_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_owner_user_id ON entities(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_entities_source_card_id ON entities(source_card_id);
CREATE INDEX IF NOT EXISTS idx_entities_source_product_id ON entities(source_product_id);

CREATE TABLE IF NOT EXISTS entity_relations (
  id BIGSERIAL PRIMARY KEY,
  from_entity_id BIGINT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_entity_id BIGINT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_type VARCHAR(40) NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  source VARCHAR(30) NOT NULL DEFAULT 'migration',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_entity_id <> to_entity_id),
  UNIQUE (from_entity_id, to_entity_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_entity_relations_from ON entity_relations(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_relations_to ON entity_relations(to_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_relations_type ON entity_relations(relation_type);

CREATE TABLE IF NOT EXISTS entity_embeddings (
  id BIGSERIAL PRIMARY KEY,
  entity_id BIGINT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  embedding_model VARCHAR(120) NOT NULL DEFAULT 'pending',
  -- JSONB keeps the current PGlite Demo runnable.  When DATABASE_URL points
  -- to PostgreSQL with pgvector, db.js also adds embedding_vector vector(1536).
  embedding_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  embedding_dimensions INTEGER NOT NULL DEFAULT 0 CHECK (embedding_dimensions >= 0),
  source_text TEXT NOT NULL DEFAULT '',
  content_hash VARCHAR(64) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_id, embedding_model)
);

CREATE INDEX IF NOT EXISTS idx_entity_embeddings_entity_id ON entity_embeddings(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_embeddings_status ON entity_embeddings(status);

-- 1. Project each existing card into one entity.  ON CONFLICT makes this
-- migration safe to run again whenever the application starts.
INSERT INTO entities (
  entity_type, name, summary, search_text, attributes, source_card_id, owner_user_id, updated_at
)
SELECT
  CASE c.card_type
    WHEN 'company' THEN 'company'
    WHEN 'organization' THEN 'organization'
    ELSE 'person'
  END,
  c.name,
  c.tagline,
  concat_ws(' ',
    c.name, c.tagline, c.bio, c.company_name, c.department, c.job_title,
    c.occupation, c.expertise, c.main_business, c.region, c.website, c.address
  ),
  jsonb_build_object(
    'card_type', c.card_type,
    'slug', c.slug,
    'company_name', c.company_name,
    'department', c.department,
    'job_title', c.job_title,
    'occupation', c.occupation,
    'expertise', c.expertise,
    'main_business', c.main_business,
    'region', c.region,
    'website', c.website,
    'address', c.address
  ),
  c.id,
  c.user_id,
  NOW()
FROM cards c
ON CONFLICT (source_card_id) DO UPDATE SET
  entity_type = EXCLUDED.entity_type,
  name = EXCLUDED.name,
  summary = EXCLUDED.summary,
  search_text = EXCLUDED.search_text,
  attributes = EXCLUDED.attributes,
  owner_user_id = EXCLUDED.owner_user_id,
  updated_at = NOW();

-- 2. Project every product into an entity. source_type=service is reserved
-- for a future service entry point; today's product rows remain products.
INSERT INTO entities (
  entity_type, name, summary, search_text, attributes, source_product_id, owner_user_id, updated_at
)
SELECT
  'product',
  p.name,
  p.description,
  concat_ws(' ', p.name, p.description, c.name, c.company_name, c.main_business, c.website),
  jsonb_build_object(
    'image_url', p.image_url,
    'external_url', p.external_url,
    'source_type', p.source_type,
    'sort_order', p.sort_order,
    'card_id', p.card_id
  ),
  p.id,
  c.user_id,
  NOW()
FROM products p
JOIN cards c ON c.id = p.card_id
ON CONFLICT (source_product_id) DO UPDATE SET
  entity_type = EXCLUDED.entity_type,
  name = EXCLUDED.name,
  summary = EXCLUDED.summary,
  search_text = EXCLUDED.search_text,
  attributes = EXCLUDED.attributes,
  owner_user_id = EXCLUDED.owner_user_id,
  updated_at = NOW();

-- 3. A product is offered by the card that owns it.
INSERT INTO entity_relations (
  from_entity_id, to_entity_id, relation_type, attributes, source, updated_at
)
SELECT
  product_entity.id,
  card_entity.id,
  'offered_by',
  jsonb_build_object('card_id', p.card_id),
  'migration',
  NOW()
FROM products p
JOIN entities product_entity ON product_entity.source_product_id = p.id
JOIN entities card_entity ON card_entity.source_card_id = p.card_id
ON CONFLICT (from_entity_id, to_entity_id, relation_type) DO UPDATE SET
  attributes = EXCLUDED.attributes,
  source = EXCLUDED.source,
  updated_at = NOW();

-- 4. Where a personal card's company name matches an existing company or
-- organization card, record the explicit employment relationship.
INSERT INTO entity_relations (
  from_entity_id, to_entity_id, relation_type, attributes, source, updated_at
)
SELECT
  person_entity.id,
  organization_entity.id,
  'works_for',
  jsonb_build_object('department', person_card.department, 'job_title', person_card.job_title),
  'migration',
  NOW()
FROM cards person_card
JOIN entities person_entity ON person_entity.source_card_id = person_card.id
JOIN cards organization_card
  ON lower(trim(organization_card.name)) = lower(trim(person_card.company_name))
  AND organization_card.card_type IN ('company', 'organization')
JOIN entities organization_entity ON organization_entity.source_card_id = organization_card.id
WHERE person_card.card_type = 'personal'
  AND trim(person_card.company_name) <> ''
ON CONFLICT (from_entity_id, to_entity_id, relation_type) DO UPDATE SET
  attributes = EXCLUDED.attributes,
  source = EXCLUDED.source,
  updated_at = NOW();

-- 5. Queue every entity for future embedding generation. A later embedding
-- job can replace the pending row with a real model name and vector.
INSERT INTO entity_embeddings (
  entity_id, embedding_model, source_text, content_hash, status, updated_at
)
SELECT
  e.id,
  'pending',
  e.search_text,
  md5(e.search_text),
  'pending',
  NOW()
FROM entities e
ON CONFLICT (entity_id, embedding_model) DO UPDATE SET
  status = CASE
    WHEN entity_embeddings.content_hash IS DISTINCT FROM EXCLUDED.content_hash THEN 'pending'
    ELSE entity_embeddings.status
  END,
  source_text = EXCLUDED.source_text,
  content_hash = EXCLUDED.content_hash,
  updated_at = NOW();
