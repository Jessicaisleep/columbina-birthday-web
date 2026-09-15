<template>
  <section class="intro">
    <div class="wrap">
      <div class="cols">
        <div class="reveal">
          <div class="eyebrow">About</div>
          <h2>一场献给月亮的<br>生日企划</h2>
          <p>哥伦比娅·希珀塞莱尼娅，前至冬愚人众第三席「<b>少女</b>」，如今的三月女神。她生于挪德卡莱的月光之下，歌声与夜色是她与世界之间，最温柔的丝线。而在朋友们的帮助下，她找到了家在何处。</p>

          <blockquote class="quote">「月下的世界终将再次明朗」<small>—— 2027 · 三月交辉之时</small></blockquote>
        </div>
        <div class="card reveal">
          <h3><span>哥伦比娅·希珀塞莱尼娅</span>角色档案</h3>
          <ul>
            <li>她是天，她是光，我们唯一的信仰</li>
            <li>前愚人众第三席，代号：「少女」</li>
            <li>三月女神</li>
            <li>生日：1月14日</li>
            <li>标志：镂空眼罩 · 翅膀头饰</li>
            <li>家：挪德卡莱·银月之庭</li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ---------- 介绍 ---------- */
.intro .cols{display:grid;grid-template-columns:1.1fr .9fr;gap:64px;align-items:start}
.intro p{color:var(--ink-dim);margin-bottom:18px}
.intro p b{color:var(--ink);font-weight:500}
.intro .quote{
  font-family:var(--serif);font-size:19px;line-height:2;color:var(--ink);
  border-left:1px solid var(--gold);padding-left:24px;margin:34px 0 0;
}
.intro .quote small{display:block;margin-top:12px;color:var(--ink-faint);font-size:13px;letter-spacing:.2em;font-family:var(--sans)}
/* 角色卡 */
.card{
  position:relative;border:1px solid var(--line);border-radius:14px;
  padding:34px 30px;background:linear-gradient(160deg,rgba(20,28,52,.55),rgba(8,12,26,.75));
  backdrop-filter:blur(6px);overflow:hidden;
}
.card::after{
  content:"";position:absolute;top:-60px;right:-60px;width:180px;height:180px;border-radius:50%;
  background:radial-gradient(circle,rgba(157,184,232,.16),transparent 70%);
}
.card h3{font-size:24px;letter-spacing:.1em;margin-bottom:16px}
.card h3 span{color:var(--gold);font-size:14px;letter-spacing:.3em;display:block;margin-bottom:8px;font-family:var(--sans)}
.card ul{list-style:none}
.card li{display:flex;gap:12px;align-items:baseline;padding:9px 0;color:var(--ink-dim);font-size:14.5px;border-bottom:1px dashed rgba(157,184,232,.08)}
.card li:last-child{border-bottom:none}
.card li::before{content:"❋";color:var(--gold);font-size:11px;flex:none;transform:translateY(1px)}

/* ---------- 响应式（Intro 部分） ---------- */
@media(max-width:860px) and (orientation:portrait){
  .intro .cols{grid-template-columns:1fr;gap:36px}
}
</style>
