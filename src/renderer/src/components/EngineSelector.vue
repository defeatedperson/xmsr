<template>
  <div class="engine-selector">
    <div class="selector-row">
      <span class="label">引擎</span>
      <el-select v-model="engineId" placeholder="选择引擎" @change="onEngineChange" style="width: 200px">
        <el-option
          v-for="eng in engines"
          :key="eng.id"
          :label="eng.name + (eng.available ? '' : '（未安装）')"
          :value="eng.id"
          :disabled="!eng.available"
        >
          <span>{{ eng.name }}</span>
          <span class="engine-desc">{{ eng.desc }}</span>
        </el-option>
      </el-select>
    </div>

    <div class="selector-row">
      <span class="label">模型</span>
      <el-select v-model="model" placeholder="选择模型" style="width: 280px" :disabled="models.length === 0">
        <el-option v-for="m in models" :key="m.name" :label="modelLabel(m.name)" :value="m.name">
          <span>{{ modelLabel(m.name) }}</span>
          <el-tag size="small" type="info" effect="plain" style="margin-left: 8px">
            {{ m.scales.join('/') }}x
          </el-tag>
        </el-option>
      </el-select>
    </div>

    <div class="selector-row">
      <span class="label">放大倍率</span>
      <el-radio-group v-model="scale">
        <el-radio-button v-for="s in supportedScales" :key="s" :value="s" :disabled="!supportedScales.includes(s)">{{ s }}x</el-radio-button>
      </el-radio-group>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  // 是否排除插帧引擎（rife/cain），超分引擎选择时应排除
  excludeInterp: { type: Boolean, default: true }
})
const emit = defineEmits(['update:modelValue'])

const allEngines = ref([])
const engineId = ref('')
const model = ref('')
const scale = ref(2)

// 按条件过滤引擎（排除插帧引擎、排除不可用的）
const engines = computed(() =>
  allEngines.value.filter((e) => e.available && (!props.excludeInterp || !e.isInterp))
)

const currentEngine = computed(() => engines.value.find((e) => e.id === engineId.value))
const models = computed(() => currentEngine.value?.models || [])
// 当前选中模型对象（含 scales）
const currentModel = computed(() => models.value.find((m) => m.name === model.value))
// 倍率跟随当前模型（而非引擎固定值）
const supportedScales = computed(() => currentModel.value?.scales || [2, 3, 4])

// 默认倍率：有 2x 优先 2x，否则取第一个（避免 waifu2x 默认落到 1x 纯降噪）
function pickDefaultScale(scales) {
  if (!scales || !scales.length) return null
  return scales.includes(2) ? 2 : scales[0]
}

// 倍率校正：旧预设/外部状态可能带入当前模型不支持的倍率（如固定 4x 模型 + 2x），统一纠正
function fixScaleIfUnsupported() {
  if (currentModel.value && !currentModel.value.scales.includes(scale.value)) {
    scale.value = pickDefaultScale(currentModel.value.scales)
  }
}

function modelLabel(m) {
  if (engineId.value === 'realcugan') {
    const map = {
      'models-se': '标准版（全倍率+降噪，推荐）',
      'models-pro': '高质量版（2x/3x）',
      'models-nose': '轻量版（仅2x无降噪）'
    }
    return map[m] || m
  }
  return m
}

async function loadEngines() {
  allEngines.value = await window.api.engineList()
  // 默认选第一个可用（过滤后）
  if (!engineId.value) {
    const first = engines.value[0]
    if (first) onEngineChange(first.id)
  }
  // 预设可能在引擎列表加载前就注入了非法倍率，加载完成后校正一次
  fixScaleIfUnsupported()
}

function onEngineChange(id) {
  engineId.value = id
  const eng = engines.value.find((e) => e.id === id)
  if (eng) {
    // 模型默认优先取引擎定义的 defaultModel（如 realcugan → models-se），兜底第一个
    const defModel = eng.models.find((m) => m.name === eng.defaultModel) || eng.models[0]
    model.value = defModel?.name || ''
    const defScale = pickDefaultScale(defModel?.scales)
    if (defScale) scale.value = defScale
  }
}

// 切换模型时，若当前倍率不被新模型支持，则校正到合适的倍率
watch(model, fixScaleIfUnsupported)

// 同步到父组件
watch([engineId, model, scale], () => {
  emit('update:modelValue', {
    engineId: engineId.value,
    model: model.value,
    scale: scale.value,
    supportsDenoise: currentEngine.value?.supportsDenoise || false,
    denoiseLevels: currentEngine.value?.denoiseLevels || [],
    // 当前模型按倍率的可用降噪等级（由磁盘模型文件扫描得出，供 ParamPanel 联动）
    denoiseByScale: currentModel.value?.denoiseByScale || null
  })
})

// 反向同步：外部（如 applyPreset）更新 modelValue 时，同步到内部 ref
// 避免 UI 与状态脱节（应用预设后下拉框不刷新）
watch(
  () => props.modelValue,
  (mv) => {
    if (!mv) return
    if (mv.engineId && mv.engineId !== engineId.value) {
      onEngineChange(mv.engineId)
    }
    if (mv.model && mv.model !== model.value) {
      model.value = mv.model
    }
    if (mv.scale && mv.scale !== scale.value) {
      scale.value = mv.scale
    }
    fixScaleIfUnsupported()
  },
  { deep: true }
)

onMounted(loadEngines)
</script>

<style scoped>
.engine-selector {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.selector-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.label {
  font-size: 13px;
  color: var(--el-text-color-regular);
  width: 70px;
  flex-shrink: 0;
}

.engine-desc {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-left: auto;
}
</style>
