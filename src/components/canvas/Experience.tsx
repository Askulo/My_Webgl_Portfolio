import { Canvas, useThree } from '@react-three/fiber';
import Scene from './Scene';
import Lights from './Lights';
import { Loader } from '@react-three/drei';
import { Suspense, useEffect } from 'react';
import * as THREE from 'three'
import { RippleEffect } from './Rippleeffect';
import { EffectComposer } from '@react-three/postprocessing';
import { DistortionEffect } from '../postprocessing/DistortionEffect';

function DebugBridge() {
  const { gl } = useThree()
  useEffect(() => {
    (window as any).renderer = gl
    return () => { (window as any).renderer = undefined }
  }, [gl])
  return null
}

// ✅ Wrapper that keys EffectComposer to canvas size
function PostProcessing() {
  const { size } = useThree()
  const key = `${size.width}x${size.height}`

  return (
    <EffectComposer key={key}>
      <DistortionEffect progress={0.01} scale={1} />
      <RippleEffect
        brushTexturePath="/textures/brush.png"
        strength={0.4}
        maxRipples={50}
      />
    </EffectComposer>
  )
}

export default function Experience() {
  return (
    <>
      <Canvas
        className='canvas'
        style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%' }}
        orthographic
        camera={{ position: [0, 0, 100], zoom: 200 }}
        gl={{
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.6,
          outputColorSpace: THREE.SRGBColorSpace,
          powerPreference: "high-performance",
          antialias: false,
        }}
        dpr={[1, 1.5]}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>

        <PostProcessing />

        <DebugBridge />
        <Lights />
      </Canvas>
      <Loader />
    </>
  )
}