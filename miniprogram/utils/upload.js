const { isRemotePhoto, isLocalTempPath } = require('./mediaPath');
const { requestUploadSign, getToken } = require('./api');

const UPLOAD_TIMEOUT_MS = 60000;

function uploadLocalImage(localPath, folder) {
  if (!localPath) {
    return Promise.resolve('');
  }
  if (isRemotePhoto(localPath)) {
    return Promise.resolve(localPath);
  }
  if (!isLocalTempPath(localPath)) {
    return Promise.reject(new Error('图片无效，请重新选择'));
  }
  const ext = (localPath.split('.').pop() || 'jpg').split('?')[0];
  return uploadFileToServer(localPath, folder || 'uploads', ext);
}

function uploadFileWithTimeout(options, timeoutMs = UPLOAD_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('图片上传超时，请检查网络后重试'));
    }, timeoutMs);

    wx.uploadFile({
      ...options,
      timeout: timeoutMs,
      success: (res) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(res);
      },
      fail: (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

function uploadFileToServer(filePath, folder, ext) {
  return requestUploadSign(folder, ext).then((res) => {
    if (!res.success || !res.upload) {
      return Promise.reject(new Error((res && res.errMsg) || '获取上传签名失败'));
    }
    const form = res.upload;
    const token = getToken();
    return uploadFileWithTimeout({
      url: form.host,
      filePath,
      name: 'file',
      header: token ? { Authorization: `Bearer ${token}` } : {},
      formData: {
        key: form.key
      }
    }).then((uploadRes) => {
      const status = uploadRes.statusCode || 0;
      if (status >= 200 && status < 300) {
        return form.publicUrl;
      }
      let detail = '';
      try {
        const body = typeof uploadRes.data === 'string' ? JSON.parse(uploadRes.data) : uploadRes.data;
        detail = (body && body.errMsg) || '';
      } catch (e) {
        detail = '';
      }
      throw new Error(detail || `上传失败 HTTP ${status}`);
    }).catch((err) => {
      throw new Error((err && err.message) || '文件上传失败');
    });
  });
}

module.exports = {
  uploadLocalImage,
  uploadFileToServer
};
