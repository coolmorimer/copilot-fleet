import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { ReactFlowProvider } from '@xyflow/react';

import { Canvas } from './components/Canvas.js';
import { Console } from './components/Console.js';
import { GuideModal } from './components/GuideModal.js';
import { Inspector } from './components/Inspector.js';
import { Onboarding } from './components/Onboarding.js';
import { SettingsModal } from './components/SettingsModal.js';
import { Sidebar } from './components/Sidebar.js';
import { StatusBar } from './components/StatusBar.js';
import { Toolbar } from './components/Toolbar.js';
import { useSettingsStore } from './store/settings-store.js';

export function App(): ReactElement {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [consoleHeight, setConsoleHeight] = useState(200);
  const onboardingComplete = useSettingsStore((state) => state.onboardingComplete);
  const theme = useSettingsStore((state) => state.theme);

  /* Sync theme class on <html> */
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  if (!onboardingComplete) {
    return <Onboarding />;
  }

  return (
    <ReactFlowProvider>
      <div className="flex h-screen w-screen flex-col overflow-hidden">
        <Toolbar onOpenSettings={() => setSettingsOpen(true)} onOpenGuide={() => setGuideOpen(true)} />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Canvas />
            <Console height={consoleHeight} onResize={setConsoleHeight} />
          </div>
          <Inspector />
        </div>
        <StatusBar />
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
      </div>
    </ReactFlowProvider>
  );
}