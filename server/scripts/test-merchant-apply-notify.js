require('dotenv').config();
const { connectDb } = require('../src/db');
const notify = require('../src/services/notifyService');

async function main() {
  await connectDb();
  const storeDoc = {
    store_id: 'store_1785393933242_ls35px',
    name: '测试店铺0730',
    legalName: '五哥',
    ownerOpenid: 'omhI83VM9KWEJ73tfA8UWwapasjg',
    createTime: Date.now()
  };
  const applicant = {
    applicantName: '靳昊禹',
    applicantOpenid: 'omhI83VM9KWEJ73tfA8UWwapasjg'
  };
  const approved = await notify.notifyMerchantApplyApproved(storeDoc, applicant);
  console.log('APPROVED', JSON.stringify(approved));
}

main().catch((err) => {
  console.error('ERR', err.message || err);
  process.exit(1);
});
