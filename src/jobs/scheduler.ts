import cron from 'node-cron';
import { processMonthlyPayouts } from '../services/payout';

/**
 * Initialise scheduled jobs.
 * Called once on server startup.
 */
export function initCronJobs() {
  // Run monthly payouts on the 2nd of each month at 2am AEST
  // (2nd gives a buffer for any end-of-month payment processing)
  cron.schedule('0 16 2 * *', async () => {
    // 16:00 UTC = 02:00 AEST next day
    console.log('[Cron] Starting monthly payout run...');
    try {
      const result = await processMonthlyPayouts();
      console.log('[Cron] Monthly payouts complete:', result);
    } catch (err) {
      console.error('[Cron] Monthly payout failed:', err);
    }
  });

  console.log('[Cron] Monthly payout job scheduled (2nd of month, 2am AEST)');
}
