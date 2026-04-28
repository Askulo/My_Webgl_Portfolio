/**
 * EtherealPulseEffect
 *
 * On every click/tap, a shockwave ring expands outward from that point.
 * Multiple pulses coexist and decay independently — like dropping stones
 * in water, but each pulse is a sharp energy ring rather than a smooth ripple.
 *
 * Technique:
 *  - Stores up to MAX_PULSES active pulses (origin + birth time)
 *  - Fragment shader computes signed distance to each expanding ring
 *  - Ring thickness is paper-thin (sdf shell) → sharp shockwave look
 *  - Displacement is radially outward, falling off as ring expands
 *  - Works without ping-pong (each pulse is computed analytically per frame)
 *    so there's no render target jitter or resize complexity
 *
 * Usage in Experience.tsx (inside <EffectComposer> BEFORE <Bloom>):
 *   <EtherealPulseEffect
 *     strength={0.08}
 *     pulseDuration={1.2}
 *     ringThickness={0.012}
 *   />
 */

import { useRef, useMemo, useEffect, FC } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Effect, BlendFunction } from 'postprocessing'
import { wrapEffect } from '@react-three/postprocessing'

const MAX_PULSES = 8  // max simultaneous shockwaves

// ─── GLSL ────────────────────────────────────────────────────────────────────

const PULSE_FRAG = /* glsl */ `
  #define MAX_PULSES 8

  uniform vec3  uPulses[MAX_PULSES];   // .xy = origin (0..1), .z = age (0..1)
  uniform int   uPulseCount;
  uniform float uStrength;
  uniform float uAspect;
  uniform float uRingThickness;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 totalDisp = vec2(0.0);

    for (int i = 0; i < MAX_PULSES; i++) {
      if (i >= uPulseCount) break;

      vec2  origin = uPulses[i].xy;
      float age    = uPulses[i].z;    // 0=just born, 1=dead

      // Age easing: fast expand, slow fade
      float radius   = age * age * 0.8;         // ring expands 0 → 0.8 UV
      float falloff  = 1.0 - smoothstep(0.3, 1.0, age);  // fade after 30% life

      // Aspect-corrected distance to ring
      vec2 uvA = vec2(uv.x * uAspect, uv.y);
      vec2 orgA = vec2(origin.x * uAspect, origin.y);
      float dist = length(uvA - orgA);

      // Signed distance to ring shell
      float ringDist = abs(dist - radius);
      float ring     = smoothstep(uRingThickness, 0.0, ringDist);

      // Sharp inner shock + softer outer wash
      float innerShock = smoothstep(radius + uRingThickness * 2.0, radius, dist) * 0.3;
      float total      = (ring + innerShock) * falloff;

      // Radial outward displacement
      vec2 radial = normalize(uv - origin + 1e-5);
      totalDisp += radial * total;
    }

    vec2 warpUV = uv + totalDisp * uStrength;
    outputColor = texture2D(inputBuffer, clamp(warpUV, 0.001, 0.999));
  }
`

// ─── Effect class ─────────────────────────────────────────────────────────────

export class EtherealPulseEffectImpl extends Effect {
  constructor(strength: number, aspect: number, ringThickness: number) {
    const pulseData = Array.from({ length: MAX_PULSES }, () => new THREE.Vector3(0.5, 0.5, 2))

    super('EtherealPulseEffect', PULSE_FRAG, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform<any>>([
        ['uPulses',        new THREE.Uniform(pulseData)],
        ['uPulseCount',    new THREE.Uniform(0)],
        ['uStrength',      new THREE.Uniform(strength)],
        ['uAspect',        new THREE.Uniform(aspect)],
        ['uRingThickness', new THREE.Uniform(ringThickness)],
      ]),
    })
  }

  setPulses(pulses: THREE.Vector3[], count: number) {
    const arr = this.uniforms.get('uPulses')!.value as THREE.Vector3[]
    for (let i = 0; i < count; i++) arr[i].copy(pulses[i])
    this.uniforms.get('uPulseCount')!.value = count
  }

  setStrength(v: number)      { this.uniforms.get('uStrength')!.value      = v }
  setAspect(v: number)        { this.uniforms.get('uAspect')!.value         = v }
  setThickness(v: number)     { this.uniforms.get('uRingThickness')!.value  = v }
}

const PulsePass = wrapEffect(EtherealPulseEffectImpl)

// ─── Pulse state ──────────────────────────────────────────────────────────────

interface Pulse {
  origin: THREE.Vector2
  birthTime: number
}

// ─── Props ────────────────────────────────────────────────────────────────────

export type EtherealPulseEffectProps = {
  strength?:      number   // warp strength         default 0.08
  pulseDuration?: number   // seconds per pulse     default 1.2
  ringThickness?: number   // ring SDF thickness    default 0.012
}

// ─── Component ────────────────────────────────────────────────────────────────

export const EtherealPulseEffect: FC<EtherealPulseEffectProps> = ({
  strength      = 0.08,
  pulseDuration = 1.2,
  ringThickness = 0.012,
}) => {
  const pulses    = useRef<Pulse[]>([])
  const effectRef = useRef<EtherealPulseEffectImpl>(null)

  // Reusable Vector3 array (avoids allocation per frame)
  const uniformData = useMemo(
    () => Array.from({ length: MAX_PULSES }, () => new THREE.Vector3()),
    []
  )

  // Click/tap → spawn new pulse
  useEffect(() => {
    const spawn = (x: number, y: number, t: number) => {
      pulses.current.push({
        origin:    new THREE.Vector2(x / window.innerWidth, 1 - y / window.innerHeight),
        birthTime: t,
      })
      // Trim to MAX_PULSES
      if (pulses.current.length > MAX_PULSES) pulses.current.shift()
    }

    const onClick  = (e: MouseEvent)  => spawn(e.clientX, e.clientY, performance.now() / 1000)
    const onTouch  = (e: TouchEvent)  => {
      const t = e.touches[0]
      spawn(t.clientX, t.clientY, performance.now() / 1000)
    }

    window.addEventListener('click',      onClick)
    window.addEventListener('touchstart', onTouch, { passive: true })
    return () => {
      window.removeEventListener('click',      onClick)
      window.removeEventListener('touchstart', onTouch)
    }
  }, [])

  // Keep aspect reactive on resize
  useEffect(() => {
    const onResize = () => effectRef.current?.setAspect(window.innerWidth / window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useFrame(({ clock }) => {
    const now = clock.getElapsedTime()

    // Expire dead pulses
    pulses.current = pulses.current.filter(p => (now - p.birthTime) < pulseDuration)

    const count = pulses.current.length
    for (let i = 0; i < count; i++) {
      const p   = pulses.current[i]
      const age = (now - p.birthTime) / pulseDuration
      uniformData[i].set(p.origin.x, p.origin.y, age)
    }

    effectRef.current?.setPulses(uniformData, count)
    effectRef.current?.setStrength(strength)
    effectRef.current?.setThickness(ringThickness)
  }, 1)

  return (
    <PulsePass
      ref={effectRef}
      args={[strength, window.innerWidth / window.innerHeight, ringThickness]}
    />
  )
}
