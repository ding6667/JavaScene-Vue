import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('@/views/LayoutView.vue'),
      children: [
        {
          path: '',
          name: 'Home',
          component: () => import('@/views/HomeView.vue'),
        },
        {
          path: 'results',
          name: 'Results',
          component: () => import('@/views/ResultsView.vue'),
        },
        {
          path: 'upload-files',
          name: 'UploadFiles',
          component: () => import('@/views/UploadFilesView.vue'),
        },
        {
          path: 'classes',
          name: 'ClassManagement',
          component: () => import('@/views/ClassManagementView.vue'),
        },
        {
          path: 'history',
          name: 'History',
          component: () => import('@/views/HistoryView.vue'),
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
          path: 'teach/grading',
          name: 'TeachGrading',
          component: () => import('@/views/teacher/GradingReviewView.vue'),
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
          path: 'settings',
          name: 'Settings',
          component: () => import('@/views/SettingsView.vue'),
        },
      ],
    },
    // ==================== 学生端（独立前缀 /student，阶段内免登录） ====================
    {
      path: '/student',
      component: () => import('@/views/student/StudentLayout.vue'),
      meta: { public: true, portal: 'student' },
      children: [
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
          path: 'code',
          name: 'StudentCodeLab',
          component: () => import('@/views/student/CodeLabView.vue'),
        },
        {
          path: 'code/debug',
          name: 'StudentCodeDebug',
          component: () => import('@/views/student/CodeDebugView.vue'),
        },
        {
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
      ],
    },
    // ==================== 运维端（独立前缀 /admin，免登录调试） ====================
    {
      path: '/admin',
      component: () => import('@/views/admin/AdminLayout.vue'),
      meta: { public: true, portal: 'admin' },
      children: [
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
          path: 'register',
          name: 'AdminRegister',
          component: () => import('@/views/admin/AdminRegisterView.vue'),
          meta: { public: true },
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
  ],
});

// 路由守卫：未登录时跳转到登录页
router.beforeEach((to) => {
  const authStore = useAuthStore();
  if (!to.meta.public && !authStore.isAuthenticated) {
    return { name: 'Login', query: { redirect: to.fullPath } };
  }
  if (to.name === 'Login' && authStore.isAuthenticated) {
    return { name: 'Home' };
  }
  return true;
});

export default router;
