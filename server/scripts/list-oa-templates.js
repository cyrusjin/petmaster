require('dotenv').config();
const axios = require('axios');
const wechat = require('../src/wechat');

wechat.getOaAccessToken()
  .then((token) => axios.get(`https://api.weixin.qq.com/cgi-bin/template/get_all_private_template?access_token=${token}`))
  .then((res) => {
    const list = (res.data && res.data.template_list) || [];
    console.log(JSON.stringify(list.map((item) => ({
      id: item.template_id,
      title: item.title,
      content: item.content
    })), null, 2));
  })
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
