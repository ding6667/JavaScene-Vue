# 项目长期约定（javascene 前端）

## 界面文案：禁止暴露任何内部信息
- 模板文案、提示语、tooltip、placeholder、表头、空态里**不许出现**：接口路径（`/api/...`）、函数名（`@/api/xxx.fetchYyy`）、DTO 字段名（`classId` / `recordId` / `standardIdea`）、`openapi / schema / 联调 / 桩` 一类开发词、供应商名（Dify 等，统一称「知识库」）。
- 代码注释里写这些没问题，注释是给开发看的；只清理渲染给用户的部分。
- 错误提示写成「业务对象 + 动作」：`describeError('作业列表加载', e)` → 「作业列表加载失败：…」；`apiHint(e, '设置保存')`。不要拼 apiPath。
- 未上线功能统一说「暂未开放 / 即将开放 / 敬请期待」，不写「接口预留：后端未提供 xxx」。
- 改模板里的反引号插值（`:title="\`删除「${x}」\`"`）后必须跑一次 `vue-tsc`，少一个收尾反引号会让整页编译失败。

## 提示文案：只有「非 2xx 错误」才用后端 message
- **非 2xx / 业务失败**：后端返回的 `message` 是给用户直接渲染的错误提示，前端展示它（响应拦截器统一 `ElMessage.error(message)` 或页面用 `apiErrorText()`），不要自己另造文案去覆盖。
- **2xx 成功**：后端 `message` 一律不作为提示文案使用，成功提示由前端自己定（如「题目已更新」「题目已删除」「教案已导出」）。即便后端返回了内容（例如 `{code:200, data:null, message:"登录成功"}` 这种默认值残留），也必须忽略。
- 写接口（POST/PUT/DELETE）成功后直接弹本地固定文案，不要 `ElMessage.success(msg || '默认文案')` 这种写法——它会漏出后端无关的默认 message。
- 参考实现：`src/api/exam.ts` 的 `updateQuestion` / `deleteQuestion` 返回 `Promise<void>`，只在 DEV 下 `traceSuccess()` 打印后端 message 备查；`QuestionBankView.vue` 用固定文案提示。

## 403 策略：默认强制下线，只读接口可豁免
- 拦截器（`src/api/index.ts`）把 403 当越权安全事件：弹错 → 吊销 token → 跳登录。这适用于业务接口。
- 对「角色可能不匹配的只读接口」（如 `GET /api/exam/difficulty-config/list`，学生端练习页/错题本也要用），请求时传 `skipForbiddenLogout: true`：403 只 reject，由调用方降级（空列表 / 禁用筛选项），不踢人。该标记已在 `declare module 'axios'` 中扩展。
- 新增学生端/普通用户可见页面时，先确认它调用的接口是否只对教师/管理员开放——一个 403 就会把用户踢下线。

## 题目契约：shortTitle 优先、renderConfig 决定渲染
- 列表/卡片标题：`shortTitle?.trim() || content 截断`（一话题名，≤100 字）。
- 选择题单选/多选只看 `renderConfig.choiceMode`（`single` / `multiple`），不要按答案个数猜；填空题输入框个数只看 `renderConfig.blankCount`，不要数题干下划线。缺失时兜底：单选、1 空。
- 学生作答 `answerContent` 是**字符串**：选择用字母（单选 `"A"`、多选 `"A,C"`）、填空 `join('|')`、判断 `"true"/"false"`、阅读/简答/编程原样。**不要提交选项原文**。
- 教师作业详情的快照 `options/answer/knowledgePoints` 仍是 JSON 字符串（历史口径），与题库管理的对象口径不同，解析逻辑别混用。

## 刷题结构：列表与作答分离
- `/student/practice` 只做筛选 + 列表；点题目用 `window.open` 新标签打开 `/student/practice/solve/:questionId`（`PracticeSolveView.vue`，左题目信息 / 右作答区）。
- 作答页承担：草稿（`/study/practice/draft`，1s 节流）、提交（`/study/practice/submit`）、编程题运行（`/study/code/run`）与智能纠错（`/study/code/debug`）、判题结果与用例明细。
- 「代码实操」页（CodeLabView）已删除，不要再新增指向 `/student/code` 的入口。

## 布局约定：新标签页 = 独立页模板（无侧边栏）
- 新开页（`window.open` / `target="_blank"`）一律挂 `src/views/StandaloneLayout.vue`，**不要**放进 `/student`、`/admin` 的 children 里，否则会带出侧边栏。
- 路由写法：完整路径写在父路由（`component: StandaloneLayout`），子路由 `path: ''`、`props: true` 照旧；meta 支持 `standalone: true`（语义标识）、`standaloneFluid: true`（取消 1680 上限、铺满窗口）、`assistant: true`（挂 AI 答疑浮窗）。
- 布局负责画布底色、`height: 100vh` 滚动容器、统一留白（22/28/32）；页面自身不要再写 `padding`、`min-height:100vh`、`max-width`。
- 因为侧栏收起后主区仍固定 `margin-left: 220px`（收起态 60px 会空出 160px），**不要**再用负 margin 把带侧栏页面往左顶，这类需求一律改走独立页布局。

