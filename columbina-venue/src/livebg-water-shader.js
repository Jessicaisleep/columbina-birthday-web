/**
 * 水面波纹纹理：程序化生成一张可无缝平铺的水面法线/高度扰动图
 *
 * 为什么不用 tilePosition 滚一张静态亮斑图：
 *   滚静态图只能让「图案」移动，看起来像幻灯片在推，
 *   不像水在动。真正像水的做法是让每个像素的偏移量随时间变化。
 *
 * 做法（CPU 版，样板够用）：
 *   生成 N 张 256x256 的「高度图」，每张是一组随机相位的正弦波叠加（可无缝平铺），
 *   然后用 Phaser 的 RenderTexture 把它们按相位混合……太慢。
 *
 *   ★ 改用 WebGL Shader（Phaser 的 Shader 是支持的）：
 *     一整块 Plane，跑一个 fragment shader，
 *     用多层正弦/噪声叠加出「缓慢起伏的水面」，
 *     输出成半透明的高光与暗纹，叠在静态背景之上。
 *     这样零 CPU 开销、零纹理内存、效果最好。
 */

export const WATER_FRAG = `
precision mediump float;
uniform float uTime;
uniform vec2  uRes;
varying vec2 vUv;
// ---- 可平铺的 value noise ----
vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
                 dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
             mix(dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                 dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
}

// 多层叠加，做出「水面起伏」的高度场
float waterH(vec2 p, float t) {
  float h = 0.0;
  h += 0.55 * vnoise(p * 1.0 + vec2(t * 0.05, t * 0.03));
  h += 0.30 * vnoise(p * 2.3 + vec2(-t * 0.04, t * 0.06));
  h += 0.15 * vnoise(p * 5.1 + vec2(t * 0.07, -t * 0.05));
  return h;
}

void main() {
  vec2 uv = vUv;
  // 把 uv 缩放到「大约一格一个噪声周期」，看起来像水面在缓慢呼吸
  vec2 p = uv * vec2(uRes.x / 190.0, uRes.y / 190.0);

  float t = uTime;
  float h  = waterH(p, t);
  // 用「相邻点的高度差」当坡度，再转成高光 —— 这是水面反光的典型做法
  float e = 0.006;
  float hx = waterH(p + vec2(e, 0.0), t) - h;
  float hy = waterH(p + vec2(0.0, e), t) - h;
  vec3  n  = normalize(vec3(-hx * 26.0, -hy * 26.0, 1.0));

  // 一个固定的「光源」方向；坡度朝光就亮
  vec3 L = normalize(vec3(0.35, 0.55, 0.75));
  float spec = pow(max(dot(n, L), 0.0), 22.0);

  // 很淡的明暗，让水面有体积感但不抢原图的戏
  float diff = 0.5 + 0.5 * dot(n, L);

  vec3 col = vec3(0.75, 0.92, 1.0) * spec * 0.85
           + vec3(0.35, 0.60, 0.85) * (diff - 0.5) * 0.22;

  // ★ 极低的 alpha：只是给原图「加水」，不是盖住它
  float a = spec * 0.30 + abs(diff - 0.5) * 0.16;
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.42));
}
`;
