import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { ElMessage } from 'element-plus';

// ==================== 配置 axios 实例 ====================
// ⚠️ 在此处填写后端 API 的 baseURL
const API_BASE_URL = 'http://localhost:8080/dify/api';

const axiosInstance: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ==================== 请求拦截器 ====================
axiosInstance.interceptors.request.use(
  (config) => {
    // ⚠️ 如需 token 注入，在此处添加
    // const token = localStorage.getItem('token');
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// ==================== 响应拦截器 ====================
axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  (error: AxiosError) => {
    const status = error.response?.status;
    let message = '网络错误，请稍后重试';

    if (status === 401) {
      message = '未授权，请重新登录';
    } else if (status === 403) {
      message = '拒绝访问';
    } else if (status === 404) {
      message = '请求的资源不存在';
    } else if (status === 500) {
      message = '服务器内部错误';
    } else if (error.code === 'ECONNABORTED') {
      message = '请求超时';
    }

    ElMessage.error(message);
    return Promise.reject(error);
  }
);

export default axiosInstance;
