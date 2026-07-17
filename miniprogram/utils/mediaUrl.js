const videoUrlCache = new Map();
const VIDEO_URL_TTL = 90 * 60 * 1000;

function isCloudFileId(url) {
  return typeof url === 'string' && url.startsWith('cloud://');
}

function resolveVideoUrl(source) {
  const fileID = (source || '').trim();
  if (!fileID) return Promise.resolve('');
  // HTTPS / 已解析地址直接返回；cloud:// 历史数据无法在自建后端解析
  if (!isCloudFileId(fileID)) return Promise.resolve(fileID);

  const cached = videoUrlCache.get(fileID);
  if (cached && cached.expireAt > Date.now()) {
    return Promise.resolve(cached.url);
  }

  console.warn('[mediaUrl] 仍为 cloud:// 地址，请迁移到 OSS', fileID);
  return Promise.resolve(fileID);
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
      return { ...log, videoUrl: log.videoUrl || '' };
    }
    if (log.videoUrl) {
      return { ...log };
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
