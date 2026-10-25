import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAuthStore } from '@/stores/auth';

/** 后端 500（Redis 挂 = 吊销没生效）时的文案：用户能登出，但旧 token 到 exp 前还有效 */
const SERVER_LAG_TIP = '退出成功（服务端可能有延迟，请勿在公共设备上登录）';

/**
 * 三端侧边栏 / 403 页 / 选端页共用的登出：
 * 无论后端成败都必须清本地并回到登录页，这是「用户永远能登出」的契约；
 * 差别只在后端失败时要给出提示。
 */
export function useLogout() {
  const auth = useAuthStore();
  const router = useRouter();
  const loggingOut = ref(false);

  async function run(allDevices: boolean) {
    if (loggingOut.value) return;
    loggingOut.value = true;
    const result = await auth.signOut({ allDevices });
    loggingOut.value = false;
    if (result === 'server-failed') ElMessage.warning(SERVER_LAG_TIP);
    else ElMessage.success('已退出登录');
    await router.replace('/login');
  }

  /** 只退出当前设备 */
  function logout() {
    return run(false);
  }

  /** 吊销该账号全部会话（后端 allDevices） */
  async function logoutAllDevices() {
    try {
      await ElMessageBox.confirm('将退出该账号在所有设备上的登录，是否继续？', '退出所有设备', {
        type: 'warning',
        confirmButtonText: '全部退出',
        cancelButtonText: '取消',
      });
    } catch {
      return;
    }
    await run(true);
  }

  return { loggingOut, logout, logoutAllDevices };
}
