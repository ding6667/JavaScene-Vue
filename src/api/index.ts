import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { ElMessage } from 'element-plus';

// ==================== 配置 axios 实例 ====================
// 开发环境通过 Vite 代理转发 /api 到后端（见 vite.config.js），无需跨域
// 生产环境可通过 VITE_API_BASE_URL 环境变量覆盖
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

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
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// ==================== 401 统一处理 ====================
// 清除 localStorage 后用 window.location 全页跳转，最可靠
// 全页刷新会自动重置 Pinia 状态，路由守卫读到 localStorage 为空 → 放行
function handleTokenExpired(message: string) {
  ElMessage.error(message);
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_username');
  // 延迟 1.2s 让用户看到提示后再跳转
  setTimeout(() => {
    window.location.href = '/login';
  }, 1200);
}

// ==================== 响应拦截器改造 ====================
// 统一处理业务错误，支持普通 JSON 接口和 Blob 下载接口
axiosInstance.interceptors.response.use(
    async (response) => {
      const config = response.config;
      const data = response.data;

      // ========== 处理 Blob 响应（下载接口） ==========
      if (config.responseType === 'blob' && data instanceof Blob) {
        try {
          // 读取 Blob 内容（只读前 1KB 足够判断是否为 JSON 错误）
          const text = await data.slice(0, 1024).text();
          // 尝试解析 JSON
          const json = JSON.parse(text);
          // 如果是包含 code 的业务错误结构
          if (json && typeof json === 'object' && 'code' in json) {
            const code = Number(json.code);
            if (code !== 0 && code !== 200) {
              const message = json.message || '请求失败';
              // token 过期特殊处理
              if (code === 401) {
                handleTokenExpired(message);
              } else {
                ElMessage.error(message);
              }
              // 抛出错误让调用方 catch 捕获
              return Promise.reject(new Error(message));
            }
            // 如果 code=0 但却是 Blob，说明后端返回的是 JSON 但错误，直接返回原 Blob（但不会发生）
          }
          // 解析失败或不是 JSON，说明是真正的文件流，正常返回
          return response.data;
        } catch {
          // 无法解析为 JSON，说明是真正的二进制文件流
          return response.data;
        }
      }

      // ========== 处理普通 JSON 响应 ==========
      if (data && typeof data === 'object' && 'code' in data) {
        const code = Number((data as Record<string, unknown>).code);
        if (code !== 0 && code !== 200) {
          const message = (data as Record<string, unknown>).message as string || '请求失败';
          if (code === 401) {
            handleTokenExpired(message);
            return Promise.reject(new Error(message));
          }
          ElMessage.error(message);
          return Promise.reject(new Error(message));
        }
      }
      return response.data;
    },


    (error: AxiosError) => {
      const config = error.config;

      // ========== 场景 1：下载接口（responseType: blob）发生 HTTP 错误 ==========
      if (config?.responseType === 'blob' && error.response?.data instanceof Blob) {
        // 异步读取 Blob 中的内容（可能是 JSON 错误信息，也可能是 HTML 错误页）
        return error.response.data.text()
            .then(text => {
              let message = '';
              try {
                // 尝试解析为 JSON（后端可能返回 { code: 403, message: "权限不足" }）
                const json = JSON.parse(text);
                message = json?.message || `下载失败（HTTP ${error.response?.status}）`;
              } catch {
                // 解析失败（比如返回的是 HTML 错误页），直接用状态码提示
                const status = error.response?.status;
                if (status === 403) message = '没有权限下载该文件';
                else if (status === 404) message = '文件不存在或已被删除';
                else if (status === 500) message = '服务器内部错误，请稍后重试';
                else message = `下载失败（HTTP ${status}）`;
        }
        ElMessage.error(message);
        return Promise.reject(new Error(message));
      })
      .catch(() => {
        // 极端情况：连 text() 都读不了（极少发生）
        ElMessage.error('下载失败，请稍后重试');
        return Promise.reject(error);
      });
      }

      const responseData = error.response?.data as Record<string, unknown> | undefined;
      const backendMessage = responseData?.message as string | undefined;
      const backendCode = Number(responseData?.code);

      // token 过期（HTTP 401 或业务 code=401）
      if (error.response?.status === 401 || backendCode === 401) {
        const message = backendMessage || '登录失效，请重新登录';
        handleTokenExpired(message);
        return Promise.reject(error);
      }

      // 其他 HTTP 错误优先使用后端返回的 message
      const message = backendMessage || '网络错误，请稍后重试';
      ElMessage.error(message);
      return Promise.reject(error);
    }
);

export default axiosInstance;
