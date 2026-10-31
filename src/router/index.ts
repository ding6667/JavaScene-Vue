import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

/**
 * 路由表：roles 只写在父路由上，子路由通过 Vue Router 的 meta 合并继承。
 * 子路由若确实需要覆盖（如管理员注册页对所有人开放），显式写 roles: [] 即可。
 */
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true, title: '登录' },
    },
    {
      // 管理员注册是公开页：独立于运维端布局，未登录访问时不会带出内部导航
      path: '/admin/register',
      name: 'AdminRegister',
      component: () => import('@/views/admin/AdminRegisterView.vue'),
      meta: { public: true, title: '管理员注册' },
    },
    {
      // 一个账号挂了多个角色时，登录后先在这里选进哪个端
      path: '/choose-portal',
      name: 'ChoosePortal',
      component: () => import('@/views/PortalSelectView.vue'),
      meta: { title: '选择进入的端口' },
    },
    {
      path: '/403',
      name: 'Forbidden',
      component: () => import('@/views/error/ForbiddenView.vue'),
      meta: { public: true, title: '无权限' },
    },
    {
      path: '/',
      component: () => import('@/views/LayoutView.vue'),
      meta: { roles: ['TEACHER'], portal: 'teacher' },
      children: [
        {
          path: '',
          redirect: '/teach/prepare',
        },
        // ==================== 智能教学（教师端新功能） ====================
        {
          path: 'teach/prepare',
          name: 'TeachPrepare',
          component: () => import('@/views/teacher/PrepareView.vue'),
        },
        {
          path: 'teach/homework',
          name: 'TeachHomework',
          component: () => import('@/views/teacher/HomeworkPublishView.vue'),
        },
        {
          path: 'teach/ppt',
          name: 'TeachPptTemplate',
          component: () => import('@/views/teacher/PptTemplateView.vue'),
        },
        {
          path: 'teach/records',
          name: 'TeachPrepareRecords',
          component: () => import('@/views/teacher/PrepareRecordView.vue'),
        },
        {
          path: 'teach/learning',
          name: 'TeachLearning',
          component: () => import('@/views/teacher/ClassLearningView.vue'),
        },
        {
          path: 'teach/intervention',
          name: 'TeachIntervention',
          component: () => import('@/views/teacher/InterventionView.vue'),
        },
        {
          path: 'teach/resources',
          name: 'TeachResources',
          component: () => import('@/views/teacher/ResourceView.vue'),
        },
        {
          path: 'teach/questions',
          name: 'TeachQuestions',
          component: () => import('@/views/teacher/QuestionBankView.vue'),
        },
        {
          // 名册接口是 TEACHER/ADMIN 权限，与运维端复用同一个视图
          path: 'teach/students',
          name: 'TeachStudents',
          component: () => import('@/views/common/StudentRosterView.vue'),
        },
        {
          path: 'account',
          name: 'Account',
          component: () => import('@/views/AccountView.vue'),
        },
        {
          path: 'settings',
          name: 'Settings',
          component: () => import('@/views/SettingsView.vue'),
        },
      ],
    },
    // ==================== 学生端 ====================
    {
      path: '/student',
      component: () => import('@/views/student/StudentLayout.vue'),
      meta: { roles: ['STUDENT'], portal: 'student' },
      children: [
        {
          path: '',
          redirect: '/student/dashboard',
        },
        {
          path: 'dashboard',
          name: 'StudentDashboard',
          component: () => import('@/views/student/StudentDashboardView.vue'),
        },
        {
          path: 'learn',
          name: 'StudentChapters',
          component: () => import('@/views/student/ChapterListView.vue'),
        },
        {
          path: 'learn/:chapterId',
          name: 'StudentChapterDetail',
          component: () => import('@/views/student/ChapterDetailView.vue'),
          props: true,
        },
        {
          path: 'qa',
          name: 'StudentQa',
          component: () => import('@/views/student/QaView.vue'),
        },
        {
          // 智能纠错独立页保留（作答页内已内联同一能力，这里作为独立入口）
          path: 'code/debug',
          name: 'StudentCodeDebug',
          component: () => import('@/views/student/CodeDebugView.vue'),
        },
        {
          // 注意：作答页（新标签页打开）不在这棵树下，见下方「独立页」路由。
          path: 'practice/:chapterId?',
          name: 'StudentPractice',
          component: () => import('@/views/student/PracticeView.vue'),
          props: true,
        },
        {
          path: 'wrong',
          name: 'StudentWrongBook',
          component: () => import('@/views/student/WrongBookView.vue'),
        },
        {
          path: 'homework',
          name: 'StudentHomework',
          component: () => import('@/views/student/HomeworkView.vue'),
        },
        {
          path: 'records',
          name: 'StudentCodeRecords',
          component: () => import('@/views/student/CodeRecordView.vue'),
        },
        {
          path: 'report',
          name: 'StudentReport',
          component: () => import('@/views/student/ReportView.vue'),
        },
        {
          path: 'account',
          name: 'StudentAccount',
          component: () => import('@/views/AccountView.vue'),
        },
      ],
    },
    // ==================== 独立页（新标签页打开 · 无侧边栏）====================
    /**
     * 模板：凡是用 window.open / target="_blank" 打开的页面都挂到这一类路由上。
     *   - 父路由组件 = StandaloneLayout（空画布：无侧边栏、无导航，统一留白与滚动）
     *   - 完整路径写在父路由上，子路由 path 留空，name / props 照旧
     *   - 这类页面不要再塞进 /student、/admin 的树里，否则会带出侧边栏
     * 新开页面时复制下面这段、换 path 与 component 即可。
     */
    {
      path: '/student/practice/solve/:questionId',
      component: () => import('@/views/StandaloneLayout.vue'),
      meta: { roles: ['STUDENT'], portal: 'student', standalone: true, assistant: true, title: '题目作答' },
      children: [
        {
          path: '',
          name: 'StudentPracticeSolve',
          component: () => import('@/views/student/PracticeSolveView.vue'),
          props: true,
        },
      ],
    },
    {
      path: '/student/homework/solve/:homeworkId',
      component: () => import('@/views/StandaloneLayout.vue'),
      meta: { roles: ['STUDENT'], portal: 'student', standalone: true, assistant: true, title: '作业作答' },
      children: [
        {
          path: '',
          name: 'StudentHomeworkSolve',
          component: () => import('@/views/student/HomeworkSolveView.vue'),
          props: true,
        },
      ],
    },
    // ==================== 运维端 ====================
    {
      path: '/admin',
      component: () => import('@/views/admin/AdminLayout.vue'),
      meta: { roles: ['ADMIN'], portal: 'admin' },
      children: [
        {
          path: '',
          redirect: '/admin/dashboard',
        },
        {
          path: 'dashboard',
          name: 'AdminDashboard',
          component: () => import('@/views/admin/AdminDashboardView.vue'),
        },
        {
          path: 'users',
          name: 'AdminUsers',
          component: () => import('@/views/admin/UserManageView.vue'),
        },
        {
          path: 'classes',
          name: 'AdminClasses',
          component: () => import('@/views/admin/ClassManageView.vue'),
        },
        {
          path: 'students',
          name: 'AdminStudents',
          component: () => import('@/views/common/StudentRosterView.vue'),
        },
        {
          path: 'knowledge',
          name: 'AdminKnowledge',
          component: () => import('@/views/admin/KnowledgeManageView.vue'),
        },
        {
          path: 'weights',
          name: 'AdminWeights',
          component: () => import('@/views/admin/WeightConfigView.vue'),
        },
        {
          path: 'dataset',
          name: 'AdminDatasetUpload',
          component: () => import('@/views/admin/DatasetUploadView.vue'),
        },
        {
          path: 'logs',
          name: 'AdminLogs',
          component: () => import('@/views/admin/LogAuditView.vue'),
        },
        {
          path: 'backup',
          name: 'AdminBackup',
          component: () => import('@/views/admin/BackupView.vue'),
        },
        {
          path: 'settings',
          name: 'AdminSettings',
          component: () => import('@/views/admin/SystemSettingsView.vue'),
        },
      ],
    },
    // 未知路径统一并入 403，不给探测路由留口子
    { path: '/:pathMatch(.*)*', redirect: '/403' },
  ],
});

