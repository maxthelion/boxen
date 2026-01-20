import React, { useState } from 'react';
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
  const { selectedVoidId, selectedPanelId, selectedAssemblyId, selectedSubAssemblyId } = useBoxStore();

  // Determine what to show in the right sidebar based on selection
  const renderRightSidebar = () => {
    // Void selected - show subdivision controls
    if (selectedVoidId) {
      return <SubdivisionControls />;
    }

    // Panel selected - show panel properties
    if (selectedPanelId) {
      return <PanelProperties />;
    }

    // Assembly or sub-assembly selected - show assembly properties
    if (selectedAssemblyId || selectedSubAssemblyId) {
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
