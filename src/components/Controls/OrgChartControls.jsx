import { OrgChartMenu } from './OrgChartMenu';
import './Controls.css';

export function OrgChartControls({
  charts, activeChartId, onSwitchChart, onAddChart, onRenameChart, onDeleteChart, onImportChart,
  hasPeople, onAddPerson, onZoomIn, onZoomOut, onFitToScreen,
  focusedPersonId, focusedPersonName, onClearFocus, onExportSvg, onExportPng,
  showCardControls, onToggleCardControls,
}) {
  return (
    <div className="controls">
      <OrgChartMenu
        charts={charts}
        activeId={activeChartId}
        onSwitch={onSwitchChart}
        onAdd={onAddChart}
        onRename={onRenameChart}
        onDelete={onDeleteChart}
        onImport={onImportChart}
        onExportSvg={onExportSvg}
        onExportPng={onExportPng}
        hasPeople={hasPeople}
      />
      <div className="controls__sep" />

      <button className="ctrl-btn" onClick={onZoomIn} title="Zoom in">+</button>
      <button className="ctrl-btn" onClick={onZoomOut} title="Zoom out">−</button>
      <div className="controls__sep" />
      <button className="ctrl-btn ctrl-btn--text" onClick={onFitToScreen} title="Fit to screen">Fit</button>
      <div className="controls__sep" />
      <button
        className={`ctrl-btn ctrl-btn--text${showCardControls ? ' is-active' : ''}`}
        onClick={onToggleCardControls}
        title={showCardControls ? 'Hide card controls' : 'Show card controls'}
      >
        Controls
      </button>

      {focusedPersonId && (
        <>
          <div className="controls__sep" />
          <span className="controls__period" style={{ minWidth: 'auto' }}>
            Focused: {focusedPersonName}
          </span>
          <button className="ctrl-btn ctrl-btn--text" onClick={onClearFocus} title="Show all">Show all</button>
        </>
      )}

      <div className="controls__spacer" />
      <button className="ctrl-btn ctrl-btn--accent" onClick={onAddPerson}>
        <span>+</span> <span className="controls__add-label">Add person</span>
      </button>
    </div>
  );
}
