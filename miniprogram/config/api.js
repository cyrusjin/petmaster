/**
 * 自建后端配置（阿里云轻量服务器 API）
 *
 * - request / uploadFile / downloadFile 合法域名均配：https://api.petmaster.me
 * - 媒体公开地址：https://api.petmaster.me/media/...
 * - 宠主端 client=user；商家端独立小程序 client=merchant
 */
const API_BASE_URL = 'https://api.petmaster.me';
const API_CLIENT = 'user';

module.exports = { API_BASE_URL, API_CLIENT };
