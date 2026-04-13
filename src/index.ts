import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { config } from './config';
import { initCronJobs } from './jobs/scheduler';

// Route imports
import organisationsRouter from './routes/organisations';
import subscriptionsRouter from './routes/subscriptions';
import userRouter from './routes/user';
import spotlightRouter from './routes/spotlight';
import webhooksRouter from './routes/webhooks';
import waitlistRouter from './routes/waitlist';

const app = express();

// ── Global Middleware ────────────────────────

app.use(helmet());
app.use(cors({
  origin: [
    'https://joinripple.com.au',
    'https://joinripple.au',
    ...(config.nodeEnv === 'development' ? ['http://localhost:3001', 'http://localhost:19006'] : []),
  ],
  credentials: true,
}));
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

// IMPORTANT: Stripe webhooks need the raw body for signature verification.
// This must come BEFORE the json() parser.
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));

// JSON parser for everything else
app.use(express.json());

// ── Routes ──────────────────────────────────

app.use('/api/organisations', organisationsRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/user', userRouter);
app.use('/api/spotlight', spotlightRouter);
app.use('/api/webhooks/stripe', webhooksRouter);
app.use('/api/waitlist', waitlistRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', env: config.nodeEnv });
});

// Landing page
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Start Server ────────────────────────────

app.listen(config.port, () => {
  console.log(`
  ╭─────────────────────────────────────────╮
  │                                         │
  │   🌊 Ripple API running                 │
  │   Port: ${config.port}                          │
  │   Env:  ${config.nodeEnv.padEnd(27)}│
  │                                         │
  ╰─────────────────────────────────────────╯
  `);

  // Start cron jobs in production
  if (config.nodeEnv === 'production') {
    initCronJobs();
  }
});

export default app;
