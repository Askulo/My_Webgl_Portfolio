import { Canvas, useThree } from '@react-three/fiber';
import Scene from './Scene';
import Lights from './Lights';
import { Loader, OrbitControls } from '@react-three/drei';
import { Perf } from 'r3f-perf';
import { Suspense, useEffect } from 'react';
import * as THREE from 'three'
import { RippleEffect } from './Rippleeffect';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { useControls, folder } from 'leva';
import { DistortionEffect } from '../postprocessing/DistortionEffect';

function DebugBridge() {
  const { gl } = useThree()

  useEffect(() => {
    // This makes 'renderer' available in your browser console
    (window as any).renderer = gl
    console.log("🚀 DebugBridge: 'renderer' is now available in the console.")

    // Cleanup when component unmounts
    return () => { (window as any).renderer = undefined }
  }, [gl])

  return null
}


export default function Experience() {
  // const controls = useControls('Post-Processing', {
  //   RippleEffect: folder({
  //     strength: { value: 0.4, min: 0, max: 0.5, step: 0.01 },
  //     maxRipples: { value: 50, min: 1, max: 200, step: 1 },
  //   }),
  //   Bloom: folder({
  //     intensity: { value: 0.4, min: 0, max: 2, step: 0.01 },
  //     radius: { value: 0.6, min: 0, max: 1, step: 0.01 },
  //     luminanceThreshold: { value: 1, min: 0, max: 1, step: 0.01 },
  //     luminanceSmoothing: { value: 0.9, min: 0, max: 1, step: 0.01 },
  //   }, { collapsed: true }),
  // });

  return (
    <>
      <Canvas className='canvas'
        // shadows

        style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%' }}
      
        orthographic
        camera={{
          position: [0, 0, 100],
          zoom: 200, // or window.innerHeight if you want it to scale with the screen height

        }}
        gl={{
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.6,
          outputColorSpace: THREE.SRGBColorSpace,
          powerPreference: "high-performance",
          antialias: false, // Bloom does its own smoothing, and high DPR reduces need for base antialiasing
        }}
        dpr={[1, 1.5]} // Capping DPR at 1.5 saves massive pixel pushing on Retina/mobile screens

      >
        {/* <axesHelper args={[5]} /> */}

        <Suspense fallback={null}>
          <Scene />
       </Suspense>
          <EffectComposer>
            <DistortionEffect progress={0.01} scale={1} />
            <RippleEffect
              brushTexturePath="/textures/brush.png"
              strength={0.4}
              maxRipples={50}
            />
            
            {/* <Bloom
              intensity={controls.intensity}
              radius={controls.radius}
              luminanceThreshold={controls.luminanceThreshold}
              luminanceSmoothing={controls.luminanceSmoothing}
            /> */}
</EffectComposer>
        <DebugBridge />

        {/* <OrbitControls /> */}
        {/* <Perf position="top-left" /> */}
        <Lights />
      </Canvas>
      <Loader />
    </>
  );
}
