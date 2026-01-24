import { useState, useEffect, useRef, useMemo } from 'react';
import { BoxTree } from './components/BoxTree';
import { Viewport3D, Viewport3DHandle } from './components/Viewport3D';
import { SketchView2D } from './components/SketchView2D';
import { SubdivisionControls } from './components/SubdivisionControls';
import { PanelProperties } from './components/PanelProperties';
import { AssemblyProperties } from './components/AssemblyProperties';
import { DimensionForm } from './components/DimensionForm';
import { ExportModal } from './components/ExportModal';
import { ProjectBrowserModal } from './components/ProjectBrowserModal';
import { SaveProjectModal } from './components/SaveProjectModal';
import { useBoxStore } from './store/useBoxStore';
import { saveProject, loadProject, captureThumbnail } from './utils/projectStorage';
import { ProjectState } from './utils/urlState';
import { defaultEdgeExtensions, EdgeExtensions, FaceId, PanelPath } from './types';
import './App.css';

// Get the normal axis for any panel (face or divider)
const getPanelNormalAxis = (panel: PanelPath): 'x' | 'y' | 'z' | null => {
  if (panel.source.type === 'face' && panel.source.faceId) {
    const faceNormals: Record<FaceId, 'x' | 'y' | 'z'> = {
      left: 'x', right: 'x',
      top: 'y', bottom: 'y',
      front: 'z', back: 'z',
    };
    return faceNormals[panel.source.faceId];
  }
  if (panel.source.type === 'divider' && panel.source.axis) {
    return panel.source.axis;
  }
  return null;
};

// Check if two selected panels can potentially be subdivided between
// This is a quick check - detailed validation happens in SubdivisionControls
const canSubdivideBetweenPanels = (
  selectedPanelIds: Set<string>,
  panelCollection: { panels: PanelPath[] } | null
): boolean => {
  if (selectedPanelIds.size !== 2 || !panelCollection) return false;

  const panelIds = Array.from(selectedPanelIds);
  const panels = panelIds
    .map(id => panelCollection.panels.find(p => p.id === id))
    .filter((p): p is PanelPath => p !== undefined);

  if (panels.length !== 2) return false;

  // Both must be from main assembly (not sub-assembly)
  if (panels.some(p => p.source.subAssemblyId)) return false;

  // Get normal axes for both panels
  const axis1 = getPanelNormalAxis(panels[0]);
  const axis2 = getPanelNormalAxis(panels[1]);

  // Both must have valid normal axes and they must match (parallel panels)
  return axis1 !== null && axis1 === axis2;
};

function App() {
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isProjectBrowserOpen, setIsProjectBrowserOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied'>('idle');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const viewportRef = useRef<Viewport3DHandle>(null);

  const {
    config,
    faces,
    rootVoid,
    panelCollection,
    selectedVoidIds,
    selectedPanelIds,
    selectedAssemblyId,
    selectedSubAssemblyIds,
    viewMode,
    loadFromUrl,
    getShareableUrl,
    saveToUrl,
    generatePanels,
    setConfig,
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

    const projectState: ProjectState = {
      config,
      faces,
      rootVoid,
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
        panelsDirty: true,
      });

      // Generate panels
      generatePanels();

      // Apply edge extensions after panel generation
      if (Object.keys(edgeExtensionsMap).length > 0) {
        const currentPanels = useBoxStore.getState().panelCollection?.panels;
        if (currentPanels) {
          const updatedPanels = currentPanels.map(panel => ({
            ...panel,
            edgeExtensions: edgeExtensionsMap[panel.id] ?? panel.edgeExtensions ?? defaultEdgeExtensions,
          }));
          useBoxStore.setState({
            panelCollection: {
              ...useBoxStore.getState().panelCollection!,
              panels: updatedPanels,
            },
          });
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
      panelsDirty: true,
    });
    generatePanels();

    // Clear URL state
    const url = new URL(window.location.href);
    url.searchParams.delete('p');
    url.hash = '';
    window.history.replaceState(null, '', url.toString());
  };

  // Check if two parallel panels are selected (for subdivision)
  const showTwoPanelSubdivision = useMemo(() =>
    canSubdivideBetweenPanels(selectedPanelIds, panelCollection),
    [selectedPanelIds, panelCollection]
  );

  // Determine what to show in the right sidebar based on selection
  const renderRightSidebar = () => {
    // Void selected - show subdivision controls (only for single selection)
    if (selectedVoidIds.size === 1) {
      return <SubdivisionControls />;
    }

    // Two opposite panels selected - show subdivision controls
    if (showTwoPanelSubdivision) {
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
            className="header-btn secondary"
            onClick={handleNewProject}
          >
            <span className="header-btn-icon">+</span>
            New
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
        </div>
      </header>

      <main className="app-main">
        <aside className="sidebar left-sidebar">
          <BoxTree />
        </aside>

        <section className="viewport">
          {viewMode === '3d' ? (
            <Viewport3D ref={viewportRef} />
          ) : (
            <SketchView2D />
          )}
        </section>

        <aside className="sidebar right-sidebar">
          {renderRightSidebar()}
        </aside>
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
    </div>
  );
}

export default App;
