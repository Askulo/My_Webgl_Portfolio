// ── VERTEX SHADER ──────────────────────────────────────────────────────
// Uniforms required on your ShaderMaterial:
//   uBumpStrength : float   (0.0 – 1.0, wave height)
//   uTime         : float   (clock, seconds)

uniform float uBumpStrength;
uniform float uTime;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;
varying vec2 vUv;

// Sum-of-sines surface bump (animated)
float bumpH(vec3 p, float t) {
  return sin(p.x * 8.3  + t * 0.9)  * cos(p.z * 7.1  - t * 0.7)  * 0.50
       + sin(p.x * 4.1  + p.z * 5.7 + t * 1.1)                    * 0.30
       + sin(p.x * 13.0 - p.z * 11.0 + t * 1.7)                   * 0.15
       + sin(p.x * 21.0 + p.z * 17.3 - t * 2.3)                   * 0.08;
}

void main() {
  vUv = uv;

  // World position & normal
  vec4 wPos    = modelMatrix * vec4(position, 1.0);
  vWorldPos    = wPos.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);

  // View direction
  vec3 camW = (inverse(viewMatrix) * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vViewDir  = normalize(camW - vWorldPos);

  // Bump on upward-facing surfaces only (topMask)
  float topMask = smoothstep(0.4, 0.9, normal.y);
  float eps = 0.03;
  float t   = uTime;
  float h   = bumpH(vWorldPos, t);
  float hx  = bumpH(vWorldPos + vec3(eps, 0.0, 0.0), t);
  float hz  = bumpH(vWorldPos + vec3(0.0, 0.0, eps), t);

  vec3 tangent   = vec3(1.0, (hx - h) / eps * uBumpStrength, 0.0);
  vec3 bitangent = vec3(0.0, (hz - h) / eps * uBumpStrength, 1.0);
  vec3 bumpN     = normalize(cross(bitangent, tangent));

  vWorldNormal = normalize(mix(
    vWorldNormal,
    normalize(mat3(modelMatrix) * bumpN),
    topMask * 0.65
  ));

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}