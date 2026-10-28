import { ref, watch } from 'vue'

/**
 * 图片加载 composable：通过主进程读取文件为 base64 data URL。
 * 用法：const { src, loading, error } = useImage(() => props.path)
 * 返回的 src 可直接用于 <img :src="src">
 *
 * 这样渲染端只拿到 base64 字符串，不直接访问文件系统（符合 Electron 安全模型）。
 */
export function useImage(pathGetter) {
  const src = ref('')
  const loading = ref(false)
  const error = ref('')

  async function load(path) {
    if (!path) {
      src.value = ''
      error.value = ''
      return
    }
    loading.value = true
    error.value = ''
    try {
      const res = await window.api.fileReadAsDataUrl(path)
      if (res.success) {
        src.value = res.dataUrl
      } else {
        src.value = ''
        error.value = res.error || '加载失败'
      }
    } catch (e) {
      src.value = ''
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  // 监听路径变化自动加载
  watch(pathGetter, (newPath) => load(newPath), { immediate: true })

  return { src, loading, error, reload: () => load(pathGetter()) }
}
