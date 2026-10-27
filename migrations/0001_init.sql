-- Registrations for the Nordic Chess Festival 2027.
-- Apply once per database:  npx wrangler d1 migrations apply DB --remote
CREATE TABLE registrations (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  fide_id TEXT,
  title TEXT,
  rating INTEGER,
  birth_year INTEGER NOT NULL,
  federation TEXT NOT NULL,
  locale TEXT NOT NULL,
  band TEXT NOT NULL,
  discount TEXT NOT NULL,
  bus INTEGER NOT NULL DEFAULT 0,
  entry_cents INTEGER NOT NULL,
  bus_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  paid_on TEXT NOT NULL,
  -- pending | paid | not_required | partially_refunded | refunded
  payment_status TEXT NOT NULL,
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  paid_at TEXT,
  refunded_cents INTEGER NOT NULL DEFAULT 0,
  -- unverified | verified | rejected  (organisers check title, rating and birth year against FIDE)
  review_status TEXT NOT NULL DEFAULT 'unverified',
  note TEXT,
  accepted_terms_at TEXT NOT NULL
);
CREATE INDEX idx_registrations_fide ON registrations (fide_id);
CREATE INDEX idx_registrations_email ON registrations (email);
CREATE UNIQUE INDEX idx_registrations_session ON registrations (stripe_session_id) WHERE stripe_session_id IS NOT NULL;
