import React, { useState, useEffect } from 'react';
import { Modal } from './UI/Modal';
import { SavedProject, getSavedProjects, deleteProject, renameProject } from '../utils/projectStorage';

interface ProjectBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadProject: (projectId: string) => void;
}

export const ProjectBrowserModal: React.FC<ProjectBrowserModalProps> = ({
  isOpen,
  onClose,
  onLoadProject,
}) => {
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Load projects when modal opens
  useEffect(() => {
    if (isOpen) {
      setProjects(getSavedProjects());
      setEditingId(null);
      setDeleteConfirmId(null);
    }
  }, [isOpen]);

  const handleDelete = (id: string) => {
    if (deleteProject(id)) {
      setProjects(getSavedProjects());
      setDeleteConfirmId(null);
    }
  };

  const handleStartRename = (project: SavedProject) => {
    setEditingId(project.id);
    setEditName(project.name);
    setDeleteConfirmId(null);
  };

  const handleSaveRename = () => {
    if (editingId && editName.trim()) {
      if (renameProject(editingId, editName.trim())) {
        setProjects(getSavedProjects());
      }
    }
    setEditingId(null);
    setEditName('');
  };

  const handleCancelRename = () => {
    setEditingId(null);
    setEditName('');
  };

  const handleLoad = (id: string) => {
    onLoadProject(id);
    onClose();
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="My Projects">
      <div className="project-browser">
        {projects.length === 0 ? (
          <div className="no-projects">
            <p>No saved projects yet.</p>
            <p className="hint">Use the "Save" button to save your current project.</p>
          </div>
        ) : (
          <div className="project-grid">
            {projects.map((project) => (
              <div key={project.id} className="project-card">
                <div
                  className="project-thumbnail"
                  onClick={() => handleLoad(project.id)}
                >
                  {project.thumbnail ? (
                    <img src={project.thumbnail} alt={project.name} />
                  ) : (
                    <div className="no-thumbnail">No preview</div>
                  )}
                </div>
                <div className="project-info">
                  {editingId === project.id ? (
                    <div className="project-name-edit">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename();
                          if (e.key === 'Escape') handleCancelRename();
                        }}
                        autoFocus
                      />
                      <div className="edit-buttons">
                        <button onClick={handleSaveRename} title="Save">
                          &#10003;
                        </button>
                        <button onClick={handleCancelRename} title="Cancel">
                          &#10005;
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="project-name" onClick={() => handleLoad(project.id)}>
                      {project.name}
                    </div>
                  )}
                  <div className="project-date">
                    {formatDate(project.updatedAt)}
                  </div>
                </div>
                <div className="project-actions">
                  {deleteConfirmId === project.id ? (
                    <div className="delete-confirm">
                      <span>Delete?</span>
                      <button
                        className="confirm-yes"
                        onClick={() => handleDelete(project.id)}
                      >
                        Yes
                      </button>
                      <button
                        className="confirm-no"
                        onClick={() => setDeleteConfirmId(null)}
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        className="action-btn load-btn"
                        onClick={() => handleLoad(project.id)}
                        title="Load project"
                      >
                        Open
                      </button>
                      <button
                        className="action-btn rename-btn"
                        onClick={() => handleStartRename(project)}
                        title="Rename project"
                      >
                        Rename
                      </button>
                      <button
                        className="action-btn delete-btn"
                        onClick={() => setDeleteConfirmId(project.id)}
                        title="Delete project"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
