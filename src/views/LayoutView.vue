<template>
  <div class="layout-with-sidebar">
    <Sidebar />
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import Sidebar from '@/components/ui/sidebar.vue';
</script>

<style scoped>
.layout-with-sidebar {
  display: flex;
  min-height: 100vh;
  background: #f1f5f9;
}

.main-content {
  flex: 1;
  min-width: 0;
  overflow: auto;
  margin-left: 220px;
  transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@media (max-width: 768px) {
  .main-content {
    margin-left: 60px;
  }
}
</style>
