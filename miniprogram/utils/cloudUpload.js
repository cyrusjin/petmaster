const { isRemotePhoto } = require('./storePhotos');
const { requestUploadSign } = require('./cloudCall');

function uploadLocalImage(localPath, cloudFolder) {
  if (!localPath || isRemotePhoto(localPath)) {
    return Promise.resolve(localPath || '');
  }
  const ext = (localPath.split('.').pop() || 'jpg').split('?')[0];
  return uploadFileToOss(localPath, cloudFolder || 'uploads', ext);
}

function uploadFileToOss(filePath, folder, ext) {
  return requestUploadSign(folder, ext).then((res) => {
    if (!res.success || !res.upload) {
      return Promise.reject(new Error((res && res.errMsg) || '获取上传签名失败'));
    }
    const form = res.upload;
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: form.host,
        filePath,
        name: 'file',
        formData: {
          key: form.key,
          policy: form.policy,
          OSSAccessKeyId: form.OSSAccessKeyId,
          signature: form.signature,
          success_action_status: form.success_action_status || '200'
        },
        success: (uploadRes) => {
          const status = uploadRes.statusCode || 0;
          if (status >= 200 && status < 300) {
            resolve(form.publicUrl);
            return;
          }
          reject(new Error(`上传失败 HTTP ${status}`));
        },
        fail: (err) => {
          reject(new Error((err && (err.errMsg || err.message)) || '文件上传失败'));
        }
      });
    });
  });
}

module.exports = {
  uploadLocalImage,
  uploadFileToOss
};
