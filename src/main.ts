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

// 启动即校验会话：已接桩（待实现 @/api/user.fetchUserInfo），桩抛错时保留本地 token，
// 真实失效才清 token，交给路由守卫回登录页；不 await，避免首屏被未实现接口阻塞。
void useAuthStore(pinia).restoreSession();

app.mount('#app');
