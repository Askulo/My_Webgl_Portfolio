

export default function Lights() {
  return (
    <>
      <ambientLight intensity={3} />
      {/* <directionalLight position={[0, 0, -3]} intensity={1} /> */}
      <pointLight
        position={[0, 0, -3]}      // X, Y, Z coordinates
        color="#6989b7"           // Matching that electric cyan from your reference
        intensity={2}           // Adjust based on your scene scale
        distance={10}             // How far the light reaches before hitting 0
        decay={2}                 // 2 is physically accurate; 1 is more "linear"
        castShadow={false}        // Keep this FALSE for better FPS on your device
      />
      <pointLight
        position={[0, 0, 4]}      // X, Y, Z coordinates
        color={"#6989b7"}           // Matching that electric cyan from your reference
        intensity={3}           // Adjust based on your scene scale
        distance={10}             // How far the light reaches before hitting 0
        decay={0}                 // 2 is physically accurate; 1 is more "linear"
        castShadow={false}        // Keep this FALSE for better FPS on your device
      />
      {/* <ambientLight intensity={2}    position={[0, 0, 5]}/> */}
    

    </>
  );
}
