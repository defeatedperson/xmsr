<template>
  <div class="starry-bg">
    <div class="stars" :style="{ boxShadow: starsShadow }"></div>
    <div class="stars2" :style="{ boxShadow: stars2Shadow }"></div>
    <div class="stars3" :style="{ boxShadow: stars3Shadow }"></div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

// 生成 box-shadow 形式的星点（多层视差）
function generateStars(count) {
  const shadows = []
  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * 2000)
    const y = Math.floor(Math.random() * 2000)
    shadows.push(`${x}px ${y}px #FFF`)
  }
  return shadows.join(', ')
}

const starsShadow = ref('')
const stars2Shadow = ref('')
const stars3Shadow = ref('')

onMounted(() => {
  starsShadow.value = generateStars(700)
  stars2Shadow.value = generateStars(200)
  stars3Shadow.value = generateStars(100)
})
</script>

<style scoped>
.starry-bg {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 0;
  background: radial-gradient(ellipse at bottom, #1b2735 0%, #090a0f 100%);
  overflow: hidden;
}

.stars,
.stars2,
.stars3 {
  position: absolute;
  top: 0;
  left: 0;
  background: transparent;
  border-radius: 50%;
}

.stars {
  width: 1px;
  height: 1px;
  animation: anim-star 50s linear infinite;
}

.stars2 {
  width: 2px;
  height: 2px;
  animation: anim-star 100s linear infinite;
  opacity: 0.8;
}

.stars3 {
  width: 3px;
  height: 3px;
  animation: anim-star 150s linear infinite;
  opacity: 0.6;
}

@keyframes anim-star {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-2000px);
  }
}
</style>
