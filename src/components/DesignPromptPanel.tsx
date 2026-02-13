import { useBoxStore } from '../store/useBoxStore';

export function DesignPromptPanel() {
  const {
    designPrompt,
    designLoading,
    setDesignPrompt,
    submitDesign,
    closeDesignPanel,
    cancelDesign,
  } = useBoxStore();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!designLoading && designPrompt.trim()) {
        submitDesign();
      }
    }
    if (e.key === 'Escape') {
      cancelDesign();
    }
  };

  return (
    <div className="design-prompt-panel">
      <div className="design-prompt-input">
        <textarea
          value={designPrompt}
          onChange={(e) => setDesignPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe your box... (e.g. &quot;open-top organizer, 200x50x150, 3x2 grid&quot;)"
          disabled={designLoading}
          rows={2}
        />
      </div>
      <div className="design-prompt-actions">
        <button
          className="design-btn preview"
          onClick={submitDesign}
          disabled={designLoading || !designPrompt.trim()}
        >
          {designLoading ? 'Generating...' : 'Preview'}
        </button>
        <button className="design-btn done" onClick={closeDesignPanel}>
          Done
        </button>
        <button className="design-btn cancel" onClick={cancelDesign}>
          Cancel
        </button>
      </div>
    </div>
  );
}
