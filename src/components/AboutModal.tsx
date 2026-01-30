import React from 'react';
import { Modal } from './UI/Modal';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="About Boxen">
      <div className="about-modal-content">
        <section className="about-section">
          <h3>What is Boxen?</h3>
          <p>
            Boxen is a web-based 3D parametric box designer for laser cutting.
            It allows you to design custom boxes with configurable dimensions,
            finger joints, dividers, and nested compartments, then export SVG
            files ready for laser cutting.
          </p>
        </section>

        <section className="about-section">
          <h3>What can you make?</h3>
          <ul>
            <li><strong>Storage boxes</strong> - Custom organizers with dividers for tools, crafts, or collections</li>
            <li><strong>Grid organizers</strong> - Multi-compartment trays for small parts</li>
            <li><strong>Drawers and inserts</strong> - Nested boxes that fit inside each other</li>
            <li><strong>Custom enclosures</strong> - Project boxes with open faces or custom cutouts</li>
          </ul>
        </section>

        <section className="about-section">
          <h3>Key Features</h3>
          <ul>
            <li><strong>3D Preview</strong> - See your box design in real-time 3D</li>
            <li><strong>Finger Joints</strong> - Automatic interlocking joints for strong assembly</li>
            <li><strong>Cross-Lap Joints</strong> - Dividers interlock for sturdy internal structure</li>
            <li><strong>Subdivisions</strong> - Split the interior into compartments on any axis</li>
            <li><strong>Sub-Assemblies</strong> - Add nested boxes, drawers, or trays</li>
            <li><strong>SVG Export</strong> - Export flat patterns ready for laser cutting</li>
            <li><strong>Templates</strong> - Start from pre-built designs and customize</li>
          </ul>
        </section>

        <section className="about-section">
          <h3>How to Use</h3>
          <ol>
            <li>Set your box dimensions and material thickness in the right panel</li>
            <li>Use the Structure tree to select faces or voids</li>
            <li>Use tools to subdivide, move dividers, or add sub-assemblies</li>
            <li>Toggle faces open/closed by clicking the solid button</li>
            <li>Export to SVG when ready to cut</li>
          </ol>
        </section>

        <section className="about-section about-footer">
          <p>
            Built with React, Three.js, and TypeScript.
          </p>
        </section>
      </div>
    </Modal>
  );
};
