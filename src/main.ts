import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import router from './router';
import App from './App.vue';
import { useAuthStore } from './stores/auth';
import '@/assets/student.css';

const app = createApp(App);
const pinia = createPinia();

// 注册所有 Element Plus 图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

app.use(pinia);
app.use(router);
app.use(ElementPlus);

// 启动即校验会话：失败只记录状态、不清 token（真失效由后端 401 触发拦截器登出）；
// 不 await，避免首屏被 /user/info 阻塞。
void useAuthStore(pinia).restoreSession();

app.mount('#app');
