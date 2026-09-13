<template>
  <section>
    <div class="wrap">
      <div class="eyebrow reveal">Works</div>
      <h2 class="reveal">企划内容</h2>
      <p class="lead reveal">以下产出将于生日当天（1月14日）一同公开。</p>
      <div class="works">
        <div class="work reveal">
          <div class="icon">✏️</div>
          <h3>手书</h3>
          <span class="tag">筹备中</span>
        </div>
        <div class="work reveal">
          <div class="icon">🕊️</div>
          <h3>音乐</h3>
          <span class="tag">筹备中</span>
        </div>
        <div class="work reveal">
          <div class="icon">🎬</div>
          <h3>MMD</h3>
          <span class="tag">筹备中</span>
        </div>
        <div class="work reveal">
          <div class="icon">❋</div>
          <h3>其他</h3>
          <span class="tag">筹备中</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ---------- 产出 ---------- */
.works{display:grid;grid-template-columns:repeat(4,1fr);gap:22px}
.work{
  position:relative;border:1px solid var(--line);border-radius:14px;padding:30px 26px 26px;
  background:linear-gradient(170deg,rgba(22,30,56,.5),rgba(9,13,26,.7));
  transition:transform .5s cubic-bezier(.2,.6,.2,1),border-color .5s;
  overflow:hidden;
}
.work:hover{transform:translateY(-6px);border-color:rgba(230,200,138,.4)}
.work .icon{
  width:52px;height:52px;border-radius:50%;display:grid;place-items:center;
  background:radial-gradient(circle at 35% 30%,rgba(157,184,232,.3),rgba(74,106,168,.14));
  border:1px solid var(--line);font-size:22px;margin-bottom:20px;
  box-shadow:0 0 30px rgba(157,184,232,.18);
}
.work h3{font-size:20px;letter-spacing:.08em;margin-bottom:10px}
.work p{font-size:13.5px;color:var(--ink-dim)}
.work .tag{
  display:inline-block;margin-top:16px;font-size:11px;letter-spacing:.22em;color:var(--gold);
  border:1px solid rgba(230,200,138,.3);border-radius:99px;padding:4px 12px;
}

/* ---------- 响应式（Works 部分） ---------- */
@media(max-width:1024px){
  .works{grid-template-columns:repeat(2,1fr)}
}
@media(max-width:860px){
  .works{grid-template-columns:1fr}
}
</style>
