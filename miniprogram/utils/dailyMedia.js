const { isRemotePhoto } = require('./storePhotos');

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

function uploadToCloud(localPath, cloudPath) {
  if (!localPath) return Promise.resolve('');
  if (isRemotePhoto(localPath)) return Promise.resolve(localPath);
  if (!wx.cloud) {
    return Promise.reject(new Error('云开发未初始化'));
  }
  return wx.cloud.uploadFile({
    cloudPath,
    filePath: localPath
  }).then((res) => res.fileID)
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

  return Promise.all(list.map((image, index) => compressImage(image)
    .then((compressed) => {
      const ext = (compressed.split('.').pop() || 'jpg').split('?')[0];
      const cloudPath = `${folder}/img_${Date.now()}_${index}.${ext}`;
      return uploadToCloud(compressed, cloudPath);
    })));
}

function uploadDailyVideo(videoPath, storeId, orderId) {
  if (!videoPath) return Promise.resolve('');
  const folder = buildFolder(storeId, orderId);
  const ext = (videoPath.split('.').pop() || 'mp4').split('?')[0];
  const cloudPath = `${folder}/video_${Date.now()}.${ext}`;
  return uploadToCloud(videoPath, cloudPath);
}

function uploadDailyMedia(images, video, storeId, orderId) {
  return uploadDailyImages(images, storeId, orderId)
    .then((uploadedImages) => {
      const cloudImages = uploadedImages.filter((item) => item && item.startsWith('cloud://'));
      if ((images || []).filter(Boolean).length && !cloudImages.length) {
        return Promise.reject(new Error('图片上传失败，请检查网络后重试'));
      }
      return uploadDailyVideo(video, storeId, orderId).then((uploadedVideo) => {
        if (video && uploadedVideo && !uploadedVideo.startsWith('cloud://')) {
          return Promise.reject(new Error('视频上传失败，请检查网络后重试'));
        }
        return {
          images: cloudImages,
          video: uploadedVideo && uploadedVideo.startsWith('cloud://') ? uploadedVideo : ''
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
