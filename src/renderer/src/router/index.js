import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/', redirect: '/image' },
  {
    path: '/image',
    name: 'image',
    component: () => import('@renderer/views/image/ImagePage.vue'),
    meta: { title: '图片超分' }
  },
  {
    path: '/video',
    name: 'video',
    component: () => import('@renderer/views/video/VideoPage.vue'),
    meta: { title: '视频超分' }
  },
  {
    path: '/output',
    name: 'output',
    component: () => import('@renderer/views/history/HistoryPage.vue'),
    meta: { title: '成品' }
  },
  {
    path: '/logs',
    name: 'logs',
    component: () => import('@renderer/views/logs/LogsPage.vue'),
    meta: { title: '日志' }
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@renderer/views/settings/SettingsPage.vue'),
    meta: { title: '设置' }
  },
  { path: '/:pathMatch(.*)*', redirect: '/image' }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