/**
 * 全局守卫：公开页放行 → 未登录/过期回登录 → 角色不足跳 403（不惩罚，保留登录态）
 */
router.beforeEach((to) => {
  const auth = useAuthStore();

  if (to.meta.public) {
    // 已登录还去登录页：直接送回该去的地方，多角色则进选端页
    if (to.path === '/login' && auth.isAuthenticated) {
      return auth.hasMultipleRoles ? { name: 'ChoosePortal' } : auth.resolveHome();
    }
    return true;
  }

  if (!auth.isAuthenticated) {
    // 只清本地：token 已过期，后端本来就当它不存在，没有可拉黑的东西
    auth.clearAuth();
    return { path: '/login', query: { redirect: to.fullPath } };
  }

  // 单角色账号不需要选端，直接回自己的首页；解不出角色时留在选端页兜底
  if (to.name === 'ChoosePortal' && auth.roles.length === 1) {
    return auth.resolveHome();
  }

  const required = (to.meta.roles as string[] | undefined) ?? [];
  // 角色集合为空时（JWT 无声明且档案接口未实现）不在前端下结论，交给后端 401/403 判定
  if (required.length && auth.roles.length && !required.some((r) => auth.roles.includes(r as never))) {
    return { path: '/403', query: { from: to.fullPath } };
  }

  return true;
});

router.afterEach((to) => {
  const title = to.meta.title as string | undefined;
  document.title = title ? `${title} - 智能教学系统` : '智能教学系统';
});

export default router;
