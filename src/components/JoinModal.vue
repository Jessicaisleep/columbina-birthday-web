<template>
  <div class="modal" :class="{ open: open }" id="joinModal" role="dialog" aria-modal="true" aria-labelledby="modalTitle" @click.self="close">
    <div class="modal-card">
      <button class="modal-close" id="modalClose" aria-label="关闭" @click="close">✕</button>
      <div class="modal-mark">❋</div>
      <h3 id="modalTitle">添加 QQ 群</h3>
      <p class="sub">新月再梦听羽生 · 哥伦比娅生日企划</p>
      <div class="qq-box"><span class="qq" id="qqNum">{{ qq }}</span></div>
      <button class="copy-btn" id="copyBtn" @click="copyQq">{{ copyText }}</button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false }
})
const emit = defineEmits(['close'])

/* 企划 QQ 群号 */
const qq = ref('1087063966')
const copyText = ref('复制 QQ 号')

watch(() => props.open, (v) => {
  document.body.style.overflow = v ? 'hidden' : ''
})

function close() {
  emit('close')
}

function onKeydown(e) {
  if (e.key === 'Escape' && props.open) close()
}

onMounted(() => addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})

function fallbackCopy(text, done) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try { document.execCommand('copy'); done() } catch (e) { /* 忽略 */ }
  document.body.removeChild(ta)
}

function copyQq() {
  const done = () => {
    copyText.value = '已复制 ✓'
    setTimeout(() => { copyText.value = '复制 QQ 号' }, 1500)
  }
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(qq.value).then(done).catch(() => fallbackCopy(qq.value, done))
  } else {
    fallbackCopy(qq.value, done)
  }
}
</script>

<style scoped>
/* ---------- 参与弹窗 ---------- */
.modal{
  position:fixed;inset:0;z-index:100;
  display:flex;align-items:center;justify-content:center;padding:24px;
  background:rgba(4,6,13,.68);backdrop-filter:blur(10px);
  opacity:0;visibility:hidden;
  transition:opacity .45s cubic-bezier(.2,.6,.2,1),visibility .45s;
}
.modal.open{opacity:1;visibility:visible}
.modal-card{
  position:relative;width:100%;max-width:420px;
  border:1px solid rgba(230,200,138,.28);border-radius:18px;
  padding:46px 40px 38px;text-align:center;
  background:
    radial-gradient(ellipse at 50% -10%,rgba(157,184,232,.16),transparent 55%),
    linear-gradient(170deg,rgba(24,33,62,.92),rgba(8,12,26,.96));
  box-shadow:0 24px 80px rgba(0,0,0,.55),0 0 0 1px rgba(157,184,232,.06);
  transform:translateY(26px) scale(.96);
  transition:transform .45s cubic-bezier(.2,.6,.2,1);
}
.modal.open .modal-card{transform:none}
.modal-card::before{
  content:"☾";position:absolute;top:-34px;right:18px;font-size:110px;
  color:rgba(242,244,250,.05);font-family:var(--serif);pointer-events:none;
}
.modal-close{
  position:absolute;top:14px;right:16px;background:none;border:none;
  color:var(--ink-faint);font-size:20px;cursor:pointer;line-height:1;padding:6px;
  transition:color .3s,transform .3s;
}
.modal-close:hover{color:var(--gold);transform:rotate(90deg)}
.modal-mark{
  width:54px;height:54px;margin:0 auto 18px;border-radius:50%;
  display:grid;place-items:center;font-size:22px;color:var(--gold);
  background:radial-gradient(circle at 35% 30%,rgba(230,200,138,.22),rgba(74,106,168,.1));
  border:1px solid rgba(230,200,138,.3);box-shadow:0 0 26px rgba(230,200,138,.2);
}
.modal-card h3{font-size:26px;letter-spacing:.12em;margin-bottom:8px}
.modal-card .sub{font-size:13px;color:var(--ink-dim);letter-spacing:.14em;margin-bottom:26px}
.qq-box{
  display:flex;align-items:center;justify-content:center;gap:12px;
  margin:0 auto 20px;max-width:280px;
  border:1px dashed rgba(157,184,232,.35);border-radius:12px;
  padding:14px 18px;background:rgba(157,184,232,.06);
}
.qq-box .qq{
  font-family:var(--serif);font-size:30px;letter-spacing:.12em;color:var(--moon);
  font-variant-numeric:tabular-nums;text-shadow:0 0 22px rgba(242,244,250,.3);
}
.copy-btn{
  display:inline-flex;align-items:center;gap:8px;
  padding:11px 34px;border:none;border-radius:99px;cursor:pointer;
  font-family:var(--serif);font-size:15px;letter-spacing:.16em;color:var(--bg);
  background:linear-gradient(135deg,var(--gold),#f0d9a8);
  box-shadow:0 8px 26px rgba(230,200,138,.26);
  transition:transform .3s,box-shadow .3s;
}
.copy-btn:hover{transform:translateY(-2px);box-shadow:0 12px 34px rgba(230,200,138,.38)}
.modal-note{font-size:12px;color:var(--ink-faint);letter-spacing:.12em;margin-top:18px}
</style>
