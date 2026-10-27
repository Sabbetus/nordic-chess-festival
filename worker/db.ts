import type { D1Like } from './types.ts';

export interface RegistrationRow {
  id: string;
  created_at: string;
  name: string;
  email: string;
  phone: string;
  fide_id: string | null;
  title: string | null;
  rating: number | null;
  birth_year: number;
  federation: string;
  locale: string;
  band: string;
  discount: string;
  bus: number;
  entry_cents: number;
  bus_cents: number;
  total_cents: number;
  paid_on: string;
  payment_status: string;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  paid_at: string | null;
  refunded_cents: number;
  review_status: string;
  note: string | null;
  accepted_terms_at: string;
}

const COLUMNS: (keyof RegistrationRow)[] = [
  'id', 'created_at', 'name', 'email', 'phone', 'fide_id', 'title', 'rating', 'birth_year', 'federation', 'locale',
  'band', 'discount', 'bus', 'entry_cents', 'bus_cents', 'total_cents', 'paid_on', 'payment_status',
  'stripe_session_id', 'stripe_payment_intent', 'paid_at', 'refunded_cents', 'review_status', 'note', 'accepted_terms_at',
];

export async function insertRegistration(db: D1Like, row: RegistrationRow): Promise<void> {
  const sql = `INSERT INTO registrations (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map(() => '?').join(', ')})`;
  await db.prepare(sql).bind(...COLUMNS.map((c) => row[c])).run();
}

/** Someone already registered (paid, or free and not rejected) with the same FIDE ID, or the same email and name. */
export async function findDuplicate(db: D1Like, who: { fideId: string | null; email: string; name: string }): Promise<{ id: string } | null> {
  const live = `payment_status IN ('paid', 'not_required', 'partially_refunded') AND review_status != 'rejected'`;
  if (who.fideId) {
    return db.prepare(`SELECT id FROM registrations WHERE fide_id = ? AND ${live} LIMIT 1`).bind(who.fideId).first<{ id: string }>();
  }
  return db
    .prepare(`SELECT id FROM registrations WHERE fide_id IS NULL AND email = ? AND lower(name) = lower(?) AND ${live} LIMIT 1`)
    .bind(who.email, who.name)
    .first<{ id: string }>();
}

export async function attachSession(db: D1Like, id: string, sessionId: string): Promise<void> {
  await db.prepare('UPDATE registrations SET stripe_session_id = ? WHERE id = ?').bind(sessionId, id).run();
}

export async function deleteRegistration(db: D1Like, id: string): Promise<void> {
  await db.prepare('DELETE FROM registrations WHERE id = ?').bind(id).run();
}

export async function deleteStalePending(db: D1Like, olderThanIso: string): Promise<void> {
  await db.prepare(`DELETE FROM registrations WHERE payment_status = 'pending' AND created_at < ?`).bind(olderThanIso).run();
}

/** Marks a pending registration as paid. Safe to call twice for the same event. */
export async function markPaid(db: D1Like, sessionId: string, paymentIntent: string | null, paidAt: string): Promise<boolean> {
  const before = await db.prepare('SELECT id FROM registrations WHERE stripe_session_id = ? AND payment_status = ?').bind(sessionId, 'pending').first();
  if (!before) return false;
  await db
    .prepare(`UPDATE registrations SET payment_status = 'paid', stripe_payment_intent = ?, paid_at = ? WHERE stripe_session_id = ? AND payment_status = 'pending'`)
    .bind(paymentIntent, paidAt, sessionId)
    .run();
  return true;
}

export async function applyRefund(db: D1Like, paymentIntent: string, refundedCents: number, totalCents: number): Promise<void> {
  const status = refundedCents >= totalCents ? 'refunded' : refundedCents > 0 ? 'partially_refunded' : 'paid';
  await db
    .prepare('UPDATE registrations SET refunded_cents = ?, payment_status = ? WHERE stripe_payment_intent = ?')
    .bind(refundedCents, status, paymentIntent)
    .run();
}

export async function listRegistrations(db: D1Like, includePending: boolean): Promise<RegistrationRow[]> {
  const where = includePending ? '' : `WHERE payment_status != 'pending'`;
  const { results } = await db.prepare(`SELECT * FROM registrations ${where} ORDER BY created_at ASC`).all<RegistrationRow>();
  return results;
}

export async function updateReview(db: D1Like, id: string, reviewStatus: string, note: string | null): Promise<boolean> {
  const row = await db.prepare('SELECT id FROM registrations WHERE id = ?').bind(id).first();
  if (!row) return false;
  await db.prepare('UPDATE registrations SET review_status = ?, note = ? WHERE id = ?').bind(reviewStatus, note, id).run();
  return true;
}
