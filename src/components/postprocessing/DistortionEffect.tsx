import { forwardRef, useMemo } from 'react'
import { Effect } from 'postprocessing'
import * as THREE from 'three'
import { Uniform } from 'three'
import { wrapEffect } from '@react-three/postprocessing'

// ------------------------------------------------------------------
// Core Effect class (postprocessing-compatible)
// ------------------------------------------------------------------
const fragmentShader = /* glsl */ `
uniform float u_time;
uniform float u_progress;
uniform float u_scale;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 p = 2.0 * uv - 1.0;
  p += 0.1 * cos(u_scale * 3.7 * p.yx + 1.4 * u_time + vec2(2.2, 3.4));
  p += 0.1 * cos(u_scale * 3.0 * p.yx + 1.0 * u_time + vec2(1.2, 3.4));
  p += 0.3 * cos(u_scale * 5.0 * p.yx + 2.6 * u_time + vec2(4.2, 1.4));
  p += 0.3 * cos(u_scale * 7.5 * p.yx + 3.6 * u_time + vec2(12.2, 3.4));

  vec2 distortedUV;
  distortedUV.x = mix(uv.x, length(p), u_progress);
  distortedUV.y = mix(uv.y, 0.5 * length(p) + 0.15, u_progress);

  outputColor = texture2D(inputBuffer, distortedUV);
}
`

class DistortionEffectImpl extends Effect {
  constructor({
    progress = 0,
    scale = 1,
  }: {
    progress?: number
    scale?: number
  } = {}) {
    super('DistortionEffect', fragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['u_time',     new Uniform(0)],
        ['u_progress', new Uniform(progress)],
        ['u_scale',    new Uniform(scale)],
      ]),
    })
  }

  update(_renderer: THREE.WebGLRenderer, _inputBuffer: THREE.WebGLRenderTarget, deltaTime: number) {
    const u_time = this.uniforms.get('u_time')!
    u_time.value += deltaTime
  }
}

// ------------------------------------------------------------------
// React component — drop inside <EffectComposer>
// ------------------------------------------------------------------
export type DistortionEffectProps = {
  /** 0 = no distortion, 1 = full warp */
  progress?: number
  /** Controls the frequency of the distortion pattern */
  scale?: number
}

/**
 * Drop-in distortion post-process effect for @react-three/postprocessing.
 *
 * Usage:
 * ```tsx
 * <EffectComposer>
 *   <DistortionEffect progress={0.4} scale={1.2} />
 * </EffectComposer>
 * ```
 */
export const DistortionEffect = wrapEffect(DistortionEffectImpl)
