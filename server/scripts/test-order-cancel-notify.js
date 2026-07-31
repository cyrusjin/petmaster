require('dotenv').config();
const { connectDb } = require('../src/db');
const notify = require('../src/services/notifyService');

async function main() {
  await connectDb();
  const order = {
    order_id: 'ord_test_cancel',
    store_id: 'store_1785393933242_ls35px',
    merchantOpenid: 'omhI83VM9KWEJ73tfA8UWwapasjg',
    userOpenid: 'omhI83VM9KWEJ73tfA8UWwapasjg',
    contactPhone: '13160677855',
    serviceType: '寄养预约',
    roomName: '小房间',
    petName: '森',
    updateTime: Date.now()
  };
  const userCancel = await notify.notifyOrderCancelled(order, { cancelledBy: 'user' });
  console.log('USER_CANCEL', JSON.stringify(userCancel));
}

main().catch((err) => {
  console.error('ERR', err.message || err);
  process.exit(1);
});
