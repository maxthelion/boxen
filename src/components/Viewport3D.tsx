import React, { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import { Box3D } from './Box3D';
import { ViewportToolbar } from './ViewportToolbar';
import { useBoxStore } from '../store/useBoxStore';

export const Viewport3D: React.FC = () => {
  const clearSelection = useBoxStore((state) => state.clearSelection);

  // Handle Escape key to clear selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection]);

  return (
    <div className="viewport-container">
      <ViewportToolbar />
      <Canvas
        camera={{ position: [150, 150, 150], fov: 50 }}
        style={{ background: '#1a1a2e' }}
        onPointerMissed={() => clearSelection()}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <pointLight position={[-10, -10, -5]} intensity={0.5} />

        <Box3D />

        <Grid
          args={[200, 200]}
          cellSize={10}
          cellThickness={0.5}
          cellColor="#444"
          sectionSize={50}
          sectionThickness={1}
          sectionColor="#666"
          fadeDistance={400}
          fadeStrength={1}
          followCamera={false}
          position={[0, -60, 0]}
        />

        <OrbitControls
          makeDefault
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={50}
          maxDistance={500}
        />

        <Environment preset="studio" />
      </Canvas>
    </div>
  );
};
