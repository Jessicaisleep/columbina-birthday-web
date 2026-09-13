<template>
  <section>
    <div class="wrap">
      <div class="cta reveal">
        <div class="eyebrow" style="justify-content:center">Join</div>
        <h2>愿你也沐浴着月光</h2>
        <p>如果你也喜欢这位月之少女，欢迎加入这场企划——无论是投稿、赞助、留下祝福，还是仅仅在生日那天说一声「生日快乐」，都是月光的一部分。</p>
        <button class="btn" id="joinBtn" @click="$emit('join')">参与企划 <span class="arr">→</span></button>
      </div>
    </div>
  </section>
</template>

<script setup>
defineEmits(['join'])
</script>

<style scoped>
/* ---------- 参与 ---------- */
.cta{
  text-align:center;border:1px solid var(--line);border-radius:18px;padding:64px 32px;
  background:
    radial-gradient(ellipse at 50% 0%,rgba(157,184,232,.12),transparent 60%),
    linear-gradient(170deg,rgba(22,30,56,.5),rgba(9,13,26,.75));
  position:relative;overflow:hidden;
}
.cta::before{
  content:"☾";position:absolute;top:-30px;right:26px;font-size:120px;color:rgba(242,244,250,.05);
  font-family:var(--serif);
}
.cta h2{margin-bottom:14px}
.cta p{color:var(--ink-dim);max-width:520px;margin:0 auto 34px;font-size:15px}
.btn{
  display:inline-flex;align-items:center;gap:10px;padding:15px 42px;border-radius:99px;
  font-family:var(--serif);font-size:16px;letter-spacing:.2em;color:var(--bg);
  background:linear-gradient(135deg,var(--gold),#f0d9a8);text-decoration:none;
  border:none;cursor:pointer;
  box-shadow:0 8px 34px rgba(230,200,138,.28);transition:transform .35s,box-shadow .35s;
}
.btn:hover{transform:translateY(-3px);box-shadow:0 14px 44px rgba(230,200,138,.4)}
.btn .arr{transition:transform .35s}
.btn:hover .arr{transform:translateX(5px)}
</style>
