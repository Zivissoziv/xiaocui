# 小崔平台 · 动效规范（Motion Spec）

面向 Vue 3 + Element Plus 前端。所有动效只操作 `transform` / `opacity`，走 GPU 合成层，不触发重排。
统一在 `src/styles.css` 末尾的「动效系统」区块实现，通过 CSS 变量集中管理时长与缓动。

## 设计令牌

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--motion-fast` | 150ms | 按钮、hover 等即时反馈 |
| `--motion-base` | 240ms | 弹窗、Toast、遮罩 |
| `--motion-slow` | 320ms | 页面级过渡 |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | 进入：快起慢收 |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | 位移类上下文切换 |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 需要一点回弹的反馈 |

原则：**退出总是比进入快**（离开不需要仪式感），交错总量封顶 400ms。

---

## 1. 路由切换过渡

```
Animation: page-transition
Trigger: vue-router 路由变更（AppLayout 内 <router-view> 用 v-slot + <transition name="page" mode="out-in"> 包裹，key 用 route.fullPath）
Duration: 进入 320ms / 离开 160ms
Easing: cubic-bezier(0.22, 1, 0.36, 1) 进入 / cubic-bezier(0.4, 0, 0.2, 1) 离开
Properties: opacity 0→1，transform translateY(14px)→0
Reduced motion: 直接切换，无位移无淡入
Principles: Slow In & Slow Out (#6)、Staging (#3)
```

## 2. 列表 / 卡片交错入场

```
Animation: rise-in
Trigger: 页面挂载后元素首次渲染（.stagger 容器的直接子元素）
Duration: 360ms，步长 60ms，第 6 项起统一 300ms（总量封顶）
Easing: cubic-bezier(0.22, 1, 0.36, 1)
Properties: opacity 0→1，transform translateY(12px)→0
Reduced motion: 无动画直接显示
Principles: Follow Through & Overlapping Action (#5)
```

```
Animation: rows-reveal（任务表格行）
Trigger: 首页 store.tasks 首次非空时播放一次，900ms 后移除 class
Duration: 300ms，步长 45ms，第 8 行起 400ms 封顶
注意：只在首次到达数据时播放，搜索过滤时不再重播，避免逐字输入导致的闪烁
Principles: Follow Through (#5)、Timing (#9)
```

## 3. 弹窗 / Toast 微交互

```
Animation: dialog-fade-in / out
Trigger: el-dialog 打开 / 关闭（覆盖 Element Plus 的 dialog-fade 关键帧）
Duration: 进入 240ms / 退出 180ms
Easing: cubic-bezier(0.22, 1, 0.36, 1) / cubic-bezier(0.4, 0, 0.2, 1)
Properties: opacity 0→1，transform translateY(-18px) scale(0.96) → 0 scale(1)
Reduced motion: 仅交叉淡入
Principles: Anticipation (#2)、Exaggeration (#10)
```

```
Animation: msgbox-fade-in / out
Trigger: ElMessageBox.confirm / prompt（删除确认等）
Duration: 进入 220ms / 退出 160ms
Easing: cubic-bezier(0.34, 1.56, 0.64, 1) 进入（轻微回弹）
Properties: opacity + scale(0.94)→1
Reduced motion: 仅交叉淡入
Principles: Squash & Stretch (#1)
```

Toast（ElMessage）、遮罩层沿用 Element Plus 结构，只替换过渡时长与缓动，保留其水平居中位移。

## 4. 按钮 / 卡片反馈

```
Animation: button-press
Trigger: :active
Duration: 120ms
Easing: cubic-bezier(0.22, 1, 0.36, 1)
Properties: scale(0.96)
Reduced motion: 缩放改为无，仅保留背景色变化
Principles: Squash & Stretch (#1)
```

```
Animation: card-hover
Trigger: hover（.metric-card / .panel / .wizard-card / .settings-card）
Duration: 200ms
Easing: cubic-bezier(0.22, 1, 0.36, 1)
Properties: translateY(-4px)，阴影 --soft-shadow → --shadow
Secondary action: 卡片图标同步 scale(1.12) rotate(-6deg)，260ms spring
Reduced motion: 只变阴影，不变形
Principles: Secondary Action (#8)
```

其余：`side-nav` 按钮、返回按钮（hover 时 `translateX(-2px)`）、上传区、表格单元格背景均统一 160ms ease-out。

## 5. 可访问性与性能

- `prefers-reduced-motion: reduce` 下所有动画与过渡时长压到 0.01ms，位移一律取消，只保留不透明度变化。
- 只动画 `transform` / `opacity`，不触碰 `width` / `height` / `top` / `left`。
- 动画时长以毫秒定义，不使用帧数。
- 路由过渡用 `mode="out-in"`，避免进出场元素同时占位导致布局跳动。

## 落地位置

- 令牌与全部动画：`src/styles.css` → 「动效系统 Motion System」区块
- 路由过渡挂载：`src/layouts/AppLayout.vue`
- 首页交错入场：`src/views/ConsoleView.vue`（`.stagger` 类 + `tableReveal` 一次性行入场）
