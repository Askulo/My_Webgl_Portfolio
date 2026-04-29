// ── FRAGMENT SHADER ────────────────────────────────────────────────────
// Uniforms required (all set from JS side):
//   uResolution  : vec2    viewport px
//   uTime        : float   seconds
//   uIOR         : float   0.01–0.20  refraction strength
//   uChromatic   : float   0.00–0.03  chromatic aberration
//   uClarity     : float   0.00–1.00  1=clear, 0=frosted
//   uDepthBlend  : float   0.00–1.00  depth absorption mix
//   uCausticStr  : float   0.00–1.00  caustic brightness
//   uFlowStr     : float   0.00–1.00  inner flow intensity
//   uCoreWarmth  : float   (unused slot, reserved for tint)
//   uDeepColor   : vec3    deep-volume colour  (e.g. 0.02,0.10,0.28)
//   uShallowColor: vec3    surface colour      (e.g. 0.72,0.94,1.00)
//   uCamPos      : vec3    camera world position

uniform vec2  uResolution;
uniform float uTime;
uniform float uIOR;
uniform float uChromatic;
uniform float uClarity;
uniform float uDepthBlend;
uniform float uCausticStr;
uniform float uFlowStr;
uniform float uCoreWarmth;
uniform vec3  uDeepColor;
uniform vec3  uShallowColor;
uniform vec3  uCamPos;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;
varying vec2 vUv;

// ── Schlick Fresnel ────────────────────────────────────────────────────
float fresnel(vec3 V, vec3 N, float f0) {
  return f0 + (1.0 - f0) * pow(1.0 - clamp(dot(V, N), 0.0, 1.0), 5.0);
}

// ── Hash helpers ───────────────────────────────────────────────────────
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float hash13(vec3 p) {
  p = fract(p * vec3(443.8975, 397.2973, 491.1871));
  p += dot(p.zxy, p.yxz + 19.19);
  return fract(p.x * p.y * p.z);
}

// ── Value noise ────────────────────────────────────────────────────────
float smoothNoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i),           hash13(i+vec3(1,0,0)), f.x),
        mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), f.x), f.y),
    mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), f.x),
        mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), f.x), f.y),
    f.z);
}

// ── 2-octave FBM (inner flow / veins) — optimized for perf ────
float fbmFlow(vec3 p, float t) {
  float f = 0.0;
  f += 0.500 * smoothNoise(p * 2.1 + vec3(t*0.30, t*0.18, t*0.25));
  f += 0.250 * smoothNoise(p * 4.3 - vec3(t*0.50, t*0.35, t*0.40));
  return f;
}

// ── Single-Voronoi caustics — optimized for perf ────────────
float caustics(vec2 p, float t) {
  vec2 p1 = p * 5.5 + t * 0.12;
  vec2 i1 = floor(p1), f1 = fract(p1);
  float md1 = 1.0;
  for (int x=0; x<=1; x++) for (int y=0; y<=1; y++) {
    vec2 n  = vec2(float(x), float(y));
    vec2 pt = n + 0.5 + 0.45*vec2(hash(i1+n), hash(i1+n+vec2(1.7,2.3)));
    md1 = min(md1, length(pt - f1));
  }
  float c1 = pow(1.0 - smoothstep(0.0, 0.55, md1), 2.5);
  return c1;
}

