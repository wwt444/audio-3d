"use client";

import { useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sphere, Box, Line } from '@react-three/drei';
import { useAudio } from '../contexts/AudioContext';

const AudioVisualizer: React.FC = () => {
  const { audioFile, processedAudio, audioSettings } = useAudio();
  const audioRef = useRef<HTMLAudioElement>(null);
  
  return (
    <div className="bg-gray-800 rounded-lg p-6 flex flex-col h-full">
      <h2 className="text-2xl font-bold mb-6">3D音频可视化</h2>
      
      <div className="flex-grow relative">
        <Canvas camera={{ position: [0, 0, 10], fov: 50 }}>
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />
          
          {/* 听者（用户）位置 */}
          <Sphere args={[0.5, 16, 16]} position={[0, 0, 0]}>
            <meshStandardMaterial color="#4299e1" />
          </Sphere>
          
          {/* 音源位置 */}
          <Box 
            args={[1, 1, 1]} 
            position={[
              audioSettings.position.x, 
              audioSettings.position.y, 
              audioSettings.position.z
            ]}
          >
            <meshStandardMaterial color="#f56565" />
          </Box>
          
          {/* 显示环绕路径 */}
          {audioSettings.enableSurroundEffect && (
            <SurroundPath 
              position={audioSettings.position} 
              color="#f56565" 
            />
          )}
          
          {/* 网格 */}
          <gridHelper args={[20, 20, '#444444', '#222222']} />
          
          {/* 控制器 */}
          <OrbitControls />
        </Canvas>
      </div>
      
      {processedAudio && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-3">处理后的音频</h3>
          <audio 
            ref={audioRef}
            src={processedAudio.url} 
            controls 
            className="w-full"
          />
          <div className="flex justify-between mt-4">
            <button
              onClick={() => audioRef.current?.play()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md"
            >
              播放
            </button>
            <a
              href={processedAudio.url}
              download={`3d_audio_${audioFile?.name || 'processed'}`}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-md"
            >
              下载
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

// 环绕路径组件
interface SurroundPathProps {
  position: AudioPosition;
  color: string;
}

const SurroundPath: React.FC<SurroundPathProps> = ({ position, color }) => {
  const radius = Math.sqrt(Math.pow(position.x, 2) + Math.pow(position.z, 2)) || 5;
  
  return (
    <group position={[0, position.y, 0]}>
      <Line
        points={Array.from({ length: 64 }).map((_, i) => {
          const angle = (i / 64) * Math.PI * 2;
          return [radius * Math.cos(angle), 0, radius * Math.sin(angle)];
        })}
        color={color}
        lineWidth={1}
        dashed={true}
      />
    </group>
  );
};

export default AudioVisualizer; 