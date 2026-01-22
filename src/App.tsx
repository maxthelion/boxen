import { useState, useEffect } from 'react';
import { BoxTree } from './components/BoxTree';
import { Viewport3D } from './components/Viewport3D';
import { SubdivisionControls } from './components/SubdivisionControls';
import { PanelProperties } from './components/PanelProperties';
import { AssemblyProperties } from './components/AssemblyProperties';
import { DimensionForm } from './components/DimensionForm';
import { ExportModal } from './components/ExportModal';
import { useBoxStore } from './store/useBoxStore';
import './App.css';

function App() {
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied'>('idle');
  const {
    selectedVoidIds,
    selectedPanelIds,
    selectedAssemblyId,
    selectedSubAssemblyIds,
    loadFromUrl,
    getShareableUrl,
    generatePanels
  } = useBoxStore();

  // Load state from URL on initial mount
  useEffect(() => {
    const loaded = loadFromUrl();
    if (loaded) {
      // Regenerate panels after loading state
      generatePanels();
    }
  }, []);

  // Handle share button click
  const handleShare = async () => {
    const url = getShareableUrl();
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus('copied');
      setTimeout(() => setShareStatus('idle'), 2000);
    } catch (err) {
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setShareStatus('copied');
      setTimeout(() => setShareStatus('idle'), 2000);
    }
  };

  // Determine what to show in the right sidebar based on selection
  const renderRightSidebar = () => {
    // Void selected - show subdivision controls (only for single selection)
    if (selectedVoidIds.size === 1) {
      return <SubdivisionControls />;
    }

    // Panel selected - show panel properties
    if (selectedPanelIds.size > 0) {
      return <PanelProperties />;
    }

    // Assembly or sub-assembly selected - show assembly properties
    if (selectedAssemblyId || selectedSubAssemblyIds.size > 0) {
      return <AssemblyProperties />;
    }

    // Nothing selected - show default dimension form
    return <DimensionForm />;
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>Boxen</h1>
          <p>3D Laser-Cut Box Designer</p>
        </div>
        <div className="header-menu">
          <button
            className="header-btn"
            onClick={handleShare}
          >
            <span className="header-btn-icon">{shareStatus === 'copied' ? '✓' : '🔗'}</span>
            {shareStatus === 'copied' ? 'Copied!' : 'Share'}
          </button>
          <button
            className="header-btn"
            onClick={() => setIsExportModalOpen(true)}
          >
            <span className="header-btn-icon">↓</span>
            Export SVG
          </button>
        </div>
      </header>

      <main className="app-main">
        <aside className="sidebar left-sidebar">
          <BoxTree />
        </aside>

        <section className="viewport">
          <Viewport3D />
        </section>

        <aside className="sidebar right-sidebar">
          {renderRightSidebar()}
        </aside>
      </main>

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      />
    </div>
  );
}

export default App;
