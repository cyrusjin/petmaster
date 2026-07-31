require('dotenv').config();
const { connectDb } = require('../src/db');
const notify = require('../src/services/notifyService');

async function main() {
  await connectDb();
  const order = {
    order_id: 'ord_test_new_order',
    displayNo: 'TEST001',
    store_id: 'store_1785393933242_ls35px',
    merchantOpenid: 'omhI83VM9KWEJ73tfA8UWwapasjg',
    contactName: '靳昊禹',
    contactPhone: '13160677855',
    serviceType: '寄养预约',
    roomName: '小房间',
    petName: '森',
    startDate: '2026-07-30',
    startTime: '10:00',
    createTime: Date.now()
  };
  const result = await notify.notifyMerchantNewOrder(order);
  console.log('RESULT', JSON.stringify(result));
}

main().catch((err) => {
  console.error('ERR', err.message || err);
  process.exit(1);
});
