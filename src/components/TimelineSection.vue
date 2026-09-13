<template>
  <section>
    <div class="wrap">
      <div class="eyebrow reveal">Schedule</div>
      <h2 class="reveal">企划时间线</h2>
      <div class="timeline">
        <div class="tl-item done reveal">
          <div class="tl-date">2026 · 秋</div>
          <h3>企划筹备</h3>
          <p>确定企划方向，搭建宣传小站，公开征集参与。</p>
        </div>
        <div class="tl-item reveal">
          <div class="tl-date">2026 · 冬</div>
          <h3>创作进行时</h3>
          <p>企划内容创作中，欢迎提出宝贵建议</p>
        </div>
        <div class="tl-item reveal">
          <div class="tl-date">2027 · 1月14日</div>
          <h3>新月再梦听羽生</h3>
          <p>全部产出正式公开。生日快乐！哥伦比娅！</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ---------- 时间线 ---------- */
.timeline{position:relative;max-width:640px}
.timeline::before{content:"";position:absolute;left:7px;top:8px;bottom:8px;width:1px;background:linear-gradient(180deg,var(--blue-deep),var(--gold),transparent)}
.tl-item{position:relative;padding:0 0 42px 44px}
.tl-item:last-child{padding-bottom:0}
.tl-item::before{
  content:"";position:absolute;left:0;top:7px;width:15px;height:15px;border-radius:50%;
  background:var(--bg);border:1px solid var(--blue);box-shadow:0 0 16px rgba(157,184,232,.5);
}
.tl-item.done::before{border-color:var(--gold);box-shadow:0 0 16px rgba(230,200,138,.5)}
.tl-date{font-size:12px;letter-spacing:.28em;color:var(--gold);margin-bottom:6px}
.tl-item h3{font-size:20px;letter-spacing:.06em;margin-bottom:6px}
.tl-item p{font-size:14px;color:var(--ink-dim);max-width:480px}
</style>
