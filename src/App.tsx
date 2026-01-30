import { useState, useEffect, useRef } from 'react';
import { LeftSidebar } from './components/LeftSidebar';
import { Viewport3D, Viewport3DHandle } from './components/Viewport3D';
import { SketchView2D } from './components/SketchView2D';
import { SketchSidebar } from './components/SketchSidebar';
import { ExportModal } from './components/ExportModal';
import { ProjectBrowserModal } from './components/ProjectBrowserModal';
import { SaveProjectModal } from './components/SaveProjectModal';
import { TemplateBrowserModal } from './components/TemplateBrowserModal';
import { TemplateConfigModal } from './components/TemplateConfigModal';
import { AboutModal } from './components/AboutModal';
import { useBoxStore } from './store/useBoxStore';
import { saveProject, loadProject, captureThumbnail } from './utils/projectStorage';
import { ProjectState } from './utils/urlState';
import { EdgeExtensions } from './types';
import { hasDebug, getDebug } from './utils/debug';
import {
  useEnginePanels,
  getEngineSnapshot,
  getEngine,
  voidSnapshotToVoid,
  assemblySnapshotToConfig,
  faceConfigsToFaces,
} from './engine';
import { AssemblySnapshot, VoidSnapshot } from './engine/types';
import { ProjectTemplate } from './templates';
import './App.css';

