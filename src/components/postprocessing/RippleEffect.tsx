import { forwardRef, useMemo, useEffect, useRef } from 'react'
import { Effect } from 'postprocessing'
import * as THREE from 'three'
import { Uniform } from 'three'
import { useTexture } from '@react-three/drei'
import { useThree, useFrame } from '@react-three/fiber'
import { wrapEffect } from '@react-three/postprocessing'
import { RippleRenderer } from './ripple'

// ------------------------------------------------------------------
// Fragment shader — reads the ripple displacement texture produced
// by RippleRenderer and uses it to offset UV lookups.
// ------------------------------------------------------------------
const fragmentShader = /* glsl */ `
uniform sampler2D u_displacement;

#define PI 3.141592653589793

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec4 disp  = texture2D(u_displacement, uv);
  float theta = disp.r * 2.0 * PI;
  vec2  dir   = vec2(sin(theta), cos(theta));
  vec2  warpedUV = uv + dir * disp.r * u_strength;

  outputColor = texture2D(inputBuffer, warpedUV);
}
`

// ------------------------------------------------------------------
// Core Effect class
// ------------------------------------------------------------------
class RippleEffectImpl extends Effect {
  constructor({ strength = 0.1 }: { strength?: number } = {}) {
    super('RippleEffect', fragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['u_displacement', new Uniform(null)],
        ['u_strength',     new Uniform(strength)],
      ]),
    })
  }

  /** Called every frame by postprocessing — hand off the renderer */
  updateDisplacement(gl: THREE.WebGLRenderer, rippleRenderer: RippleRenderer) {
    rippleRenderer.update(gl, this.uniforms.get('u_displacement')!)
  }
}

// ------------------------------------------------------------------
// Public props
// ------------------------------------------------------------------
export type RippleEffectProps = {
  /** Path to the brush / ripple stamp texture */
  brushTexturePath: string
  /** How strongly ripples warp the image (maps to u_strength) */
  strength?: number
  /** Maximum simultaneous ripple stamps (passed to RippleRenderer) */
  maxRipples?: number
}

// ------------------------------------------------------------------
// React component
// ------------------------------------------------------------------
/**
 * Mouse-driven ripple post-process effect for @react-three/postprocessing.
 *
 * Requires a brush texture (e.g. a soft radial white-on-black PNG).
 *
 * Usage:
 * ```tsx
 * <EffectComposer>
 *   <RippleEffect brushTexturePath="/textures/brush.png" strength={0.1} />
 * </EffectComposer>
 * ```
 */
export const RippleEffect = forwardRef<RippleEffectImpl, RippleEffectProps>(
  function RippleEffect({ brushTexturePath, strength = 0.1, maxRipples = 100 }, ref) {
    const brushTexture = useTexture(brushTexturePath)
    const { gl } = useThree()

    // Build the RippleRenderer once (it owns the off-screen render target)
    const rippleRenderer = useMemo(
      () => new RippleRenderer(brushTexture, maxRipples),
      [brushTexture, maxRipples],
    )

    // Build (or rebuild) the Effect instance
    const effect = useMemo(() => new RippleEffectImpl({ strength }), [strength])

    // Keep strength uniform in sync if prop changes
    useEffect(() => {
      effect.uniforms.get('u_strength')!.value = strength
    }, [effect, strength])

    // Dispose on unmount
    useEffect(() => () => { rippleRenderer.dispose(); effect.dispose() }, [rippleRenderer, effect])

    // Drive the ripple renderer every frame
    useFrame(() => {
      effect.updateDisplacement(gl, rippleRenderer)
    }, -1) // priority -1 → runs before postprocessing's own render pass

    // Expose the Effect instance via ref so EffectComposer can consume it
    useEffect(() => {
      if (ref) {
        if (typeof ref === 'function') ref(effect)
        else (ref as React.MutableRefObject<RippleEffectImpl | null>).current = effect
      }
    }, [effect, ref])

    return null
  },
)
