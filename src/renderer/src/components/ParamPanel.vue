<template>
  <div class="param-panel">
    <!-- 降噪（仅引擎支持时显示） -->
    <div v-if="supportsDenoise" class="param-row">
      <span class="label">降噪</span>
      <el-radio-group v-model="denoise" :disabled="denoiseLocked">
        <el-radio-button v-for="lv in denoiseOptions" :key="lv.value" :value="lv.value">
          {{ lv.label }}
        </el-radio-button>
      </el-radio-group>
      <span v-if="denoiseLocked" class="lock-hint">当前引擎/模型仅支持该选项</span>
    </div>

    <!-- 输出格式 -->
    <div class="param-row">
      <span class="label">输出格式</span>
      <el-radio-group v-model="format">
        <el-radio-button value="png">PNG（无损）</el-radio-button>
        <el-radio-button value="jpg">JPG（小体积）</el-radio-button>
        <el-radio-button value="webp">WebP</el-radio-button>
      </el-radio-group>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  supportsDenoise: { type: Boolean, default: false },
  denoiseLevels: { type: Array, default: () => [] },
  // 当前引擎 id（用于区分同名降噪等级的含义）
  engineId: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])

// 默认弱降噪（对不支持 1 的模型会在下方 watch 中自动校正）
const denoise = ref(1)
const format = ref('png')

// 只有一个可选等级时锁定（如 realcugan models-nose 仅支持无降噪）
const denoiseLocked = computed(() => props.denoiseLevels.length === 1)

const denoiseOptions = computed(() => {
  // 0 在不同引擎含义不同：realcugan 的 0 是 conservative（保守/轻降噪），waifu2x 的 0 才是无降噪
  const zeroLabel = props.engineId === 'realcugan' ? '保守' : '无'
  const labels = { '-1': '无', 0: zeroLabel, 1: '弱', 2: '中', 3: '强' }
  return (props.denoiseLevels.length ? props.denoiseLevels : [0, 1, 2, 3]).map((lv) => ({
    value: lv,
    label: labels[String(lv)] || String(lv)
  }))
})

// 可选等级变化（切换引擎/模型/倍率）时，校正不合法的当前值
watch(
  () => props.denoiseLevels,
  (levels) => {
    if (!levels || !levels.length) return
    if (!levels.includes(denoise.value)) {
      // 优先弱降噪，其次无降噪，兜底第一个可选值
      denoise.value = levels.includes(1) ? 1 : levels.includes(-1) ? -1 : levels[0]
    }
  },
  { immediate: true }
)

watch([denoise, format], () => {
  emit('update:modelValue', {
    denoise: denoise.value,
    format: format.value
  })
}, { immediate: true })
</script>

<style scoped>
.param-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.param-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.label {
  font-size: 13px;
  color: var(--el-text-color-regular);
  width: 70px;
  flex-shrink: 0;
}

.lock-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