function App() {
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isProjectBrowserOpen, setIsProjectBrowserOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isTemplateBrowserOpen, setIsTemplateBrowserOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied'>('idle');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [debugCopyStatus, setDebugCopyStatus] = useState<'idle' | 'copied'>('idle');
  const viewportRef = useRef<Viewport3DHandle>(null);

  // Panel collection from engine (source of truth)
  const panelCollection = useEnginePanels();

  const {
    viewMode,
    loadFromUrl,
    getShareableUrl,
    saveToUrl,
    generatePanels,
  } = useBoxStore();

  // Load state from URL on initial mount and initialize engine
  useEffect(() => {
    loadFromUrl();
    // Always generate panels to initialize the engine
    // (syncStoreToEngine is called inside generatePanels)
    generatePanels();

    // Check for #about hash on initial load
    if (window.location.hash === '#about') {
      setIsAboutModalOpen(true);
    }
  }, []);

  // Handle hash changes (browser back/forward navigation)
  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#about') {
        setIsAboutModalOpen(true);
      } else if (isAboutModalOpen && window.location.hash !== '#about') {
        setIsAboutModalOpen(false);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [isAboutModalOpen]);

  // Handle opening the About modal
  const handleOpenAbout = () => {
    setIsAboutModalOpen(true);
    window.history.pushState(null, '', '#about');
  };

  // Handle closing the About modal
  const handleCloseAbout = () => {
    setIsAboutModalOpen(false);
    // Remove the hash without adding to history
    if (window.location.hash === '#about') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  // Handle debug copy - combines all debug logs
  const handleCopyDebug = async () => {
    try {
      await navigator.clipboard.writeText(getDebug());
      setDebugCopyStatus('copied');
      setTimeout(() => setDebugCopyStatus('idle'), 2000);
    } catch (err) {
      console.error('Failed to copy debug info:', err);
    }
  };

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

  // Handle save project
  const handleSaveProject = (name: string) => {
    // Get thumbnail from canvas
    let thumbnail = '';
    const canvas = viewportRef.current?.getCanvas();
    if (canvas) {
      thumbnail = captureThumbnail(canvas);
    }

    // Collect edge extensions from panels
    const edgeExtensions: Record<string, EdgeExtensions> = {};
    if (panelCollection) {
      for (const panel of panelCollection.panels) {
        if (panel.edgeExtensions &&
            (panel.edgeExtensions.top !== 0 ||
             panel.edgeExtensions.bottom !== 0 ||
             panel.edgeExtensions.left !== 0 ||
             panel.edgeExtensions.right !== 0)) {
          edgeExtensions[panel.id] = panel.edgeExtensions;
        }
      }
    }

    // Get model state from engine (source of truth)
    const engineState = getEngineSnapshot();
    if (!engineState) {
      console.error('Cannot save: no engine state');
      return;
    }

    const projectState: ProjectState = {
      config: engineState.config,
      faces: engineState.faces,
      rootVoid: engineState.rootVoid,
      edgeExtensions,
    };

    saveProject(name, projectState, thumbnail);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  // Handle load project from browser
  const handleLoadProject = (projectId: string) => {
    const loaded = loadProject(projectId);
    if (loaded) {
      // Update store with loaded state
      const state = useBoxStore.getState();

      // Collect edge extensions
      const edgeExtensionsMap = loaded.edgeExtensions;

      // Set config first (this resets rootVoid)
      state.setConfig(loaded.config);

      // Then manually set the loaded rootVoid and faces
      useBoxStore.setState({
        config: loaded.config,
        faces: loaded.faces,
        rootVoid: loaded.rootVoid,
      });

      // Generate panels (this syncs to engine)
      generatePanels();

      // Apply edge extensions after panel generation via store action
      if (Object.keys(edgeExtensionsMap).length > 0) {
        const setEdgeExtension = useBoxStore.getState().setEdgeExtension;
        for (const [panelId, extensions] of Object.entries(edgeExtensionsMap)) {
          if (extensions.top !== 0) setEdgeExtension(panelId, 'top', extensions.top);
          if (extensions.bottom !== 0) setEdgeExtension(panelId, 'bottom', extensions.bottom);
          if (extensions.left !== 0) setEdgeExtension(panelId, 'left', extensions.left);
          if (extensions.right !== 0) setEdgeExtension(panelId, 'right', extensions.right);
        }
      }

      // Update URL to reflect loaded project (same as share)
      saveToUrl();
    }
  };

  // Handle new project
  const handleNewProject = () => {
    // Reset to default state
    useBoxStore.setState({
      config: {
        width: 100,
        height: 100,
        depth: 100,
        materialThickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
        assembly: {
          assemblyAxis: 'y',
          lids: {
            positive: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
            negative: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
          },
        },
      },
      faces: [
        { id: 'front', solid: true },
        { id: 'back', solid: true },
        { id: 'left', solid: true },
        { id: 'right', solid: true },
        { id: 'top', solid: true },
        { id: 'bottom', solid: true },
      ],
      rootVoid: {
        id: 'root',
        bounds: { x: 0, y: 0, z: 0, w: 100, h: 100, d: 100 },
        children: [],
      },
      selectedVoidIds: new Set<string>(),
      selectedPanelIds: new Set<string>(),
      selectedAssemblyId: null,
      selectedSubAssemblyIds: new Set<string>(),
    });
    generatePanels();

    // Clear URL state
    const url = new URL(window.location.href);
    url.searchParams.delete('p');
    url.hash = '';
    window.history.replaceState(null, '', url.toString());
  };

  // Determine what to show in the right sidebar based on selection
  const renderRightSidebar = () => {
    // 2D sketch mode - show sketch-specific sidebar
    if (viewMode === '2d') {
      return <SketchSidebar />;
    }

    // No right sidebar in 3D mode - void operations are handled via toolbar tools
    return null;
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
            className="header-btn secondary"
            onClick={handleNewProject}
          >
            <span className="header-btn-icon">+</span>
            New
          </button>
          <button
            className="header-btn secondary"
            onClick={() => setIsTemplateBrowserOpen(true)}
          >
            <span className="header-btn-icon">📋</span>
            Templates
          </button>
          <button
            className="header-btn secondary"
            onClick={() => setIsProjectBrowserOpen(true)}
          >
            <span className="header-btn-icon">📁</span>
            Open
          </button>
          <button
            className="header-btn"
            onClick={() => setIsSaveModalOpen(true)}
          >
            <span className="header-btn-icon">{saveStatus === 'saved' ? '✓' : '💾'}</span>
            {saveStatus === 'saved' ? 'Saved!' : 'Save'}
          </button>
          <button
            className="header-btn secondary"
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
            Export
          </button>
          {hasDebug() && (
            <button
              className={`header-btn secondary ${debugCopyStatus === 'copied' ? 'success' : ''}`}
              onClick={handleCopyDebug}
              title="Copy debug info to clipboard"
            >
              <span className="header-btn-icon">{debugCopyStatus === 'copied' ? '✓' : '🐛'}</span>
              {debugCopyStatus === 'copied' ? 'Copied!' : 'Debug'}
            </button>
          )}
          <button
            className="header-btn secondary"
            onClick={handleOpenAbout}
            title="About Boxen"
          >
            <span className="header-btn-icon">ℹ</span>
            About
          </button>
        </div>
      </header>

      <main className="app-main">
        <aside className="sidebar left-sidebar">
          <LeftSidebar />
        </aside>

        <section className="viewport">
          {viewMode === '3d' ? (
            <Viewport3D ref={viewportRef} />
          ) : (
            <SketchView2D />
          )}
        </section>

        {renderRightSidebar() && (
          <aside className="sidebar right-sidebar">
            {renderRightSidebar()}
          </aside>
        )}
      </main>

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      />

      <ProjectBrowserModal
        isOpen={isProjectBrowserOpen}
        onClose={() => setIsProjectBrowserOpen(false)}
        onLoadProject={handleLoadProject}
      />

      <SaveProjectModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        onSave={handleSaveProject}
      />

      <TemplateBrowserModal
        isOpen={isTemplateBrowserOpen}
        onClose={() => setIsTemplateBrowserOpen(false)}
        onSelectTemplate={(template) => {
          setSelectedTemplate(template);
          setIsTemplateBrowserOpen(false);
        }}
      />

      <TemplateConfigModal
        isOpen={selectedTemplate !== null}
        template={selectedTemplate}
        onClose={() => setSelectedTemplate(null)}
        onApply={() => {
          setSelectedTemplate(null);

          // Sync engine state back to the store after template is committed
          // This ensures the store has the fresh template state, not stale data
          const engine = getEngine();
          const snapshot = engine.getSnapshot();
          const assemblySnapshot = snapshot.children.find(
            (c): c is AssemblySnapshot => c.kind === 'assembly'
          );

          if (assemblySnapshot) {
            const rootVoidSnapshot = assemblySnapshot.children.find(
              (c): c is VoidSnapshot => c.kind === 'void'
            );

            useBoxStore.setState({
              config: assemblySnapshotToConfig(assemblySnapshot),
              faces: faceConfigsToFaces(assemblySnapshot.props.faces),
              rootVoid: rootVoidSnapshot
                ? voidSnapshotToVoid(rootVoidSnapshot)
                : { id: 'root', bounds: { x: 0, y: 0, z: 0, w: 0, h: 0, d: 0 }, children: [] },
              selectedVoidIds: new Set<string>(),
              selectedPanelIds: new Set<string>(),
              selectedAssemblyId: null,
              selectedSubAssemblyIds: new Set<string>(),
            });
          }

          // Regenerate panels from the new engine state
          generatePanels();
        }}
      />

      <AboutModal
        isOpen={isAboutModalOpen}
        onClose={handleCloseAbout}
      />
    </div>
  );
}

export default App;
