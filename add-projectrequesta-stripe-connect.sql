-- Real payments via Stripe Connect (#259). "Separate charges and transfers" escrow model:
-- a Client's Checkout Session captures funds onto the Platform's own Stripe balance
-- (PENDING -> HELD), and releasing the payment issues a real Transfer to the Vendor's
-- connected account (HELD -> RELEASED). All columns nullable -- every pre-existing row, and
-- every org/payment that never touches Stripe, is unaffected.

ALTER TABLE sc_organizations
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE sc_payments
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_transfer_id text,
  ADD COLUMN IF NOT EXISTS stripe_refund_id text;
