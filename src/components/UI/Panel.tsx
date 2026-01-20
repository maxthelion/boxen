import React from 'react';

interface PanelProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export const Panel: React.FC<PanelProps> = ({ title, children, className = '' }) => {
  return (
    <div className={`panel ${className}`}>
      <h3 className="panel-title">{title}</h3>
      <div className="panel-content">{children}</div>
    </div>
  );
};
