import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { ElMessage } from 'element-plus';
import { logout as revokeToken } from '@/api/auth';
import { clearSessionStorage } from '@/utils/session';

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

// ==================== 会话失效与越权的统一处理 ====================
// 清除本地会话后用 window.location 全页跳转：既避免与 router 形成循环依赖，
// 也能让 Pinia 状态整体重置。

/** 后端把「服务端主动踢下线」（改密码/封号/吊销）体现在 401 文案里，据此区分自然过期与被踢 */
const KICKED_RE = /踢|下线|状态变更|停用|封号|kicked/i;

/** 登出接口自身的 401/403 不能再触发下线流程，否则「403 → 调登出 → 又 403」无限递归 */
function isLogoutRequest(config?: { url?: string }): boolean {
  return !!config?.url?.includes('/auth/logout');
}

function redirectToLogin(reason: 'expired' | 'forbidden' | 'kicked') {
  // 已经在登录页了（密码错误等 401）只弹提示，不跳转：重载会清空用户刚输入的表单
  if (window.location.pathname === '/login') return;
  const redirect = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/login?reason=${reason}&redirect=${redirect}`;
}

/**
 * 401：token 缺失 / 过期 / 签名无效 / 已被吊销。
 * token 本来就废了，没有可拉黑的东西，直接清本地；延迟 1.2s 让用户看清提示。
 */
function handleTokenExpired(message: string) {
  ElMessage.error(message);
  const reason = KICKED_RE.test(message) ? 'kicked' : 'expired';
  clearSessionStorage();
  setTimeout(() => redirectToLogin(reason), 1200);
}

/**
 * 403：策略 A —— 越权访问按明确的安全事件处理，强制下线。
 * 常规误操作（学生手输 /teach/xxx）已被路由守卫拦在发出请求之前，
 * 能走到这里说明守卫被绕过（手改请求 / 直接构造 URL 打接口）。
 * ★ 必须让后端把当前 token 拉黑：只清本地的话，被人抄走的 token 到 exp 前照样能用。
 *   吊销请求要带上原 token 才能定位 jti，所以清本地放在延迟里，也不等吊销结果。
 */
let revoking = false;

function handleForbidden(message: string) {
  ElMessage.error(message || '没有权限访问该资源，已退出登录');
  // 一个页面常常并发多个请求同时返 403，拉黑一次就够
  if (!revoking) {
    revoking = true;
    void revokeToken({ allDevices: false }).catch(() => {});
  }
  setTimeout(() => {
    clearSessionStorage();
    redirectToLogin('forbidden');
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
          // 登出接口自己失败：交给 stores/auth.signOut() 收尾，这里不重复下线
          if (isLogoutRequest(config)) {
            return Promise.reject(new Error(message));
          }
          if (code === 401) {
            handleTokenExpired(message);
            return Promise.reject(new Error(message));
          }
          if (code === 403) {
            handleForbidden(message);
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

      // 登出接口自己的 401/403 不触发下线流程（token 已废，无需再拉黑），由 signOut() 收尾
      if (isLogoutRequest(config)) {
        return Promise.reject(error);
      }

      // token 过期（HTTP 401 或业务 code=401）
      if (error.response?.status === 401 || backendCode === 401) {
        const message = backendMessage || '登录失效，请重新登录';
        handleTokenExpired(message);
        return Promise.reject(error);
      }

      // 越权（HTTP 403 或业务 code=403）→ 策略 A：强制下线
      if (error.response?.status === 403 || backendCode === 403) {
        handleForbidden(backendMessage || '没有权限访问该资源，已退出登录');
        return Promise.reject(error);
      }

      // 其他 HTTP 错误优先使用后端返回的 message
      const message = backendMessage || '网络错误，请稍后重试';
      ElMessage.error(message);
      return Promise.reject(error);
    }
);

export default axiosInstance;
