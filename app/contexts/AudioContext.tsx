"use client"
import React, { createContext, useState, useContext, ReactNode } from 'react';
import { AudioSettings, ProcessedAudio } from '../types/audio';

interface AudioContextType {
  audioFile: File | null;
  setAudioFile: (file: File | null) => void;
  audioSettings: AudioSettings;
  updateSettings: (settings: Partial<AudioSettings>) => void;
  processedAudio: ProcessedAudio | null;
  setProcessedAudio: (audio: ProcessedAudio | null) => void;
  isProcessing: boolean;
  setIsProcessing: (processing: boolean) => void;
}

const defaultSettings: AudioSettings = {
  position: { x: 0, y: 0, z: 0 },
  reverb: 0.3,
  roomSize: 0.5,
  distortion: 0,
  enableSurroundEffect: false,
  surroundSpeed: 0.5,
  enableBinauralEffect: false
};

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export function AudioProvider({ children }: { children: ReactNode }) {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(defaultSettings);
  const [processedAudio, setProcessedAudio] = useState<ProcessedAudio | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const updateSettings = (newSettings: Partial<AudioSettings>) => {
    setAudioSettings(prev => ({ ...prev, ...newSettings }));
  };

  return (
    <AudioContext.Provider
      value={{
        audioFile,
        setAudioFile,
        audioSettings,
        updateSettings,
        processedAudio,
        setProcessedAudio,
        isProcessing,
        setIsProcessing,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const context = useContext(AudioContext);
  if (context === undefined) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
} 