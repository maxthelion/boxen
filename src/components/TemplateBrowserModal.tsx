import React from 'react';
import { Modal } from './UI/Modal';
import { getAllTemplates, ProjectTemplate } from '../templates';

interface TemplateBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: ProjectTemplate) => void;
}

const categoryIcons: Record<string, string> = {
  storage: '📦',
  organization: '📂',
  general: '📐',
};

const categoryLabels: Record<string, string> = {
  storage: 'Storage',
  organization: 'Organization',
  general: 'General',
};

export const TemplateBrowserModal: React.FC<TemplateBrowserModalProps> = ({
  isOpen,
  onClose,
  onSelectTemplate,
}) => {
  const templates = getAllTemplates();

  const handleSelectTemplate = (template: ProjectTemplate) => {
    onSelectTemplate(template);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New from Template">
      <div className="template-browser">
        <p className="template-browser-intro">
          Choose a template to start your project. You can customize dimensions and divisions in the next step.
        </p>
        <div className="template-browser-grid">
          {templates.map((template) => (
            <button
              key={template.id}
              className="template-card"
              onClick={() => handleSelectTemplate(template)}
            >
              <div className="template-card-icon">
                {categoryIcons[template.category || 'general']}
              </div>
              <div className="template-card-content">
                <div className="template-card-name">{template.name}</div>
                <div className="template-card-description">
                  {template.description}
                </div>
                <div className="template-card-category">
                  {categoryLabels[template.category || 'general']}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
};
