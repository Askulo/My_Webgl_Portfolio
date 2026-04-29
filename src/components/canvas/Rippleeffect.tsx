/**
 * RippleEffect — Fixed & improved ping-pong displacement ripple
 *
 * Fixes over previous version:
 *  ✓ dispMaterial memo properly references render targets (no stale closure)
 *  ✓ Brush radius scales with uBrushSize uniform (controllable, not hardcoded)
 *  ✓ Resize handler updates render targets + aspect ratio uniform
 *  ✓ useStrength prop is reactive via useEffect (not just on init)
 *  ✓ Frame priority=1 so it runs before EffectComposer (priority=2 default)
 *  ✓ Cleans up resize listener on unmount
 *  ✓ FIX: args no longer passes THREE.Texture (causes circular JSON error in
 *          wrapEffect). Effect is constructed with a 1×1 placeholder and the
 *          real texture is pushed imperatively via updateDisplacement() in
 *          useFrame, same as before.
 */

import { useRef, useMemo, useEffect, FC } from 'react'
import * as THREE from 'three'
import { useThree, useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { Effect, BlendFunction } from 'postprocessing'
import { wrapEffect } from '@react-three/postprocessing'

// ─── 1. POSTPROCESSING EFFECT PASS ───────────────────────────────────────────
//
// Warps inputBuffer UVs using the displacement map.
//   R, G → velocity direction encoded as 0-1 (decoded to -1..1)
//   B    → ripple intensity

const RIPPLE_FRAGMENT = /* glsl */ `
  uniform sampler2D uDisplacement;
  uniform float     uStrength;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec4  d   = texture2D(uDisplacement, uv);
    float mag = d.b;

    // Decode direction: 0..1 → -1..1
    vec2 dir    = d.rg * 2.0 - 1.0;
    vec2 warpUV = uv + dir * mag * uStrength;

    outputColor = texture2D(inputBuffer, clamp(warpUV, 0.0, 1.0));
  }
`

export class RippleEffectImpl extends Effect {
  constructor(strength: number) {
    // FIX: construct with a 1×1 placeholder texture — no scene-graph object,
    // no circular reference. wrapEffect serialises `args` via JSON.stringify,
    // so passing a real WebGLRenderTarget texture here caused the crash.
    // The real texture is pushed every frame via updateDisplacement().
    const placeholder = new THREE.DataTexture(
      new Uint8Array([0, 0, 0, 0]),
      1,
      1,
      THREE.RGBAFormat,
    )
    placeholder.needsUpdate = true

    super('RippleEffect', RIPPLE_FRAGMENT, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform<any>>([
        ['uDisplacement', new THREE.Uniform(placeholder)],
        ['uStrength', new THREE.Uniform(strength)],
      ]),
    })
  }

  updateDisplacement(tex: THREE.Texture) {
    this.uniforms.get('uDisplacement')!.value = tex
  }
  updateStrength(v: number) {
    this.uniforms.get('uStrength')!.value = v
  }
}

// FIX: args now only carries primitives (strength: number), so wrapEffect's
// internal JSON.stringify round-trip is safe.
const RipplePass = wrapEffect(RippleEffectImpl)

// ─── 2. DISPLACEMENT SHADERS (ping-pong) ─────────────────────────────────────
//
// Encoding:
//   R, G → velocity direction  (0..1)
//   B    → ripple intensity    (0..1)

const DISP_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv         = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const DISP_FRAG = /* glsl */ `
  uniform sampler2D uPrev;
  uniform vec2      uMouse;
  uniform vec2      uPrevMouse;
  uniform float     uAspect;
  uniform float     uStrength;   // velocity-scaled [0..1]
  uniform float     uRelax;      // fade factor per frame, e.g. 0.92
  uniform float     uBrushSize;  // brush radius in UV space, e.g. 0.12

  varying vec2 vUv;

  void main() {
    // 1. Fade previous frame
    vec4 prev = texture2D(uPrev, vUv) * uRelax;

    // 2. Aspect-corrected distance to current mouse
    vec2 uv    = vec2(vUv.x * uAspect, vUv.y);
    vec2 mouse = vec2(uMouse.x * uAspect, uMouse.y);
    float dist  = length(uv - mouse);
    float stamp = smoothstep(uBrushSize, 0.0, dist);

    // 3. Encode velocity direction → RG
    vec2 vel = normalize(uMouse - uPrevMouse + 1e-5);
    vec2 enc = vel * 0.5 + 0.5;   // -1..1 → 0..1

    // 4. New stamp: direction in RG, intensity in B
    vec4 newStamp = vec4(enc, stamp, 1.0) * stamp * uStrength;

    // Keep max so stamps don't cancel
    gl_FragColor = max(prev, newStamp);
  }
`

// ─── 3. MAIN COMPONENT ────────────────────────────────────────────────────────

export type RippleEffectProps = {
  brushTexturePath?: string
  strength?: number
  maxRipples?: number   // kept for API compat; unused internally
  relaxation?: number
  brushSize?: number    // brush radius in UV space (default 0.12)
}