void main() {
  float t = uTime;
  vec3  N = normalize(vWorldNormal);
  vec3  V = normalize(vViewDir);
  vec3  L = normalize(vec3( 2.5,  5.0,  3.5));   // key light dir
  vec3 L2 = normalize(vec3(-2.0,  2.0, -2.5));   // fill light dir

  // ── Depth colour ──────────────────────────────────────────────────────
  float depthT = clamp((vWorldPos.y + 0.75) / 1.5, 0.0, 1.0);
  depthT = mix(depthT, pow(depthT, 2.2), uDepthBlend);
  vec3 baseCol = mix(uDeepColor, uShallowColor, depthT);

  // ── Inner flow veins (FBM) ────────────────────────────────────────────
  float flow = fbmFlow(vWorldPos * 1.8, t);
  flow = smoothstep(0.35, 0.75, flow);

  vec3 flowHot  = vec3(0.92, 0.98, 1.00);  // frozen white core
  vec3 flowWarm = vec3(0.45, 0.82, 1.00);  // ice blue mid
  vec3 flowDeep = vec3(0.04, 0.18, 0.42);  // deep glacier edges
  vec3 flowCol  = mix(flowDeep, mix(flowWarm, flowHot, pow(flow, 2.5)), flow);

  float glow = fbmFlow(vWorldPos * 1.1 - vec3(0.3, 0.1, 0.2), t * 0.6);
  glow = smoothstep(0.3, 0.7, glow);
  vec3 glowCol = vec3(0.30, 0.78, 1.00) * glow * 0.35;

  vec3 coreCol = mix(baseCol, flowCol, flow * uFlowStr * 0.85);
  coreCol += glowCol * uFlowStr;

  // ── Chromatic refraction warp ─────────────────────────────────────────
  float eta  = 1.0 / (1.0 + uIOR * 4.5);
  vec3  refG = refract(-V, N, eta);
  vec3  refR = refract(-V, N, eta - uChromatic);
  vec3  refB = refract(-V, N, eta + uChromatic);

  vec3  samplePos = vWorldPos + N * uIOR * 0.3;
  // Single fbmFlow call for chroma — R/B faked via small arithmetic offset
  // (saves 2/3 of the chromatic noise cost, visually near-identical)
  float flowCenter = fbmFlow((samplePos + refG * 0.12) * 1.8, t);
  float flowR = smoothstep(0.35, 0.75, flowCenter + 0.05);
  float flowG = smoothstep(0.35, 0.75, flowCenter);
  float flowB = smoothstep(0.35, 0.75, flowCenter - 0.05);
  float ca = uFlowStr * uChromatic * 30.0;
  vec3 chromaFlow = vec3(
    mix(baseCol.r, flowHot.r * 0.7 + flowWarm.r * 0.3, flowR * ca),
    mix(baseCol.g, flowHot.g * 0.9 + flowWarm.g * 0.1, flowG * ca),
    mix(baseCol.b, flowHot.b * 1.0,                        flowB * ca)
  );
  coreCol = mix(coreCol, chromaFlow, uChromatic * 20.0);

  // ── Beer-Lambert ice absorption ───────────────────────────────────────
  vec3 absorbColor = vec3(0.05, 0.20, 0.55);
  vec3 absorption  = exp(-absorbColor * 1.2 * uDepthBlend);
  coreCol *= mix(vec3(1.0), absorption + vec3(0.00, 0.08, 0.18), uDepthBlend * 0.35);

  // ── Caustics ──────────────────────────────────────────────────────────
  float topMask  = smoothstep(0.3, 0.85, N.y);
  float caust    = caustics(vWorldPos.xz + vWorldPos.xy * 0.3, t) * (1.0 - topMask) * uCausticStr;
  float caustTop = caustics(vWorldPos.xz * 1.3, t * 0.8)         * topMask * uCausticStr * 0.3;
  vec3  caustCol = vec3(0.65, 0.92, 1.00);
  coreCol += caust    * caustCol * 0.55;
  coreCol += caustTop * caustCol * 0.28;

  // ── Micro-roughness / frosted ─────────────────────────────────────────
  float roughness = 1.0 - uClarity;
  if (roughness > 0.01) { coreCol *= (1.0 - roughness * 0.18); }

  // ── Specular highlights ───────────────────────────────────────────────
  vec3  H1      = normalize(V + L);
  vec3  H2      = normalize(V + L2);
  float spec1   = pow(max(dot(N, H1), 0.0), 400.0) * 4.0;
  float spec2   = pow(max(dot(N, H2), 0.0), 100.0) * 1.1;
  float sparkle = pow(max(dot(N, H1), 0.0), 1500.0) * flow * 6.0;

  // ── Sub-surface scatter (cold cyan backlight) ─────────────────────────
  float sss    = pow(max(dot(V, -L), 0.0), 4.0) * 0.55;
  vec3  sssCol = vec3(0.20, 0.65, 1.00) * sss;

  // ── Fresnel + winter sky reflection ───────────────────────────────────
  float F       = fresnel(V, N, 0.04);
  vec3  skyHigh = vec3(0.75, 0.92, 1.00);
  vec3  skyLow  = vec3(0.05, 0.15, 0.45);
  vec3  skyRefl = mix(skyHigh, skyLow, pow(1.0 - max(V.y, 0.0), 2.0));
  coreCol = mix(coreCol, skyRefl, F * 0.45);

  // ── Frost rim ─────────────────────────────────────────────────────────
  float rim    = pow(1.0 - abs(dot(V, N)), 3.5) * 0.50;
  vec3  rimCol = mix(vec3(0.55, 0.90, 1.00), uShallowColor, 0.4);

  // ── Compose ───────────────────────────────────────────────────────────
  vec3 col = coreCol
           + spec1   * vec3(0.95, 0.98, 1.00)
           + spec2   * vec3(0.70, 0.90, 1.00)
           + sparkle * vec3(0.85, 0.97, 1.00)
           + sssCol
           + rim * rimCol;

  float alpha = clamp(mix(0.72, 0.97, F) + rim * 0.35, 0.0, 1.0);

  // Reinhard tone-map + mild gamma
  col = col / (col + vec3(0.85));
  col = pow(col, vec3(0.90));

  gl_FragColor = vec4(col, alpha);
}