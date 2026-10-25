deprecatedmodule/ —— 已下线模块归档

后端 openapi 于本次调整中移除了 grading（作业批阅）与 upload（文件）两个模块，
教师端「作业批阅」一级目录下的页面及其配套代码整体迁入此处，不参与构建（tsconfig 只 include src/）。

- views/            开始批阅 HomeView、批阅结果 ResultsView、上传管理 UploadFilesView、
                    历史任务 HistoryView、teacher/GradingReviewView（智能批改）
- components/       ProgressPanel、ResultTable、UploadArea（仅批阅链路使用）
- api/              grading.ts、history.ts、upload.ts、uploadFiles.ts
- stores/           grading.ts、history.ts、upload.ts、uploadFile.ts
- types/            history.ts、uploadFile.ts

未迁入的相邻能力：班级管理已随 class 模块一并迁入此处（见下），但 `fetchTeacherClasses()`（GET /api/class/records）仍留在 src/api/teacher.ts —— 作业发布的 classId 与班级学情都依赖它。

## class/ —— 班级管理（第二批摘除）
后端 7 份模块文档中没有 class 模块，班级管理页整体下线：
- views/ClassManagementView.vue   班级管理页
- api/class.ts                    班级增删改查（create/update/delete/get/records）
- stores/class.ts                 班级列表状态与弹窗表单
- types/class.ts                  ClassRecord / ClassSaveRequest / ClassQuery 等

恢复方式：四个文件移回 src/ 对应目录，并在 router 与 sidebar 补回 `/classes` 入口。

恢复方式：把对应文件移回 src/ 同名目录，补回 router 与 sidebar 的入口即可；
其中批阅进度与结果需改用仍在线的接口，原 /api/grading/* 与 /api/upload/* 已不可用。

## PortalSwitcher —— 全局三端切换滑块（第三批下线）

`components/PortalSwitcher.vue` 是挂在 App.vue 右上角的开发调试用滑块，可以无视角色在
学生端 / 教师端 / 运维端之间随意跳转。登录改为按 JWT 角色鉴权 + 登录后选端页（`/choose-portal`）
之后，这个入口等于绕过了路由守卫，遂从 App.vue 摘除并归档至此，src/ 下已无引用。

恢复方式：文件移回 `src/components/PortalSwitcher.vue`，在 App.vue 的 `.app` 里重新引入
`<PortalSwitcher />` 即可；组件无外部依赖，样式自带 scoped。仅在本地调试时启用。
