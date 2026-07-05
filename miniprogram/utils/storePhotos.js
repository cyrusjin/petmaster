const MAX_STORE_PHOTOS = 6;

function isCloudFileId(url) {
  return typeof url === 'string' && url.startsWith('cloud://');
}

function isLocalTempPath(url) {
  if (!url || typeof url !== 'string') return false;
  const text = url.trim();
  return text.startsWith('wxfile://')
    || text.startsWith('http://tmp/')
    || text.startsWith('http://usr/')
    || (text.startsWith('/') && !text.startsWith('//'));
}

function isRemotePhoto(url) {
  if (!url || typeof url !== 'string') return false;
  if (isLocalTempPath(url)) return false;
  return url.startsWith('cloud://') || url.startsWith('https://') || url.startsWith('http://');
}

function normalizeStorePhotos(photos) {
  if (!Array.isArray(photos)) return [];
  return photos
    .filter((item) => typeof item === 'string' && item)
    .filter((item) => isCloudFileId(item) || isLocalTempPath(item) || isRemotePhoto(item))
    .slice(0, MAX_STORE_PHOTOS);
}

function uploadStorePhotos(photos, fallbackPhotos) {
  const list = normalizeStorePhotos(photos);
  if (!list.length) return Promise.resolve([]);
  if (!wx.cloud) {
    return Promise.reject(new Error('云开发未初始化，无法上传图片'));
  }

  const fallback = normalizeStorePhotos(fallbackPhotos || []);

  const tasks = list.map((photo, index) => {
    if (isCloudFileId(photo)) return Promise.resolve(photo);

    if (isLocalTempPath(photo)) {
      const ext = (photo.split('.').pop() || 'jpg').split('?')[0];
      return wx.cloud.uploadFile({
        cloudPath: `store-photos/${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}.${ext}`,
        filePath: photo
      }).then((res) => {
        const fileID = res && res.fileID;
        if (!isCloudFileId(fileID)) {
          return Promise.reject(new Error('图片上传失败'));
        }
        return fileID;
      });
    }

    const fallbackPhoto = fallback[index];
    if (isCloudFileId(fallbackPhoto)) return Promise.resolve(fallbackPhoto);

    return Promise.reject(new Error('部分图片未上传成功，请重试'));
  });

  return Promise.all(tasks).then((uploaded) => {
    if (!uploaded.every(isCloudFileId)) {
      return Promise.reject(new Error('部分图片未上传成功，请重试'));
    }
    return uploaded;
  });
}

function uploadStoreLogo(logo, fallbackLogo) {
  if (!logo) return Promise.resolve(logo || '');
  if (isCloudFileId(logo)) return Promise.resolve(logo);
  if (isLocalTempPath(logo)) {
    if (!wx.cloud) {
      return Promise.reject(new Error('云开发未初始化，无法上传图片'));
    }
    const ext = (logo.split('.').pop() || 'png').split('?')[0];
    return wx.cloud.uploadFile({
      cloudPath: `store-logos/${Date.now()}.${ext}`,
      filePath: logo
    }).then((res) => {
      const fileID = res && res.fileID;
      if (!isCloudFileId(fileID)) {
        return Promise.reject(new Error('店铺头像上传失败，请重试'));
      }
      return fileID;
    });
  }
  if (isCloudFileId(fallbackLogo)) return Promise.resolve(fallbackLogo);
  return Promise.resolve(logo);
}

module.exports = {
  MAX_STORE_PHOTOS,
  isCloudFileId,
  isLocalTempPath,
  isRemotePhoto,
  normalizeStorePhotos,
  uploadStorePhotos,
  uploadStoreLogo
};
