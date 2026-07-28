function isAuthorizedNickName(nickName) {
  const nick = (nickName || '').trim();
  return !!nick && nick !== '微信用户';
}

function getDisplayNickName(user, fallback = '小主') {
  const nick = user && user.nickName;
  return isAuthorizedNickName(nick) ? nick.trim() : fallback;
}

function hasUserAuthProfile(user) {
  const u = user || {};
  return isAuthorizedNickName(u.nickName) && !!(u.phone || '').trim();
}

module.exports = {
  isAuthorizedNickName,
  getDisplayNickName,
  hasUserAuthProfile
};
