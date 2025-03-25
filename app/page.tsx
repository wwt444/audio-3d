"use client";

import { NextPage } from 'next';
import Head from 'next/head';
import { AudioProvider } from './contexts/AudioContext';
import AudioUploader from './components/AudioUploader';
import AudioProcessor from './components/AudioProcessor';
import AudioVisualizer from './components/AudioVisualizer';
import { useAudio } from './contexts/AudioContext';

const HomePage: NextPage = () => {
  return (
    <AudioProvider>
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
        <Head>
          <title>3D音频转换器</title>
          <meta name="description" content="将普通音频转换为3D环绕声" />
          <link rel="icon" href="/favicon.ico" />
        </Head>

        <main className="container mx-auto px-4 py-10">
          <h1 className="text-4xl font-bold text-center mb-8">3D音频转换器</h1>
          <p className="text-center text-xl mb-12">将您的普通音频转换为沉浸式3D环绕声体验</p>
          
          <MainContent />
        </main>

        <footer className="text-center py-6 text-gray-400">
          <p>© {new Date().getFullYear()} 3D音频转换器</p>
        </footer>
      </div>
    </AudioProvider>
  );
};

const MainContent = () => {
  const { audioFile } = useAudio();
  
  return (
    <>
      {!audioFile ? (
        <AudioUploader />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <AudioProcessor />
          <AudioVisualizer />
        </div>
      )}
    </>
  );
};

export default HomePage;