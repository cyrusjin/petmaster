const { isCloudFileId } = require('./imageCache');

const videoUrlCache = new Map();
const VIDEO_URL_TTL = 90 * 60 * 1000;

function resolveVideoUrl(source) {
  const fileID = (source || '').trim();
  if (!fileID) return Promise.resolve('');
  if (!isCloudFileId(fileID)) return Promise.resolve(fileID);

  const cached = videoUrlCache.get(fileID);
  if (cached && cached.expireAt > Date.now()) {
    return Promise.resolve(cached.url);
  }

  if (!wx.cloud) {
    return Promise.resolve(fileID);
  }

  return wx.cloud.getTempFileURL({ fileList: [fileID] })
    .then((res) => {
      const item = res.fileList && res.fileList[0];
      if (!item || item.status !== 0 || !item.tempFileURL) {
        return fileID;
      }
      videoUrlCache.set(fileID, {
        url: item.tempFileURL,
        expireAt: Date.now() + VIDEO_URL_TTL
      });
      return item.tempFileURL;
    })
    .catch((err) => {
      console.error('[mediaUrl] 视频地址解析失败', fileID, err);
      return fileID;
    });
}

function resolveVideoUrls(sources) {
  const list = (sources || []).filter(Boolean);
  if (!list.length) return Promise.resolve([]);
  return Promise.all(list.map((item) => resolveVideoUrl(item)));
}

function enrichLogsWithVideoUrls(logs) {
  const list = logs || [];
  if (!list.length) return Promise.resolve([]);

  return Promise.all(list.map((log) => {
    if (!log.video) {
      return { ...log, videoUrl: '' };
    }
    return resolveVideoUrl(log.video).then((videoUrl) => ({
      ...log,
      videoUrl: videoUrl || log.video
    }));
  }));
}

module.exports = {
  resolveVideoUrl,
  resolveVideoUrls,
  enrichLogsWithVideoUrls
};
