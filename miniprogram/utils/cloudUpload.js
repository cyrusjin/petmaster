const { isRemotePhoto } = require('./storePhotos');

function uploadLocalImage(localPath, cloudFolder) {
  if (!localPath || isRemotePhoto(localPath)) {
    return Promise.resolve(localPath || '');
  }
  if (!wx.cloud) {
    return Promise.reject(new Error('云开发未初始化'));
  }
  const ext = (localPath.split('.').pop() || 'jpg').split('?')[0];
  const suffix = Math.random().toString(36).slice(2, 8);
  return wx.cloud.uploadFile({
    cloudPath: `${cloudFolder}/${Date.now()}_${suffix}.${ext}`,
    filePath: localPath
  }).then((res) => res.fileID);
}

module.exports = {
  uploadLocalImage
};
