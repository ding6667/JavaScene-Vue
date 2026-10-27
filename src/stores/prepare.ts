/**
 * 备课生成任务（teach 模块）
 *
 * 备课是异步的：POST /api/agent/teach/prepare 秒回收理回执（recordId + status=2 生成中）。
 * 之后先等 3 秒，再每 20 秒查一次 GET /api/teach/prepare/record/status?id=recordId：
 * 状态 2 就接着等（不设次数上限，用户可随时「取消生成」），1 才去 GET record/detail 取五类材料全文，
 * 0 直接进失败流程；查询报错（含「记录不存在 / 非本人记录」业务异常）也按失败收尾。
 *
 * 状态放在 store 而不是页面里：用户切到别的端内页面再回来，等待态和已到手的结果都还在。
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  fetchPrepareRecordDetail,
  fetchPrepareRecordStatus,
  generateTeachPrepare,
} from '@/api/teacher';
import type { PrepareRecordDetail, TeachPrepareRequest } from '@/types/teacher';

export type PrepareStage = 'idle' | 'submitting' | 'waiting' | 'done' | 'failed';

/** 后端记录状态码：2 生成中 / 1 成功 / 0 失败 */
const STATUS_GENERATING = 2;
const STATUS_SUCCESS = 1;

/** 首次查询前等 3 秒，之后每 20 秒一次；状态仍是生成中就一直等，直到成功 / 失败 / 查询报错 / 用户取消 */
const FIRST_DELAY_MS = 3000;
const POLL_INTERVAL_MS = 20000;

export const usePrepareStore = defineStore('prepare', () => {
  const stage = ref<PrepareStage>('idle');
  /** 后端返回的备课记录编号，字符串透传（雪花 ID 超 Number 安全整数上限） */
  const recordId = ref<string | null>(null);
  const detail = ref<PrepareRecordDetail | null>(null);
  const error = ref('');
  const attempts = ref(0);
  /** 本次任务开始等待的时刻，用于算「已等待多少秒」 */
  const startedAt = ref(0);

  let timer: ReturnType<typeof setTimeout> | null = null;
  /** 每次 run/cancel 递增，作废在途请求的回调，避免旧任务改写新状态 */
  let runToken = 0;

  const busy = computed(() => stage.value === 'submitting' || stage.value === 'waiting');
  /** 已等待秒数：以受理时刻为零点；Date.now() 不是响应式的，靠 attempts 每次轮询触发重算 */
  const waitedSeconds = computed(() => {
    if (!startedAt.value) return 0;
    void attempts.value;
    return Math.round((Date.now() - startedAt.value) / 1000);
  });

  function stopTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function clear() {
    stage.value = 'idle';
    recordId.value = null;
    detail.value = null;
    error.value = '';
    attempts.value = 0;
    startedAt.value = 0;
  }

  /** 取消本次等待：只停轮询并清空记录编号，不调用任何后端接口 */
  function cancel() {
    runToken += 1;
    stopTimer();
    clear();
  }

  function fail(message: string) {
    stage.value = 'failed';
    error.value = message;
    stopTimer();
  }

  function schedule(token: number, delay: number) {
    timer = setTimeout(() => void poll(token), delay);
  }

  async function poll(token: number) {
    if (token !== runToken || !recordId.value) return;
    const id = recordId.value;
    attempts.value += 1;
    try {
      const status = await fetchPrepareRecordStatus(id);
      if (token !== runToken) return;

      if (status === STATUS_SUCCESS) {
        const d = await fetchPrepareRecordDetail(id);
        if (token !== runToken) return;
        detail.value = d;
        stage.value = 'done';
        stopTimer();
        return;
      }
      if (status !== STATUS_GENERATING) {
        fail('智能体未能生成材料，可以重新备课，或稍后到「备课记录」页确认');
        return;
      }
      schedule(token, POLL_INTERVAL_MS);
    } catch (e: unknown) {
      if (token !== runToken) return;
      fail((e instanceof Error ? e.message : String(e ?? '')) || '查询备课状态失败');
    }
  }

  /** 提交备课并挂上状态轮询；payload 由页面按后端契约拼好 */
  async function run(payload: TeachPrepareRequest) {
    if (busy.value) return;
    stopTimer();
    runToken += 1;
    const token = runToken;
    clear();
    stage.value = 'submitting';
    try {
      const accepted = await generateTeachPrepare(payload);
      if (token !== runToken) return;
      // 只认基础类型：直接把响应对象 String() 会变成 "[object Object]" 发给后端
      const raw = accepted?.recordId;
      const id = typeof raw === 'number' || typeof raw === 'string' ? String(raw).trim() : '';
      if (!id) {
        fail('后端未返回备课记录编号');
        return;
      }
      recordId.value = id;
      startedAt.value = Date.now();
      stage.value = 'waiting';
      schedule(token, FIRST_DELAY_MS);
    } catch (e: unknown) {
      if (token !== runToken) return;
      fail((e instanceof Error ? e.message : String(e ?? '')) || '备课请求失败');
    }
  }

  return {
    stage,
    recordId,
    detail,
    error,
    attempts,
    busy,
    waitedSeconds,
    run,
    cancel,
    clear,
  };
});
