const { connectDb } = require('../src/db');
const notify = require('../src/services/notifyService');

async function main() {
  await connectDb();
const order = {
  order_id: 'ord_1785394350059_raxgf0',
  userOpenid: 'omhI83VM9KWEJ73tfA8UWwapasjg',
  store_id: 'store_1785393933242_ls35px',
  petName: '森'
};

const log = {
  petName: '森',
  checks: ['play', 'spirit'],
  time: '2026-07-30 14:54',
  publishedAt: Date.now()
};

notify
  .notifyUserDailyCheck(order, log)
  .then((result) => {
    console.log('RESULT', JSON.stringify(result));
    process.exit(0);
  })
  .catch((err) => {
    console.error('ERR', err.message || err);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('ERR', err.message || err);
  process.exit(1);
});
