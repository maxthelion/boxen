import React, { useState } from 'react';
import { BoxTree } from './components/BoxTree';
import { Viewport3D } from './components/Viewport3D';
import { SubdivisionControls } from './components/SubdivisionControls';
import { PanelProperties } from './components/PanelProperties';
import { AssemblyProperties } from './components/AssemblyProperties';
import { ExportModal } from './components/ExportModal';
import './App.css';

function App() {
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

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
          <AssemblyProperties />
          <PanelProperties />
          <SubdivisionControls />
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
