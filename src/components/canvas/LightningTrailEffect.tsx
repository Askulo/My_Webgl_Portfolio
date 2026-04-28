/**
 * LightningTrailEffect
 *
 * Instead of ripple distortion, this effect draws crackling electric arc trails
 * that follow the mouse. Works beautifully with the electrified figure scene.
 *
 * Technique:
 *  - Stores N trail points in a circular buffer (mouse path)
 *  - Each frame renders trail segments as UV-space distortion "bolts"
 *  - Fragment shader uses layered domain-warped FBM noise to make
 *    each segment look like an electric arc rather than a smooth line
 *  - The distortion warp makes the scene "zap" along the mouse path
 *
 * Usage in Experience.tsx (inside <EffectComposer> BEFORE <Bloom>):
 *   <LightningTrailEffect
 *     strength={0.06}
 *     trailLength={24}
 *     arcIntensity={0.8}
 *   />
 */

import { useRef, useMemo, useEffect, FC } from 'react'
import * as THREE from 'three'
import { useThree, useFrame } from '@react-three/fiber'
import { Effect, BlendFunction } from 'postprocessing'
import { wrapEffect } from '@react-three/postprocessing'

// ─── GLSL ────────────────────────────────────────────────────────────────────

const LIGHTNING_FRAG = /* glsl */ `
  uniform sampler2D uTrailMap;   // RGB: accumulated arc distortion field
  uniform float     uStrength;
  uniform float     uTime;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec4 trail = texture2D(uTrailMap, uv);

    // RG encodes warp direction, B encodes intensity
    vec2 dir    = trail.rg * 2.0 - 1.0;
    float mag   = trail.b;

    // Add a tiny time-animated jitter so arcs crackle even when mouse is still
    float jitter = mag * 0.003 * sin(uTime * 40.0 + uv.x * 80.0);
    vec2 warpUV = uv + dir * mag * uStrength + vec2(jitter, -jitter);

    outputColor = texture2D(inputBuffer, clamp(warpUV, 0.001, 0.999));
  }
`

const TRAIL_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// Arc field shader: given N trail segments, builds a distortion field.
// Each segment contributes a "bolt" — a thin electric arc with FBM noise.
const TRAIL_FRAG = /* glsl */ `
  #define MAX_TRAIL 32

  uniform sampler2D uPrev;
  uniform vec2      uTrail[MAX_TRAIL];   // trail positions in 0..1 UV space
  uniform int       uTrailCount;
  uniform float     uAspect;
  uniform float     uRelax;             // fade per frame
  uniform float     uTime;
  uniform float     uArcIntensity;

  varying vec2 vUv;

  // Hash for noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // 2D value noise
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1,0)), f.x),
      mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x),
      f.y
    );
  }

  // FBM: 3 octaves for arc texture
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * noise(p);
      p  = p * 2.1 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  // Signed distance to a line segment (aspect-corrected)
  float sdSegment(vec2 p, vec2 a, vec2 b, float aspect) {
    p.x   *= aspect; a.x *= aspect; b.x *= aspect;
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
  }

  void main() {
    vec4 prev = texture2D(uPrev, vUv) * uRelax;

    vec4 arc = vec4(0.0);

    for (int i = 0; i < MAX_TRAIL - 1; i++) {
      if (i >= uTrailCount - 1) break;

      vec2 a = uTrail[i];
      vec2 b = uTrail[i + 1];

      // Skip degenerate segments
      if (length(a - b) < 0.001) continue;

      float d = sdSegment(vUv, a, b, uAspect);

      // Arc core: very thin
      float core = smoothstep(0.008, 0.0, d);

      // Arc fringe: wider, noisy — gives the "electric" look
      float noiseVal = fbm(vUv * 12.0 + uTime * 2.0);
      float fringeD  = d - noiseVal * 0.01;
      float fringe   = smoothstep(0.025, 0.003, fringeD) * 0.4;

      float intensity = (core + fringe) * uArcIntensity;

      // Direction = perpendicular to segment, noisy
      vec2 seg = normalize(b - a + 1e-5);
      vec2 perp = vec2(-seg.y, seg.x);
      perp += (noiseVal - 0.5) * 0.6;
      perp = normalize(perp);

      vec4 stamp = vec4(perp * 0.5 + 0.5, intensity, 1.0) * intensity;
      arc = max(arc, stamp);
    }

    gl_FragColor = max(prev, arc);
  }
`

// ─── Effect class ─────────────────────────────────────────────────────────────

export class LightningTrailEffectImpl extends Effect {
  constructor(trailMap: THREE.Texture, strength: number) {
    super('LightningTrailEffect', LIGHTNING_FRAG, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform<any>>([
        ['uTrailMap', new THREE.Uniform(trailMap)],
        ['uStrength', new THREE.Uniform(strength)],
        ['uTime',     new THREE.Uniform(0)],
      ]),
    })
  }
  update(_r: any, _i: any, dt: number) {
    (this.uniforms.get('uTime')!.value as number) += dt
  }
  setMap(t: THREE.Texture)  { this.uniforms.get('uTrailMap')!.value = t }
  setStrength(v: number)    { this.uniforms.get('uStrength')!.value = v }
}

