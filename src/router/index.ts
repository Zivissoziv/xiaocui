import { createRouter, createWebHashHistory } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import ConsoleView from "../views/ConsoleView.vue";
import NewTaskView from "../views/NewTaskView.vue";
import SettingsView from "../views/SettingsView.vue";
import TaskDetailView from "../views/TaskDetailView.vue";
import AddressBookView from "../views/AddressBookView.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/",
      component: AppLayout,
      children: [
        { path: "", name: "console", component: ConsoleView },
        { path: "tasks/new", name: "new-task", component: NewTaskView },
        { path: "contacts", name: "contacts", component: AddressBookView },
        { path: "settings", name: "settings", component: SettingsView },
        { path: "tasks/:id", name: "task-detail", component: TaskDetailView, props: true },
      ],
    },
  ],
});
