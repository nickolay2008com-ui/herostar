import { processWebhook } from './payments.js';

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 20;
let startedRuntime = null;

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

async function recoverPaymentById(paymentId) {
  return processWebhook({ object: { id: paymentId } });
}

export async function recoverPendingPayments({
  pool,
  limit = DEFAULT_BATCH_SIZE,
  recoverPayment = recoverPaymentById,
  onError = (paymentId, error) => console.error(`HeroStar payment recovery failed for ${paymentId}:`, error),
} = {}) {
  if (!pool?.query) throw new TypeError('Payment recovery requires a database pool.');
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || DEFAULT_BATCH_SIZE));
  const result = await pool.query(
    `SELECT id
     FROM payments
     WHERE id NOT LIKE 'checkout:%'
       AND (
         status IN ('pending', 'waiting_for_capture')
         OR (status = 'succeeded' AND entitlement_applied_at IS NULL)
       )
       AND updated_at >= NOW() - INTERVAL '48 hours'
       AND updated_at <= NOW() - INTERVAL '2 minutes'
     ORDER BY updated_at ASC
     LIMIT $1`,
    [safeLimit],
  );

  let reconciled = 0;
  let failed = 0;
  for (const row of result.rows || []) {
    try {
      await recoverPayment(row.id);
      reconciled += 1;
    } catch (error) {
      failed += 1;
      onError(row.id, error);
    }
  }
  return { checked: (result.rows || []).length, reconciled, failed };
}

export async function startPaymentRecovery() {
  if (startedRuntime) return startedRuntime;
  startedRuntime = (async () => {
    const enabled = String(process.env.PAYMENT_RECOVERY_ENABLED || 'true').toLowerCase() !== 'false';
    const databaseUrl = String(process.env.DATABASE_URL || '').trim();
    const paymentsConfigured = Boolean(
      String(process.env.YOOKASSA_SHOP_ID || '').trim()
      && String(process.env.YOOKASSA_SECRET_KEY || '').trim(),
    );
    if (!enabled || !databaseUrl || !paymentsConfigured) {
      return { stop: async () => {} };
    }

    const pgModule = await import('pg');
    const Pool = pgModule.Pool || pgModule.default?.Pool;
    if (!Pool) throw new Error('pg.Pool недоступен для восстановления платежей.');
    const pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
      max: 1,
    });
    const intervalMs = boundedNumber(
      process.env.PAYMENT_RECOVERY_INTERVAL_MS,
      DEFAULT_INTERVAL_MS,
      60_000,
      60 * 60 * 1000,
    );
    const batchSize = boundedNumber(process.env.PAYMENT_RECOVERY_BATCH_SIZE, DEFAULT_BATCH_SIZE, 1, 100);

    let cycleRunning = false;
    const cycle = async () => {
      if (cycleRunning) return;
      cycleRunning = true;
      try {
        await recoverPendingPayments({ pool, limit: batchSize });
      } catch (error) {
        console.error('HeroStar payment recovery cycle failed:', error);
      } finally {
        cycleRunning = false;
      }
    };

    await cycle();
    const interval = setInterval(cycle, intervalMs);
    interval.unref?.();
    console.log(`HeroStar payment recovery started: every ${Math.round(intervalMs / 60_000)} min.`);

    return {
      async stop() {
        clearInterval(interval);
        await pool.end();
      },
    };
  })();
  return startedRuntime;
}
