<template>
  <div class="before-after">
    <!-- 左：原图 -->
    <div class="img-side">
      <div class="side-label">原图</div>
      <div class="img-wrap">
        <img v-if="beforeUrl" :src="beforeUrl" class="full-img" />
        <div v-else class="img-empty"><i class="fas fa-image"></i></div>
      </div>
    </div>

    <!-- 右：超分后 -->
    <div class="img-side">
      <div class="side-label">超分后</div>
      <div class="img-wrap">
        <img v-if="afterUrl" :src="afterUrl" class="full-img" />
        <div v-else class="img-empty"><i class="fas fa-image"></i></div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!beforeUrl && !afterUrl" class="empty">
      <i class="fas fa-images"></i>
      <span>处理完成后在此查看对比</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  before: { type: String, default: '' },
  after: { type: String, default: '' }
})

const beforeUrl = computed(() => props.before)
const afterUrl = computed(() => props.after)
</script>

<style scoped>
.before-after {
  position: relative;
  width: 100%;
  height: 420px;
  display: flex;
  gap: 12px;
  background: var(--el-fill-color-darker);
  border-radius: var(--el-border-radius-base);
  padding: 12px;
  box-sizing: border-box;
}

.img-side {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  /* 两边严格等大 */
}

.side-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
  height: 18px;
  flex-shrink: 0;
}

.img-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color);
  border-radius: var(--el-border-radius-small);
  overflow: hidden;
  /* 固定宽高比，确保两边容器完全等大 */
  aspect-ratio: 1 / 1;
}

.full-img {
  /* 两图都用相同的缩放基准：宽度填满，高度自适应，保证一致大小 */
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}

.img-empty {
  color: var(--el-text-color-placeholder);
  font-size: 32px;
}

.empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--el-text-color-secondary);
}

.empty i {
  font-size: 48px;
  opacity: 0.4;
}
</style>
