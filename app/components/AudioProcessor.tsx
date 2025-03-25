"use client";

import { useEffect, useRef, useState } from 'react';
import { useAudio } from '../contexts/AudioContext';
import { AudioPosition } from '../types/audio';

const AudioProcessor: React.FC = () => {
  const { 
    audioFile, 
    audioSettings, 
    updateSettings, 
    setProcessedAudio,
    isProcessing,
    setIsProcessing
  } = useAudio();
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  
  // 加载音频文件
  useEffect(() => {
    if (!audioFile) return;
    
    const loadAudio = async () => {
      try {
        // 创建AudioContext
        if (!audioContextRef.current) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        
        const arrayBuffer = await audioFile.arrayBuffer();
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        audioBufferRef.current = audioBuffer;
      } catch (error) {
        console.error('加载音频失败:', error);
      }
    };
    
    loadAudio();
    
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [audioFile]);
  
  // 处理音频
  const processAudio = async () => {
    if (!audioBufferRef.current || !audioContextRef.current) return;
    
    setIsProcessing(true);
    
    try {
      // 创建离线AudioContext进行渲染
      const offlineContext = new OfflineAudioContext(
        2,
        audioBufferRef.current.length,
        audioBufferRef.current.sampleRate
      );
      
      // 创建音频源
      const source = offlineContext.createBufferSource();
      source.buffer = audioBufferRef.current;
      
      // 创建3D音频处理节点
      const panner = offlineContext.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1;
      panner.maxDistance = 10000;
      panner.rolloffFactor = 1;
      panner.coneInnerAngle = 360;
      panner.coneOuterAngle = 360;
      panner.coneOuterGain = 0;
      
      // 设置位置
      panner.positionX.value = audioSettings.position.x;
      panner.positionY.value = audioSettings.position.y;
      panner.positionZ.value = audioSettings.position.z;
      
      // 添加动态位置变化以创建环绕效果
      if (audioSettings.enableSurroundEffect) {
        const duration = audioBufferRef.current.duration;
        const now = offlineContext.currentTime;
        
        // 创建环绕路径（例如圆形路径）
        const radius = Math.sqrt(
          Math.pow(audioSettings.position.x, 2) + 
          Math.pow(audioSettings.position.z, 2)
        ) || 5;
        
        // 设置初始位置
        let startAngle = Math.atan2(audioSettings.position.z, audioSettings.position.x);
        if (isNaN(startAngle)) startAngle = 0;
        
        // 创建环绕动画
        const revolutionsPerSecond = audioSettings.surroundSpeed;
        const totalRevolutions = duration * revolutionsPerSecond;
        const totalAngle = totalRevolutions * 2 * Math.PI;
        
        // 设置位置动画
        const steps = 100; // 动画步数
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const angle = startAngle + t * totalAngle;
          const x = radius * Math.cos(angle);
          const z = radius * Math.sin(angle);
          
          const time = now + t * duration;
          panner.positionX.linearRampToValueAtTime(x, time);
          panner.positionZ.linearRampToValueAtTime(z, time);
        }
      }
      
      // 创建双耳处理器以增强3D效果
      let binauralProcessor;
      if (audioSettings.enableBinauralEffect) {
        // 使用卷积节点模拟HRTF
        const leftEarImpulse = await createHRTFImpulse(offlineContext, 'left');
        const rightEarImpulse = await createHRTFImpulse(offlineContext, 'right');
        
        const leftConvolver = offlineContext.createConvolver();
        const rightConvolver = offlineContext.createConvolver();
        
        leftConvolver.buffer = leftEarImpulse;
        rightConvolver.buffer = rightEarImpulse;
        
        const merger = offlineContext.createChannelMerger(2);
        const splitter = offlineContext.createChannelSplitter(2);
        
        // 连接双耳处理链
        panner.connect(splitter);
        splitter.connect(leftConvolver, 0);
        splitter.connect(rightConvolver, 1);
        leftConvolver.connect(merger, 0, 0);
        rightConvolver.connect(merger, 0, 1);
        
        binauralProcessor = merger;
      }
      
      // 创建混响效果
      const convolver = offlineContext.createConvolver();
      
      // 生成混响脉冲响应
      const reverbBuffer = await createReverbImpulse(
        offlineContext, 
        audioSettings.reverb * 3, 
        audioSettings.roomSize
      );
      
      convolver.buffer = reverbBuffer;
      
      // 创建增益节点控制混响量
      const dryGain = offlineContext.createGain();
      const wetGain = offlineContext.createGain();
      
      dryGain.gain.value = 1 - audioSettings.reverb * 0.5;
      wetGain.gain.value = audioSettings.reverb * 0.5;
      
      // 创建失真效果
      const distortion = offlineContext.createWaveShaper();
      if (audioSettings.distortion > 0) {
        distortion.curve = createDistortionCurve(audioSettings.distortion * 400);
        distortion.oversample = '4x';
      }
      
      // 连接节点
      source.connect(panner);
      
      if (audioSettings.enableBinauralEffect && binauralProcessor) {
        // 使用双耳处理
        binauralProcessor.connect(dryGain);
        binauralProcessor.connect(convolver);
      } else {
        // 使用标准处理
        panner.connect(dryGain);
        panner.connect(convolver);
      }
      
      convolver.connect(wetGain);
      
      if (audioSettings.distortion > 0) {
        dryGain.connect(distortion);
        wetGain.connect(distortion);
        distortion.connect(offlineContext.destination);
      } else {
        dryGain.connect(offlineContext.destination);
        wetGain.connect(offlineContext.destination);
      }
      
      // 开始渲染
      source.start(0);
      const renderedBuffer = await offlineContext.startRendering();
      
      // 创建处理后的音频URL
      const processedAudioBlob = await bufferToWave(renderedBuffer, renderedBuffer.length);
      const processedAudioUrl = URL.createObjectURL(processedAudioBlob);
      
      setProcessedAudio({
        url: processedAudioUrl,
        settings: { ...audioSettings }
      });
      
    } catch (error) {
      console.error('处理音频失败:', error);
    } finally {
      setIsProcessing(false);
    }
  };
  
  // 预览原始音频
  const previewOriginalAudio = () => {
    if (previewPlaying) {
      if (previewSourceRef.current) {
        previewSourceRef.current.stop();
        previewSourceRef.current = null;
      }
      setPreviewPlaying(false);
      return;
    }
    
    if (!audioBufferRef.current || !audioContextRef.current) return;
    
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.connect(audioContextRef.current.destination);
    source.start(0);
    source.onended = () => {
      setPreviewPlaying(false);
      previewSourceRef.current = null;
    };
    
    previewSourceRef.current = source;
    setPreviewPlaying(true);
  };
  
  // 更新位置
  const handlePositionChange = (axis: keyof AudioPosition, value: number) => {
    updateSettings({
      position: {
        ...audioSettings.position,
        [axis]: value
      }
    });
  };
  
  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-2xl font-bold mb-6">音频处理设置</h2>
      
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3">3D位置</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm mb-1">X轴 (左/右)</label>
            <input 
              type="range" 
              min="-10" 
              max="10" 
              step="0.1" 
              value={audioSettings.position.x}
              onChange={(e) => handlePositionChange('x', parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="text-center mt-1">{audioSettings.position.x.toFixed(1)}</div>
          </div>
          <div>
            <label className="block text-sm mb-1">Y轴 (上/下)</label>
            <input 
              type="range" 
              min="-10" 
              max="10" 
              step="0.1" 
              value={audioSettings.position.y}
              onChange={(e) => handlePositionChange('y', parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="text-center mt-1">{audioSettings.position.y.toFixed(1)}</div>
          </div>
          <div>
            <label className="block text-sm mb-1">Z轴 (前/后)</label>
            <input 
              type="range" 
              min="-10" 
              max="10" 
              step="0.1" 
              value={audioSettings.position.z}
              onChange={(e) => handlePositionChange('z', parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="text-center mt-1">{audioSettings.position.z.toFixed(1)}</div>
          </div>
        </div>
      </div>
      
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3">环绕效果</h3>
        <div className="space-y-4">
          <div className="flex items-center">
            <input 
              type="checkbox" 
              id="enableSurround"
              checked={audioSettings.enableSurroundEffect}
              onChange={(e) => updateSettings({ enableSurroundEffect: e.target.checked })}
              className="mr-2"
            />
            <label htmlFor="enableSurround" className="text-sm">启用环绕效果</label>
          </div>
          
          {audioSettings.enableSurroundEffect && (
            <div>
              <label className="block text-sm mb-1">环绕速度</label>
              <input 
                type="range" 
                min="0.1" 
                max="2" 
                step="0.1" 
                value={audioSettings.surroundSpeed}
                onChange={(e) => updateSettings({ surroundSpeed: parseFloat(e.target.value) })}
                className="w-full"
              />
              <div className="text-center mt-1">{audioSettings.surroundSpeed.toFixed(1)} 圈/秒</div>
            </div>
          )}
          
          <div className="flex items-center mt-4">
            <input 
              type="checkbox" 
              id="enableBinaural"
              checked={audioSettings.enableBinauralEffect}
              onChange={(e) => updateSettings({ enableBinauralEffect: e.target.checked })}
              className="mr-2"
            />
            <label htmlFor="enableBinaural" className="text-sm">启用双耳效果（增强3D感）</label>
          </div>
        </div>
      </div>
      
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3">效果</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-1">混响量</label>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.01" 
              value={audioSettings.reverb}
              onChange={(e) => updateSettings({ reverb: parseFloat(e.target.value) })}
              className="w-full"
            />
            <div className="text-center mt-1">{(audioSettings.reverb * 100).toFixed(0)}%</div>
          </div>
          <div>
            <label className="block text-sm mb-1">房间大小</label>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.01" 
              value={audioSettings.roomSize}
              onChange={(e) => updateSettings({ roomSize: parseFloat(e.target.value) })}
              className="w-full"
            />
            <div className="text-center mt-1">{(audioSettings.roomSize * 100).toFixed(0)}%</div>
          </div>
          <div>
            <label className="block text-sm mb-1">失真</label>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.01" 
              value={audioSettings.distortion}
              onChange={(e) => updateSettings({ distortion: parseFloat(e.target.value) })}
              className="w-full"
            />
            <div className="text-center mt-1">{(audioSettings.distortion * 100).toFixed(0)}%</div>
          </div>
        </div>
      </div>
      
      <div className="flex space-x-4">
        <button
          onClick={previewOriginalAudio}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md flex-1"
        >
          {previewPlaying ? '停止预览' : '预览原始音频'}
        </button>
        <button
          onClick={processAudio}
          disabled={isProcessing}
          className={`px-4 py-2 rounded-md flex-1 ${
            isProcessing 
              ? 'bg-gray-600 cursor-not-allowed' 
              : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {isProcessing ? '处理中...' : '生成3D音频'}
        </button>
      </div>
    </div>
  );
};

// 创建混响脉冲响应
async function createReverbImpulse(
  context: OfflineAudioContext,
  duration: number,
  decay: number
): Promise<AudioBuffer> {
  const sampleRate = context.sampleRate;
  const length = sampleRate * duration;
  const impulse = context.createBuffer(2, length, sampleRate);
  const leftChannel = impulse.getChannelData(0);
  const rightChannel = impulse.getChannelData(1);
  
  for (let i = 0; i < length; i++) {
    const n = i / length;
    // 指数衰减
    const amplitude = Math.pow(1 - n, decay * 3) * (Math.random() * 2 - 1);
    leftChannel[i] = amplitude;
    // 右声道略有不同，增加立体声效果
    rightChannel[i] = amplitude * (Math.random() * 0.5 + 0.5);
  }
  
  return impulse;
}

// 创建失真曲线
function createDistortionCurve(amount: number): Float32Array {
  const samples = 44100;
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;
  
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = (3 + amount) * x * 20 * deg / (Math.PI + amount * Math.abs(x));
  }
  
  return curve;
}

// 将AudioBuffer转换为Wave文件
function bufferToWave(buffer: AudioBuffer, len: number): Promise<Blob> {
  return new Promise((resolve) => {
    const numOfChan = buffer.numberOfChannels;
    const length = len * numOfChan * 2 + 44;
    const data = new Uint8Array(length);
    
    // RIFF标识
    data[0] = 'R'.charCodeAt(0);
    data[1] = 'I'.charCodeAt(0);
    data[2] = 'F'.charCodeAt(0);
    data[3] = 'F'.charCodeAt(0);
    
    // RIFF块长度
    data[4] = (length & 0xff);
    data[5] = ((length >> 8) & 0xff);
    data[6] = ((length >> 16) & 0xff);
    data[7] = ((length >> 24) & 0xff);
    
    // WAVE标识
    data[8] = 'W'.charCodeAt(0);
    data[9] = 'A'.charCodeAt(0);
    data[10] = 'V'.charCodeAt(0);
    data[11] = 'E'.charCodeAt(0);
    
    // fmt子块标识
    data[12] = 'f'.charCodeAt(0);
    data[13] = 'm'.charCodeAt(0);
    data[14] = 't'.charCodeAt(0);
    data[15] = ' '.charCodeAt(0);
    
    // 子块长度
    data[16] = 16;
    data[17] = 0;
    data[18] = 0;
    data[19] = 0;
    
    // 音频格式 (1为PCM)
    data[20] = 1;
    data[21] = 0;
    
    // 声道数
    data[22] = numOfChan;
    data[23] = 0;
    
    // 采样率
    const sampleRate = buffer.sampleRate;
    data[24] = (sampleRate & 0xff);
    data[25] = ((sampleRate >> 8) & 0xff);
    data[26] = ((sampleRate >> 16) & 0xff);
    data[27] = ((sampleRate >> 24) & 0xff);
    
    // 字节率 (采样率 * 声道数 * 每样本字节数)
    const byteRate = sampleRate * numOfChan * 2;
    data[28] = (byteRate & 0xff);
    data[29] = ((byteRate >> 8) & 0xff);
    data[30] = ((byteRate >> 16) & 0xff);
    data[31] = ((byteRate >> 24) & 0xff);
    
    // 块对齐 (声道数 * 每样本字节数)
    data[32] = numOfChan * 2;
    data[33] = 0;
    
    // 每样本位数
    data[34] = 16;
    data[35] = 0;
    
    // data子块标识
    data[36] = 'd'.charCodeAt(0);
    data[37] = 'a'.charCodeAt(0);
    data[38] = 't'.charCodeAt(0);
    data[39] = 'a'.charCodeAt(0);
    
    // data子块长度
    const dataLength = len * numOfChan * 2;
    data[40] = (dataLength & 0xff);
    data[41] = ((dataLength >> 8) & 0xff);
    data[42] = ((dataLength >> 16) & 0xff);
    data[43] = ((dataLength >> 24) & 0xff);
    
    // 写入PCM数据
    let dataIndex = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numOfChan; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        
        // 写入样本数据
        data[dataIndex++] = int16 & 0xff;
        data[dataIndex++] = (int16 >> 8) & 0xff;
      }
    }
    
    // 创建Blob
    const blob = new Blob([data], { type: 'audio/wav' });
    resolve(blob);
  });
}

// 创建HRTF脉冲响应（简化版）
async function createHRTFImpulse(
  context: OfflineAudioContext,
  ear: 'left' | 'right'
): Promise<AudioBuffer> {
  const sampleRate = context.sampleRate;
  const length = sampleRate * 0.1; // 100ms的脉冲
  const impulse = context.createBuffer(1, length, sampleRate);
  const channel = impulse.getChannelData(0);
  
  // 这是一个简化的HRTF模拟
  // 真实的HRTF需要使用专业测量的数据集
  for (let i = 0; i < length; i++) {
    const n = i / length;
    // 左右耳有不同的延迟和衰减特性
    const delay = ear === 'left' ? 0 : 0.0003; // 0.3ms的延迟差异
    const delayIndex = Math.floor(delay * sampleRate);
    
    if (i < delayIndex) {
      channel[i] = 0;
    } else {
      // 指数衰减
      const amplitude = Math.pow(1 - n, 2) * (Math.random() * 0.1 - 0.05);
      channel[i] = amplitude * (ear === 'left' ? 1 : 0.8); // 右耳略微衰减
    }
  }
  
  return impulse;
}

export default AudioProcessor; 