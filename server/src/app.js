const express = require('express');
const cors = require('cors');
const config = require('./config');
const { connectDb } = require('./db');
const authRouter = require('./routes/auth');
const {
  storeRouter,
  orderRouter,
  petRouter,
  dailyRouter,
  uploadRouter
} = require('./routes/api');

async function main() {
  await connectDb();
  console.log('[db] connected');

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (req, res) => {
    res.json({ ok: true, time: Date.now() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/user', authRouter);
  app.use('/api/store', storeRouter);
  app.use('/api/order', orderRouter);
  app.use('/api/pet', petRouter);
  app.use('/api/daily', dailyRouter);
  app.use('/api/upload', uploadRouter);

  app.use((req, res) => {
    res.status(404).json({ success: false, errMsg: '接口不存在' });
  });

  app.listen(config.port, () => {
    console.log(`[server] listening on :${config.port}`);
  });
}

main().catch((err) => {
  console.error('[server] failed to start', err);
  process.exit(1);
});
