<template>
  <div class="layout-with-sidebar">
    <Sidebar />
    <main class="main-content">
      <router-view />
    </main>
    <ChatWidget />
  </div>
</template>

<script setup lang="ts">
import Sidebar from '@/components/ui/sidebar.vue';
import ChatWidget from '@/components/chat/ChatWidget.vue';
</script>

<style scoped>
.layout-with-sidebar {
  display: flex;
  min-height: 100vh;
  background: var(--bg-canvas);
}

.main-content {
  flex: 1;
  min-width: 0;
  overflow: auto;
  margin-left: 220px;
  transition: margin-left var(--transition);
}

@media (max-width: 768px) {
  .main-content {
    margin-left: 60px;
  }
}
</style>