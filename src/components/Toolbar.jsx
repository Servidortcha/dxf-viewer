import { ZoomIn, ZoomOut, Maximize2, Ruler, Route, Shapes, Triangle, Move } from 'lucide-react';

const TOOLS = [
  { id: 'pan', label: 'Navegar', icon: Move },
  { id: 'distance', label: 'Distancia', icon: Ruler },
  { id: 'length', label: 'Longitud', icon: Route },
  { id: 'area', label: 'Área', icon: Shapes },
  { id: 'angle', label: 'Ángulo', icon: Triangle }
];

export default function Toolbar({ tool, onChoose, viewerRef }) {
  return (
    <div className="toolbar">
      <div className="tool-group">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          const active = tool === t.id;
          return (
            <button
              key={t.id}
              className={`tool ${active ? 'active' : ''} ${t.id === 'pan' ? 'tool-pan' : 'tool-measure'}`}
              onClick={() => onChoose(t.id)}
              title={t.label}
            >
              <Icon size={20} />
              <span className="tool-label">{t.label}</span>
            </button>
          );
        })}
      </div>
      <div className="tool-group">
        <button className="tool plain" onClick={() => viewerRef.current && viewerRef.current.zoomIn()} title="Acercar">
          <ZoomIn size={20} />
        </button>
        <button className="tool plain" onClick={() => viewerRef.current && viewerRef.current.zoomOut()} title="Alejar">
          <ZoomOut size={20} />
        </button>
        <button className="tool plain" onClick={() => viewerRef.current && viewerRef.current.fit()} title="Ajustar a pantalla">
          <Maximize2 size={20} />
        </button>
      </div>
    </div>
  );
}