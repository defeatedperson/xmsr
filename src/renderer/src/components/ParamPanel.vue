<template>
  <div class="param-panel">
    <!-- 降噪（仅引擎支持时显示） -->
    <div v-if="supportsDenoise" class="param-row">
      <span class="label">降噪</span>
      <el-radio-group v-model="denoise">
        <el-radio-button v-for="lv in denoiseOptions" :key="lv.value" :value="lv.value">
          {{ lv.label }}
        </el-radio-button>
      </el-radio-group>
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
  denoiseLevels: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:modelValue'])

const denoise = ref(0)
const format = ref('png')

const denoiseOptions = computed(() => {
  const labels = { '-1': '保留原味', 0: '无', 1: '弱', 2: '中', 3: '强' }
  return (props.denoiseLevels.length ? props.denoiseLevels : [0, 1, 2, 3]).map((lv) => ({
    value: lv,
    label: labels[String(lv)] || String(lv)
  }))
})

// 初始化降噪默认值
watch(
  () => props.denoiseLevels,
  (levels) => {
    if (levels.length && !levels.includes(denoise.value)) {
      denoise.value = levels.includes(1) ? 1 : levels[0]
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
</style>
