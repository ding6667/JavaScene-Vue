import { createRouter, createWebHistory } from 'vue-router';
import LayoutView from '@/views/LayoutView.vue';
import HomeView from '@/views/HomeView.vue';

const routes = [
  {
    path: '/',
    component: LayoutView,
    children: [
      {
        path: '',
        name: 'Home',
        component: HomeView,
      },
      {
        path: 'grading',
        name: 'Grading',
        component: HomeView,
      },
      {
        path: 'results',
        name: 'Results',
        component: () => import('@/views/ResultsView.vue'),
      },
      {
        path: 'history',
        name: 'History',
        component: () => import('@/views/HistoryView.vue'),
      },
    ],
  },

  // 404
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
