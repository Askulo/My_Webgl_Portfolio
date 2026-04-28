/**
 * SoulShatterEffect
 *
 * The scene fragments into Voronoi-cell "shards" around the cursor.
 * Each shard is offset/rotated independently based on its distance from
 * the mouse, giving a shattered-glass / broken-energy look.
 *
 * Technique:
 *  - Full-screen fragment shader computes nearest Voronoi cell center
 *  - Each cell displaces its UVs by a vector derived from:
 *      • direction from cell center to mouse
 *      • per-cell random rotation (seeded from cell ID)
 *      • proximity to mouse (closer = more displaced)
 *  - Ping-pong targets let the "shatter" linger and decay
 *  - A thin edge-detection pass highlights cell borders with the
 *    scene's existing bloom to make them glow
 *
 * Usage in Experience.tsx (inside <EffectComposer> BEFORE <Bloom>):
 *   <SoulShatterEffect
 *     strength={0.05}
 *     cellCount={18}
 *     shatterRadius={0.35}
 *   />
 */

import { useRef, useMemo, useEffect, FC } from 'react'
import * as THREE from 'three'
import { useThree, useFrame } from '@react-three/fiber'
import { Effect, BlendFunction } from 'postprocessing'
import { wrapEffect } from '@react-three/postprocessing'

// ─── GLSL ────────────────────────────────────────────────────────────────────

// Display pass: reads the shatter displacement map and warps UVs
const SHATTER_FRAG = /* glsl */ `
  uniform sampler2D uShatterMap;
  uniform float     uStrength;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec4  s  = texture2D(uShatterMap, uv);
    vec2  dir = s.rg * 2.0 - 1.0;
    float mag = s.b;

    // Edge highlight: slightly brighten shard borders (feeds into Bloom)
    float edge = s.a;

    vec2 warpUV = uv + dir * mag * uStrength;
    vec4 warped = texture2D(inputBuffer, clamp(warpUV, 0.001, 0.999));

    // Additive edge glow — Bloom will pick this up
    outputColor = warped + vec4(1.0) * edge * 0.15 * mag;
  }
`

const SHATTER_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// Shatter field builder: Voronoi-based displacement
const SHATTER_FIELD_FRAG = /* glsl */ `
  #define CELLS 20

  uniform sampler2D uPrev;
  uniform vec2      uMouse;
  uniform float     uAspect;
  uniform float     uRelax;
  uniform float     uShatterRadius;   // world radius of shatter effect
  uniform float     uActivation;      // 0..1, velocity-scaled
  uniform float     uTime;

  varying vec2 vUv;

  // Deterministic hash → cell center offset
  vec2 cellSeed(vec2 cell) {
    vec2 p = fract(sin(vec2(dot(cell, vec2(127.1, 311.7)),
                            dot(cell, vec2(269.5, 183.3)))) * 43758.5453);
    return p;
  }

  void main() {
    vec4 prev = texture2D(uPrev, vUv) * uRelax;

    // Aspect-corrected UV
    vec2 uvA   = vec2(vUv.x * uAspect, vUv.y);
    vec2 mouseA = vec2(uMouse.x * uAspect, uMouse.y);

    // -- Voronoi: find nearest and second-nearest cell center --
    float scale = float(CELLS);
    vec2 scaledUV = uvA * scale;
    vec2 cellCoord = floor(scaledUV);
    vec2 fracUV    = fract(scaledUV);

    float minDist1 = 1e9, minDist2 = 1e9;
    vec2  nearestCenter = vec2(0.0);
    vec2  nearestCell   = vec2(0.0);

    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        vec2  neighbor = cellCoord + vec2(float(dx), float(dy));
        vec2  seed     = cellSeed(neighbor);
        // Animate seed slightly so cells breathe
        seed += 0.12 * sin(uTime * 0.5 + seed * 6.28);
        vec2  cellCenter = (neighbor + seed - cellCoord + fracUV);
        float d = length(cellCenter - fracUV);

        if (d < minDist1) {
          minDist2 = minDist1;
          minDist1 = d;
          nearestCenter = (neighbor + seed) / scale / uAspect;  // back to UV space
          nearestCenter.x /= 1.0; // already divided by aspect above
          nearestCell = neighbor;
        } else if (d < minDist2) {
          minDist2 = d;
        }
      }
    }

    // Edge = proximity to Voronoi border
    float edge = smoothstep(0.04, 0.0, minDist2 - minDist1);

    // Distance from this cell's center to the mouse
    float distToMouse = length(nearestCenter - uMouse);
    float influence    = smoothstep(uShatterRadius, 0.0, distToMouse) * uActivation;

    // Each cell shards away from the mouse
    vec2 shardDir = normalize(nearestCenter - uMouse + 1e-5);

    // Per-cell random rotation adds chaos
    float angle = cellSeed(nearestCell).x * 6.28;
    mat2 rot    = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    shardDir    = rot * shardDir * 0.3 + shardDir * 0.7;

    vec4 stamp = vec4(shardDir * 0.5 + 0.5, influence, edge * influence);
    stamp *= influence;

    gl_FragColor = max(prev, stamp);
  }
`

