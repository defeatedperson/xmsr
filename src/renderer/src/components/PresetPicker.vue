<template>
  <div class="preset-picker">
    <span class="label">快速预设</span>
    <el-select v-model="selectedId" placeholder="选择内置预设" style="width: 240px" @change="onApply" clearable>
      <el-option v-for="p in presets" :key="p.id" :label="p.name" :value="p.id">
        <span>{{ p.name }}</span>
        <el-tag size="small" type="info" effect="plain" style="margin-left: 8px">
          {{ p.engine }}·{{ p.scale }}x
        </el-tag>
      </el-option>
    </el-select>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const emit = defineEmits(['apply'])

const presets = ref([])
const selectedId = ref('')

async function load() {
  const all = await window.api.presetList()
  // 只展示内置预设
  presets.value = all.filter((p) => p.builtin)
}

function onApply(id) {
  const preset = presets.value.find((p) => p.id === id)
  if (preset) emit('apply', preset)
}

onMounted(load)
</script>

<style scoped>
.preset-picker {
  display: flex;
  gap: 10px;
  align-items: center;
}

.label {
  font-size: 13px;
  color: var(--el-text-color-regular);
  flex-shrink: 0;
}
</style>
