function normalizeCloudError(err, functionName) {
  const raw = (err && (err.errMsg || err.message)) || '云函数调用失败';
  if (/timeout/i.test(raw)) {
    return `云函数 ${functionName} 调用超时，请检查网络或在开发者工具中重新部署云函数`;
  }
  return raw;
}

function callCloudFunction(name, data = {}) {
  if (!wx.cloud) {
    return Promise.resolve({ success: false, errMsg: '云开发未初始化' });
  }

  return wx.cloud.callFunction({ name, data })
    .then((res) => {
      if (!res || res.result === undefined) {
        return {
          success: false,
          errMsg: `云函数 ${name} 无返回，请确认已部署到当前环境`
        };
      }
      return res.result;
    })
    .catch((err) => ({
      success: false,
      errMsg: normalizeCloudError(err, name)
    }));
}

module.exports = { callCloudFunction, normalizeCloudError };
