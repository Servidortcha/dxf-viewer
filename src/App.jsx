import { useState, useRef, useCallback, useEffect } from 'react';
import Viewer from './components/Viewer';
import Toolbar from './components/Toolbar';
import { parseDxfText } from './lib/dxf';
import { computeMeasurement, formatValue, formatAngle } from './lib/measure';
import { FolderOpen, Triangle } from 'lucide-react';

const UNIT_NAMES = {
  0: 'sin unidad', 1: 'pulgadas', 2: 'pies', 3: 'millas', 4: 'milímetros',
  5: 'centímetros', 6: 'metros', 7: 'kilómetros'
};

const TYPE_NAMES = {
  distance: 'Distancia',
  length: 'Longitud',
  area: 'Área',
  angle: 'Ángulo'
};

export default function App() {
  const [doc, setDoc] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [tool, setTool] = useState('pan');
  const [pending, setPending] = useState([]);
  const [measurements, setMeasurements] = useState([]);
  const [hoverPt, setHoverPt] = useState(null);

  const fileRef = useRef(null);
  const viewerRef = useRef(null);
  const pendingRef = useRef([]);
  useEffect(() => { pendingRef.current = pending; }, [pending]);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const text = new TextDecoder('windows-1252').decode(buf);
      const parsed = parseDxfText(text);
      setDoc({ ...parsed, file });
      setFileName(file.name);
      setMeasurements([]);
      setPending([]);
      setError('');
      requestAnimationFrame(() => viewerRef.current && viewerRef.current.fit());
    } catch (err) {
      setError('No se pudo leer el archivo: ' + err.message);
    }
  }, []);

  const handleTap = useCallback((pt) => {
    if (tool === 'pan' || !doc) return;
    const next = [...pendingRef.current, pt];
    if (tool === 'distance' && next.length >= 2) {
      const m = computeMeasurement('distance', next);
      if (m) m.label = formatValue(m.value, doc.units);
      setMeasurements((ms) => (m ? [...ms, m] : ms));
      setPending([]);
      return;
    }
    if (tool === 'angle' && next.length >= 3) {
      const m = computeMeasurement('angle', next);
      if (m) m.label = formatAngle(m.value);
      setMeasurements((ms) => (m ? [...ms, m] : ms));
      setPending([]);
      return;
    }
    setPending(next);
  }, [tool, doc]);

  const finalize = useCallback(() => {
    if ((tool === 'length' || tool === 'area') && doc) {
      const prev = pendingRef.current;
      if (prev.length >= (tool === 'area' ? 3 : 2)) {
        const m = computeMeasurement(tool, prev);
        if (m) {
          if (tool === 'length') m.label = 'L = ' + formatValue(m.value, doc.units);
          else m.label = 'A = ' + formatValue(m.value, doc.units, 'area') + ' | P = ' + formatValue(m.perimeter, doc.units);
          setMeasurements((ms) => [...ms, m]);
        }
        setPending([]);
      }
    }
    setHoverPt(null);
  }, [tool, doc]);

  const undoPoint = useCallback(() => setPending((prev) => prev.slice(0, -1)), []);

  const clearAll = useCallback(() => {
    setPending([]);
    setMeasurements([]);
    setHoverPt(null);
  }, []);

  const chooseTool = useCallback((t) => {
    setTool(t);
    setPending([]);
    setHoverPt(null);
  }, []);

  const removeMeasurement = useCallback((idx) => {
    setMeasurements((ms) => ms.filter((_, i) => i !== idx));
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon">
            <Triangle size={18} strokeWidth={2.2} />
          </span>
          DXF Medidor
        </div>
        <button className="ghost" onClick={() => fileRef.current && fileRef.current.click()}>
          <FolderOpen size={18} /> <span className="file-name">{fileName || 'Abrir archivo .dxf'}</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=""
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files && e.target.files[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
        {doc && <span className="badge unit-badge">Unidad: {UNIT_NAMES[doc.units] || 'sin unidad'}</span>}
      </header>

      {error && <div className="error-banner">{error}</div>}

      <Toolbar tool={tool} onChoose={chooseTool} viewerRef={viewerRef} />

      <main className="stage">
        {doc ? (
          <Viewer
            ref={viewerRef}
            primitives={doc.primitives}
            bounds={doc.bounds}
            units={doc.units}
            tool={tool}
            pending={pending}
            measurements={measurements}
            hover={hoverPt}
            onTap={handleTap}
            onHover={setHoverPt}
          />
        ) : (
          <div className="empty" onClick={() => fileRef.current && fileRef.current.click()}>
            <div className="empty-icon"><FolderOpen size={48} /></div>
            <h2>Tocá para abrir un archivo DXF</h2>
            <p>Seleccioná un plano en tu teléfono y empezá a medir.</p>
            <button className="primary">Elegir archivo</button>
          </div>
        )}
      </main>

      <aside className="panel">
        <div className="panel-head">
          Mediciones
          {measurements.length > 0 && <span className="badge">{measurements.length}</span>}
          {measurements.length > 0 && (
            <button className="ghost small danger" onClick={clearAll}>Limpiar todo</button>
          )}
        </div>
        {measurements.length === 0 ? (
          <p className="hint">Elegí una herramienta abajo y tocá sobre el plano para tomar puntos.</p>
        ) : (
          <ul className="results">
            {measurements.map((m, i) => (
              <li key={i}>
                <span className="result-type">{TYPE_NAMES[m.type]}</span>
                <strong>{m.label}</strong>
                <button className="ghost small" onClick={() => removeMeasurement(i)} aria-label="Eliminar">✕</button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className={`pending-bar ${pending.length > 0 ? 'show' : ''}`}>
        <span className="dots">
          {pending.map((_, i) => <i key={i} />)}
        </span>
        <span className="pending-msg">
          {tool === 'angle'
            ? (pending.length === 0 ? 'Tocá el vértice del ángulo' : pending.length === 1 ? 'Tocá el 1er lado' : 'Tocá el 2do lado para fijar el ángulo')
            : tool === 'distance'
              ? (pending.length === 0 ? 'Tocá el primer punto' : 'Tocá el segundo punto')
              : tool === 'area'
                ? 'Tocá los vértices del contorno (mín. 3)'
                : tool === 'length'
                  ? 'Tocá los puntos del recorrido'
                  : ''}
        </span>
        {pending.length > 0 && (
          <span className="pending-actions">
            <button className="ghost small" onClick={undoPoint}>Deshacer</button>
            <button className="primary small" onClick={finalize}>
              {tool === 'area' ? 'Cerrar' : tool === 'length' ? 'Finalizar' : 'Listo'}
            </button>
          </span>
        )}
      </div>
    </div>
  );
}