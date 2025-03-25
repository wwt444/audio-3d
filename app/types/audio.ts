export interface AudioPosition {
    x: number;
    y: number;
    z: number;
  }
  
  export interface AudioSettings {
    position: AudioPosition;
    reverb: number;
    roomSize: number;
    distortion: number;
    enableSurroundEffect: boolean;
    surroundSpeed: number;
    enableBinauralEffect: boolean;
  }
  
  export interface ProcessedAudio {
    url: string;
    settings: {
      position: AudioPosition;
      reverb: number;
      roomSize: number;
      distortion: number;
    };
  }