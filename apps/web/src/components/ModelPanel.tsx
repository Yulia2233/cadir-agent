import {
  Box,
  BoxSelect,
  Focus,
  Grid3X3,
  Maximize2,
  Orbit,
  ScanLine,
  SquareDashedMousePointer,
} from 'lucide-react';
import { IconButton } from './IconButton';
import { CadViewer } from './CadViewer';

export function ModelPanel({
  selectionMode,
  onMode,
  glbUrl = null,
}: {
  selectionMode: 'face' | 'edge';
  onMode: (mode: 'face' | 'edge') => void;
  glbUrl?: string | null;
}) {
  return (
    <aside className="model-panel" aria-label="Model viewer">
      <header className="model-header">
        <div>
          <span className="panel-kicker">Current model</span>
          <strong>No revision</strong>
        </div>
        <IconButton label="Expand viewer">
          <Maximize2 size={17} />
        </IconButton>
      </header>
      <div className="viewer-toolbar">
        <IconButton label="Fit view">
          <Focus size={17} />
        </IconButton>
        <IconButton label="Isometric view">
          <Orbit size={17} />
        </IconButton>
        <IconButton label="Toggle orthographic projection">
          <BoxSelect size={17} />
        </IconButton>
        <IconButton label="Toggle BRep edges">
          <Grid3X3 size={17} />
        </IconButton>
        <div className="toolbar-divider" />
        <button
          className={selectionMode === 'face' ? 'tool-selected' : ''}
          onClick={() => onMode('face')}
          title="Select faces"
        >
          <SquareDashedMousePointer size={17} />
          <span>Face</span>
        </button>
        <button
          className={selectionMode === 'edge' ? 'tool-selected' : ''}
          onClick={() => onMode('edge')}
          title="Select edges"
        >
          <ScanLine size={17} />
          <span>Edge</span>
        </button>
      </div>
      {glbUrl === null ? (
        <div className="viewer-canvas empty">
          <div className="axis-cue">
            <span className="axis-z">Z</span>
            <span className="axis-y">Y</span>
            <span className="axis-x">X</span>
          </div>
          <div>
            <Box size={36} />
            <strong>Model viewer</strong>
            <span>A validated revision will appear here.</span>
          </div>
        </div>
      ) : (
        <CadViewer url={glbUrl} />
      )}
      <section className="model-summary">
        <h2>Geometry</h2>
        <dl>
          <div>
            <dt>Revision</dt>
            <dd>-</dd>
          </div>
          <div>
            <dt>Units</dt>
            <dd>mm</dd>
          </div>
          <div>
            <dt>Bounding box</dt>
            <dd>-</dd>
          </div>
          <div>
            <dt>Solid count</dt>
            <dd>-</dd>
          </div>
          <div>
            <dt>Volume</dt>
            <dd>-</dd>
          </div>
          <div>
            <dt>Faces / edges</dt>
            <dd>-</dd>
          </div>
        </dl>
      </section>
      <section className="selection-summary">
        <h2>Selection</h2>
        <p>
          Select {selectionMode === 'edge' ? 'an edge' : 'a face'} to inspect exact BRep geometry.
        </p>
      </section>
    </aside>
  );
}
