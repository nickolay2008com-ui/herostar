import { commerceState } from './state.js';

export async function initCommerce(storePool = null) {
  commerceState.pool = storePool;
  if (!commerceState.pool) return;
  await commerceState.pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS full_map_unlocked BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS clone_passport_unlocked BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS clone_access_until TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS clone_alignment_until TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS clone_alignment_chart_id UUID REFERENCES charts(id) ON DELETE SET NULL;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS return_ref UUID;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS offer_code TEXT;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS entitlement_applied_at TIMESTAMPTZ;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS credit_source_payment_id TEXT;

    CREATE TABLE IF NOT EXISTS clone_chart_entitlements (
      user_id TEXT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
      chart_id UUID NOT NULL REFERENCES charts(id) ON DELETE CASCADE,
      full_map_unlocked BOOLEAN NOT NULL DEFAULT FALSE,
      passport_unlocked BOOLEAN NOT NULL DEFAULT FALSE,
      access_until TIMESTAMPTZ,
      alignment_until TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, chart_id)
    );
    CREATE INDEX IF NOT EXISTS clone_entitlements_alignment_idx
      ON clone_chart_entitlements(user_id, alignment_until) WHERE alignment_until IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS payments_return_ref_unique ON payments(return_ref) WHERE return_ref IS NOT NULL;
    CREATE INDEX IF NOT EXISTS payments_offer_user_idx ON payments(user_id, offer_code, created_at DESC);
    DROP INDEX IF EXISTS payments_day_credit_active_unique;
    CREATE UNIQUE INDEX payments_day_credit_active_unique ON payments(credit_source_payment_id)
      WHERE credit_source_payment_id IS NOT NULL
        AND status IN ('checkout_reserved', 'pending', 'waiting_for_capture', 'succeeded');
    CREATE INDEX IF NOT EXISTS users_clone_alignment_idx ON users(clone_alignment_until) WHERE clone_alignment_until IS NOT NULL;

    INSERT INTO clone_chart_entitlements (
      user_id, chart_id, full_map_unlocked, passport_unlocked, access_until, alignment_until
    )
    SELECT payment.user_id, payment.chart_id, TRUE, TRUE,
           MAX(CASE
             WHEN payment.offer_code = 'clone_alignment' THEN payment.created_at + INTERVAL '30 days'
             WHEN payment.offer_code = 'clone_day' THEN payment.created_at + INTERVAL '24 hours'
           END),
           MAX(CASE WHEN payment.offer_code = 'clone_alignment' THEN payment.created_at + INTERVAL '30 days' END)
    FROM payments AS payment
    JOIN clone_charts AS clone ON clone.chart_id = payment.chart_id
    WHERE payment.status = 'succeeded'
      AND payment.user_id IS NOT NULL
      AND payment.chart_id IS NOT NULL
      AND payment.offer_code IN ('clone_day', 'clone_alignment')
    GROUP BY payment.user_id, payment.chart_id
    ON CONFLICT (user_id, chart_id) DO UPDATE SET
      full_map_unlocked = clone_chart_entitlements.full_map_unlocked OR EXCLUDED.full_map_unlocked,
      passport_unlocked = clone_chart_entitlements.passport_unlocked OR EXCLUDED.passport_unlocked,
      access_until = GREATEST(clone_chart_entitlements.access_until, EXCLUDED.access_until),
      alignment_until = GREATEST(clone_chart_entitlements.alignment_until, EXCLUDED.alignment_until),
      updated_at = NOW();

    INSERT INTO clone_chart_entitlements (
      user_id, chart_id, full_map_unlocked, passport_unlocked, access_until, alignment_until
    )
    SELECT user_record.telegram_id, selected.chart_id, TRUE,
           user_record.clone_passport_unlocked,
           user_record.clone_access_until,
           user_record.clone_alignment_until
    FROM users AS user_record
    CROSS JOIN LATERAL (
      SELECT COALESCE(
        user_record.clone_alignment_chart_id,
        (SELECT payment.chart_id FROM payments AS payment
         JOIN clone_charts AS paid_clone ON paid_clone.chart_id = payment.chart_id
         WHERE payment.user_id = user_record.telegram_id
           AND payment.status = 'succeeded'
           AND payment.offer_code IN ('clone_day', 'clone_alignment')
         ORDER BY payment.created_at DESC LIMIT 1),
        (SELECT chart.id FROM charts AS chart
         JOIN clone_charts AS clone ON clone.chart_id = chart.id
         WHERE chart.user_id = user_record.telegram_id
         ORDER BY chart.created_at DESC LIMIT 1)
      ) AS chart_id
    ) AS selected
    WHERE selected.chart_id IS NOT NULL
      AND (user_record.clone_passport_unlocked = TRUE
        OR user_record.clone_access_until IS NOT NULL
        OR user_record.clone_alignment_until IS NOT NULL)
    ON CONFLICT (user_id, chart_id) DO UPDATE SET
      full_map_unlocked = TRUE,
      passport_unlocked = clone_chart_entitlements.passport_unlocked OR EXCLUDED.passport_unlocked,
      access_until = GREATEST(clone_chart_entitlements.access_until, EXCLUDED.access_until),
      alignment_until = GREATEST(clone_chart_entitlements.alignment_until, EXCLUDED.alignment_until),
      updated_at = NOW();
  `);
}