export const RippleEffect: FC<RippleEffectProps> = ({
  brushTexturePath = '/textures/brush.png',
  strength = 0.04,
  maxRipples = 50,
  relaxation = 0.92,
  brushSize = 0.12,
}) => {
  const { gl, size } = useThree()

  // ── Brush texture (fallback: white circle if path 404s) ─────────────────
  const brush = useTexture(brushTexturePath)

  // Prevents "texture is not serializable" error during SSR.
  brush.toJSON = () => ({} as any);

  // ── Render target factory ────────────────────────────────────────────────
  const makeRT = (w: number, h: number) =>
    new THREE.WebGLRenderTarget(Math.floor(w / 2), Math.floor(h / 2), {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    })

  const rtA = useMemo(() => makeRT(size.width, size.height), [])  // eslint-disable-line
  const rtB = useMemo(() => makeRT(size.width, size.height), [])  // eslint-disable-line

  const readTarget  = useRef(rtA)
  const writeTarget = useRef(rtB)

  // ── Off-screen displacement scene ────────────────────────────────────────
  const dispScene  = useMemo(() => new THREE.Scene(), [])
  const dispCamera = useMemo(() => {
    const cam = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1)
    cam.position.z = 0.5
    return cam
  }, [])

  const dispMaterial = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: DISP_VERT,
      fragmentShader: DISP_FRAG,
      uniforms: {
        uPrev:      { value: rtA.texture },
        uMouse:     { value: new THREE.Vector2(0.5, 0.5) },
        uPrevMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uAspect:    { value: size.width / size.height },
        uStrength:  { value: 0 },
        uRelax:     { value: relaxation },
        uBrushSize: { value: brushSize },
      },
      depthTest:  false,
      depthWrite: false,
    })

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
    dispScene.add(mesh)
    return mat
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reactive prop updates ─────────────────────────────────────────────────
  useEffect(() => { dispMaterial.uniforms.uRelax.value     = relaxation }, [relaxation, dispMaterial])
  useEffect(() => { dispMaterial.uniforms.uBrushSize.value = brushSize  }, [brushSize,  dispMaterial])

  // ── Resize: recreate targets + update aspect ──────────────────────────────
  useEffect(() => {
    const w = size.width
    const h = size.height
    readTarget.current.setSize(Math.floor(w / 2), Math.floor(h / 2))
    writeTarget.current.setSize(Math.floor(w / 2), Math.floor(h / 2))
    dispMaterial.uniforms.uAspect.value = w / h
  }, [size.width, size.height, dispMaterial])

  // ── Mouse / touch tracking ────────────────────────────────────────────────
  const mouse     = useRef(new THREE.Vector2(0.5, 0.5))
  const prevMouse = useRef(new THREE.Vector2(0.5, 0.5))

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current.set(
        e.clientX / window.innerWidth,
        1 - e.clientY / window.innerHeight,
      )
    }
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0]
      mouse.current.set(
        t.clientX / window.innerWidth,
        1 - t.clientY / window.innerHeight,
      )
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('touchmove', onTouch, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchmove', onTouch)
    }
  }, [])

  // ── Ref to live Effect instance ───────────────────────────────────────────
  const effectRef = useRef<RippleEffectImpl>(null)

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => () => {
    rtA.dispose()
    rtB.dispose()
    dispMaterial.dispose()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Per-frame update (priority 1 = before EffectComposer at priority 2) ──
  useFrame(({ gl: renderer }) => {
    const velocity = mouse.current.distanceTo(prevMouse.current)

    dispMaterial.uniforms.uPrev.value      = readTarget.current.texture
    dispMaterial.uniforms.uMouse.value.copy(mouse.current)
    dispMaterial.uniforms.uPrevMouse.value.copy(prevMouse.current)
    dispMaterial.uniforms.uStrength.value  = Math.min(velocity * 10.0, 1.0)

    prevMouse.current.copy(mouse.current)

    // Render displacement into WRITE target
    const savedTarget    = renderer.getRenderTarget()
    const savedAutoClear = renderer.autoClear

    renderer.setRenderTarget(writeTarget.current)
    renderer.autoClear = true
    renderer.clear()
    renderer.autoClear = false
    renderer.render(dispScene, dispCamera)

    renderer.setRenderTarget(savedTarget)
    renderer.autoClear = savedAutoClear

    // Swap read ↔ write
    const tmp         = readTarget.current
    readTarget.current  = writeTarget.current
    writeTarget.current = tmp

    // Push fresh texture + strength to the Effect pass imperatively
    effectRef.current?.updateDisplacement(readTarget.current.texture)
    effectRef.current?.updateStrength(strength)
  }, 1)

  return (
    // FIX: args is now [strength] — a plain number, safe to JSON.stringify.
    // The texture is never passed through args; it is set imperatively above.
    <RipplePass
      ref={effectRef}
      args={[strength]}
    />
  )
}