const { isRemotePhoto } = require('./storePhotos');
const { uploadFileToOss } = require('./cloudUpload');

function compressImage(filePath) {
  if (!filePath || isRemotePhoto(filePath)) {
    return Promise.resolve(filePath || '');
  }
  return new Promise((resolve) => {
    wx.compressImage({
      src: filePath,
      quality: 80,
      compressedWidth: 1280,
      success: (res) => resolve(res.tempFilePath || filePath),
      fail: () => resolve(filePath)
    });
  });
}

function uploadToCloud(localPath, folder) {
  if (!localPath) return Promise.resolve('');
  if (isRemotePhoto(localPath)) return Promise.resolve(localPath);
  const ext = (localPath.split('.').pop() || 'jpg').split('?')[0];
  return uploadFileToOss(localPath, folder, ext)
    .catch((err) => {
      const msg = (err && (err.errMsg || err.message)) || '文件上传失败';
      return Promise.reject(new Error(msg));
    });
}

function buildFolder(storeId, orderId) {
  const store = (storeId || 'store').replace(/[^\w-]/g, '_');
  const order = (orderId || 'common').replace(/[^\w-]/g, '_');
  return `daily/${store}/${order}`;
}

function uploadDailyImages(images, storeId, orderId) {
  const folder = buildFolder(storeId, orderId);
  const list = (images || []).filter(Boolean);
  if (!list.length) return Promise.resolve([]);

  return Promise.all(list.map((image) => compressImage(image)
    .then((compressed) => uploadToCloud(compressed, folder))));
}

function uploadDailyVideo(videoPath, storeId, orderId) {
  if (!videoPath) return Promise.resolve('');
  const folder = buildFolder(storeId, orderId);
  return uploadToCloud(videoPath, folder);
}

function isUploadedUrl(url) {
  return typeof url === 'string' && (
    url.startsWith('https://')
    || url.startsWith('http://')
    || url.startsWith('cloud://')
  );
}

function uploadDailyMedia(images, video, storeId, orderId) {
  return uploadDailyImages(images, storeId, orderId)
    .then((uploadedImages) => {
      const cloudImages = uploadedImages.filter((item) => isUploadedUrl(item));
      if ((images || []).filter(Boolean).length && !cloudImages.length) {
        return Promise.reject(new Error('图片上传失败，请检查网络后重试'));
      }
      return uploadDailyVideo(video, storeId, orderId).then((uploadedVideo) => {
        if (video && uploadedVideo && !isUploadedUrl(uploadedVideo)) {
          return Promise.reject(new Error('视频上传失败，请检查网络后重试'));
        }
        return {
          images: cloudImages,
          video: uploadedVideo && isUploadedUrl(uploadedVideo) ? uploadedVideo : ''
        };
      });
    });
}

module.exports = {
  compressImage,
  uploadDailyImages,
  uploadDailyVideo,
  uploadDailyMedia
};