const LightningPass = wrapEffect(LightningTrailEffectImpl)

// ─── Props ────────────────────────────────────────────────────────────────────

export type LightningTrailEffectProps = {
  strength?:     number   // warp strength,    default 0.06
  trailLength?:  number   // history points,   default 24
  relaxation?:   number   // fade per frame,   default 0.88
  arcIntensity?: number   // arc brightness,   default 0.9
}

// ─── Component ────────────────────────────────────────────────────────────────

export const LightningTrailEffect: FC<LightningTrailEffectProps> = ({
  strength     = 0.06,
  trailLength  = 24,
  relaxation   = 0.88,
  arcIntensity = 0.9,
}) => {
  const { size } = useThree()
  const MAX_TRAIL = 32  // must match GLSL #define

  const makeRT = (w: number, h: number) =>
    new THREE.WebGLRenderTarget(w, h, {
      minFilter:   THREE.LinearFilter,
      magFilter:   THREE.LinearFilter,
      depthBuffer: false,
      format:      THREE.RGBAFormat,
      type:        THREE.HalfFloatType,
    })

  const rtA = useMemo(() => makeRT(size.width, size.height), [])  // eslint-disable-line
  const rtB = useMemo(() => makeRT(size.width, size.height), [])  // eslint-disable-line
  const readTarget  = useRef(rtA)
  const writeTarget = useRef(rtB)

  const trailScene  = useMemo(() => new THREE.Scene(), [])
  const trailCamera = useMemo(() => {
    const c = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1)
    c.position.z = 0.5
    return c
  }, [])

  // Build flat array for the uniform (MAX_TRAIL × vec2)
  const trailUniformArray = useMemo(
    () => Array.from({ length: MAX_TRAIL }, () => new THREE.Vector2(0.5, 0.5)),
    []
  )

  const trailMat = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader:   TRAIL_VERT,
      fragmentShader: TRAIL_FRAG,
      uniforms: {
        uPrev:         { value: rtA.texture },
        uTrail:        { value: trailUniformArray },
        uTrailCount:   { value: 0 },
        uAspect:       { value: size.width / size.height },
        uRelax:        { value: relaxation },
        uTime:         { value: 0 },
        uArcIntensity: { value: arcIntensity },
      },
      depthTest:  false,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
    trailScene.add(mesh)
    return mat
  }, [])  // eslint-disable-line

  useEffect(() => { trailMat.uniforms.uRelax.value        = relaxation   }, [relaxation,   trailMat])
  useEffect(() => { trailMat.uniforms.uArcIntensity.value = arcIntensity }, [arcIntensity, trailMat])
  useEffect(() => {
    rtA.setSize(size.width, size.height)
    rtB.setSize(size.width, size.height)
    trailMat.uniforms.uAspect.value = size.width / size.height
  }, [size.width, size.height, trailMat])  // eslint-disable-line

  // Trail circular buffer
  const trail     = useRef<THREE.Vector2[]>([])
  const mouse     = useRef(new THREE.Vector2(0.5, 0.5))

  useEffect(() => {
    const onMove = (e: MouseEvent) =>
      mouse.current.set(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight)
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0]
      mouse.current.set(t.clientX / window.innerWidth, 1 - t.clientY / window.innerHeight)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('touchmove',  onTouch, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchmove',  onTouch)
    }
  }, [])

  const effectRef = useRef<LightningTrailEffectImpl>(null)
  const timeRef   = useRef(0)

  useEffect(() => () => {
    rtA.dispose(); rtB.dispose(); trailMat.dispose()
  }, [])  // eslint-disable-line

  useFrame(({ gl: renderer, clock }) => {
    timeRef.current = clock.getElapsedTime()

    // Push new mouse position to trail
    const last = trail.current[0]
    if (!last || last.distanceTo(mouse.current) > 0.004) {
      trail.current.unshift(mouse.current.clone())
      if (trail.current.length > trailLength) trail.current.pop()
    }

    // Write trail into uniform array
    const count = Math.min(trail.current.length, MAX_TRAIL)
    for (let i = 0; i < count; i++) {
      trailUniformArray[i].copy(trail.current[i])
    }

    trailMat.uniforms.uPrev.value       = readTarget.current.texture
    trailMat.uniforms.uTrailCount.value = count
    trailMat.uniforms.uTime.value       = timeRef.current

    const savedTarget    = renderer.getRenderTarget()
    const savedAutoClear = renderer.autoClear

    renderer.setRenderTarget(writeTarget.current)
    renderer.autoClear = true
    renderer.clear()
    renderer.autoClear = false
    renderer.render(trailScene, trailCamera)

    renderer.setRenderTarget(savedTarget)
    renderer.autoClear = savedAutoClear

    const tmp           = readTarget.current
    readTarget.current  = writeTarget.current
    writeTarget.current = tmp

    effectRef.current?.setMap(readTarget.current.texture)
    effectRef.current?.setStrength(strength)
  }, 1)

  return (
    <LightningPass
      ref={effectRef}
      args={[readTarget.current.texture, strength]}
    />
  )
}
