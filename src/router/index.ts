import { createRouter, createWebHashHistory } from "vue-router";
import ConsoleView from "../views/ConsoleView.vue";
import TaskDetailView from "../views/TaskDetailView.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "console", component: ConsoleView },
    { path: "/tasks/:id", name: "task-detail", component: TaskDetailView, props: true },
  ],
});