// ─── Effect class ─────────────────────────────────────────────────────────────

export class SoulShatterEffectImpl extends Effect {
  constructor(shatterMap: THREE.Texture, strength: number) {
    super('SoulShatterEffect', SHATTER_FRAG, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform<any>>([
        ['uShatterMap', new THREE.Uniform(shatterMap)],
        ['uStrength',   new THREE.Uniform(strength)],
      ]),
    })
  }
  setMap(t: THREE.Texture) { this.uniforms.get('uShatterMap')!.value = t }
  setStrength(v: number)   { this.uniforms.get('uStrength')!.value   = v }
}

const ShatterPass = wrapEffect(SoulShatterEffectImpl)

// ─── Props ────────────────────────────────────────────────────────────────────

export type SoulShatterEffectProps = {
  strength?:       number  // warp strength      default 0.05
  cellCount?:      number  // Voronoi cells (cosmetic only; shader uses #define)
  shatterRadius?:  number  // influence radius   default 0.35
  relaxation?:     number  // fade per frame     default 0.90
}

// ─── Component ────────────────────────────────────────────────────────────────

export const SoulShatterEffect: FC<SoulShatterEffectProps> = ({
  strength      = 0.05,
  cellCount     = 18,
  shatterRadius = 0.35,
  relaxation    = 0.90,
}) => {
  const { size } = useThree()

  const makeRT = (w: number, h: number) =>
    new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: false, format: THREE.RGBAFormat, type: THREE.HalfFloatType,
    })

  const rtA = useMemo(() => makeRT(size.width, size.height), [])  // eslint-disable-line
  const rtB = useMemo(() => makeRT(size.width, size.height), [])  // eslint-disable-line
  const readTarget  = useRef(rtA)
  const writeTarget = useRef(rtB)

  const fieldScene  = useMemo(() => new THREE.Scene(), [])
  const fieldCamera = useMemo(() => {
    const c = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1)
    c.position.z = 0.5
    return c
  }, [])

  const fieldMat = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader:   SHATTER_VERT,
      fragmentShader: SHATTER_FIELD_FRAG,
      uniforms: {
        uPrev:          { value: rtA.texture },
        uMouse:         { value: new THREE.Vector2(0.5, 0.5) },
        uAspect:        { value: size.width / size.height },
        uRelax:         { value: relaxation },
        uShatterRadius: { value: shatterRadius },
        uActivation:    { value: 0 },
        uTime:          { value: 0 },
      },
      depthTest: false, depthWrite: false,
    })
    fieldScene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat))
    return mat
  }, [])  // eslint-disable-line

  useEffect(() => { fieldMat.uniforms.uRelax.value         = relaxation    }, [relaxation,    fieldMat])
  useEffect(() => { fieldMat.uniforms.uShatterRadius.value = shatterRadius }, [shatterRadius, fieldMat])
  useEffect(() => {
    rtA.setSize(size.width, size.height)
    rtB.setSize(size.width, size.height)
    fieldMat.uniforms.uAspect.value = size.width / size.height
  }, [size.width, size.height, fieldMat])  // eslint-disable-line

  const mouse     = useRef(new THREE.Vector2(0.5, 0.5))
  const prevMouse = useRef(new THREE.Vector2(0.5, 0.5))

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

  const effectRef = useRef<SoulShatterEffectImpl>(null)

  useEffect(() => () => {
    rtA.dispose(); rtB.dispose(); fieldMat.dispose()
  }, [])  // eslint-disable-line

  useFrame(({ gl: renderer, clock }) => {
    const velocity = mouse.current.distanceTo(prevMouse.current)

    fieldMat.uniforms.uPrev.value       = readTarget.current.texture
    fieldMat.uniforms.uMouse.value.copy(mouse.current)
    fieldMat.uniforms.uActivation.value = Math.min(velocity * 12.0, 1.0)
    fieldMat.uniforms.uTime.value       = clock.getElapsedTime()

    prevMouse.current.copy(mouse.current)

    const savedTarget    = renderer.getRenderTarget()
    const savedAutoClear = renderer.autoClear
    renderer.setRenderTarget(writeTarget.current)
    renderer.autoClear = true; renderer.clear()
    renderer.autoClear = false
    renderer.render(fieldScene, fieldCamera)
    renderer.setRenderTarget(savedTarget)
    renderer.autoClear = savedAutoClear

    const tmp           = readTarget.current
    readTarget.current  = writeTarget.current
    writeTarget.current = tmp

    effectRef.current?.setMap(readTarget.current.texture)
    effectRef.current?.setStrength(strength)
  }, 1)

  return (
    <ShatterPass
      ref={effectRef}
      args={[readTarget.current.texture, strength]}
    />
  )
}