## 章节选择：一律用 ChapterSelect + useChapters
- 组件 `src/components/ChapterSelect.vue`（el-tree-select 树形下拉，章/节/小节三级）。props：`allowAll`/`allLabel`/`allValue`、`clearable`、`levels`、`excludeIds`、`filterable`、`placeholder`；**宽度由调用方 `style`/`class` 指定**，组件内不写死 width（写了会和父级 scoped 类的优先级打架）。
- 数据源 `src/composables/useChapters.ts`：`chapters`/`tree`/`loading`/`error` + `load(force)`/`findById`/`labelOf`，全站单例；增删章节后调 `load(true)`。
- **禁止**页面再自己 `fetchChapters()` + `buildChapterTree()` 拼下拉；回显章节名用 `labelOf(id)`（带编号）或 `findById(id)?.title`（纯标题）。
- 筛选口径：0 表示「全部」（页面里写 `filters.chapterId || undefined`）的用 `allow-all`；用 `?? undefined` 的只给 `clearable`，别把 0 传给后端。

## 作答区：一律用 AnswerArea 组件
- 组件 `src/components/student/AnswerArea.vue`，按题型渲染作答控件，对外只有 `v-model`（**规范答案串**：选择字母 / 填空 `join('|')` / 判断 `true|false` / 阅读简答原文 / 编程源码）。渲染只认 `renderConfig`（选择 `choiceMode`、填空 `blankCount`），缺失兜底单选、1 空。
- 题目形状用 `AnswerAreaQuestion`（`types/exam.ts`），页面自己把题目对象映射过去：刷题 `options: string[]`，作业 `options: {key,value}[]` 拆成 `options` + `optionKeys`。
- 「运行代码 / 智能纠错」要 `showCodeTools` + `runQuestionId`（**题库题目 ID**）才出现。作业题目快照接口现在也会返回 `questionId`（题库 ID），非空时作业页可以传，做题时能自测；为 null（老快照）就别传。
- 回填由组件内部解析（字母 / 选项原文 / 分隔串 / true-false / 源码都兼容），且回填不 emit `change`——页面的草稿节流挂 `@change` 即可，不会一打开就白存一次。

## 作业作答（两套 ID 别混用）
- 接口：`GET /api/teach/homework/student/brief?homeworkId=`（元信息 + `questionIds` 快照 ID 列表）→ 逐题 `GET /api/teach/homework/student/question?questionId=`（入参是**快照 ID**，去答案，懒加载缓存）→ 作答中途 `POST /api/exam/homework/draft`（草稿）→ `POST /api/exam/homework/submit`（交卷）。
- 提交 body：`{homeworkId, answers:[{questionId, snapshotId?, answerContent}]}`。**`questionId` = 题库 ID（`exam_question.id`，取题目返回的 `questionId`），`snapshotId` = 快照 ID（题目返回的 `id`）**。拿快照 ID 当 `questionId` 提交，后端报 `code=1001`「提交的题目不属于该作业」。`questionId` 为 null 的老快照不可提交，要单独挑出来提示，别让整份提交挂掉。
- 题目返回还带 `codeFramework`（编程题框架，发布时固化）、`requirements`（作答要求）、`hints`（阶梯提示，逐条展开、不计分）。
- **草稿/续做**：`GET /api/exam/homework/my-answers?homeworkId=` 拉回草稿+已提交用于回填（`snapshotId` 可能为 0，要按 `questionId` 暂存、等题目加载后挂到快照 ID 上）；编辑后 3s 节流 `POST /draft`，**只传变化的题**。截止不约束草稿，过期照样能存。
- **交卷语义**：`submit` 会「本次作答转正 + 其余草稿一并转正 + 全量重批」，所以只传本次有作答的题即可。副作用：学生把某题清空后如果直接提交，旧草稿会被转正——所以本地清空且后端有记录的题必须**显式传空串**。
- **只读**：已交卷的题 `AnswerArea` 传 `readonly`（选项/判断按钮 disabled、输入框 readonly、代码区隐藏运行与重置）。要改先点「修改作答」解锁；已交题即使解锁也不发草稿（后端会忽略），改动只在重新交卷时生效。
- 页：`/student/homework/solve/:homeworkId`（StandaloneLayout，新标签页无侧栏）。「我的作业」用 `window.open` 进入，**不再用 canSubmit 拦入口**——已截止也要能进去回看/续写草稿，只是交卷按钮禁用。
- 题量一律用 `questionIds.length`，`questionCount` 可能和发布时的统计不一致。

## 其他
- 构建/校验命令（Node 用 managed 版本）：
  `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.json` 与 `node node_modules/vite/bin/vite.js build`。
- 后端契约以实际运行响应为准，不要凭 controller 源码推断；`Result.success()` 这类静态工厂可能自带默认 message。
