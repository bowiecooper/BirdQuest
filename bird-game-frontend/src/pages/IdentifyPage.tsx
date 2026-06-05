import { useState, type ChangeEvent, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import { predict } from '../lib/inference.ts';
import { downscaleForInference } from '../lib/image.ts';
import { saveSighting } from '../lib/sightings.ts';
import type { PredictResponse } from '../types/predict.ts';
import './IdentifyPage.css';

// Generous limit so users can upload full-quality photos straight off a camera
// or laptop. 50 MB matches Supabase Storage's default per-file limit.
const MAX_MB = 50;

type Phase = 'upload' | 'preview' | 'identifying' | 'results' | 'saving' | 'saved';

export default function IdentifyPage() {
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null); // class_index
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPhase('upload');
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setChosenIndex(null);
    setShowHeatmap(false);
    setNotes('');
    setError(null);
  };

  const acceptFile = (f: File) => {
    setError(null);
    if (!f.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`Image must be under ${MAX_MB} MB.`);
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setPhase('preview');
  };

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) acceptFile(f);
  };

  const handleIdentify = async () => {
    if (!file) return;
    setPhase('identifying');
    setError(null);
    try {
      // Send a downscaled copy for inference; the full-res original is kept for
      // Storage when the sighting is saved.
      const forInference = await downscaleForInference(file);
      const res = await predict(forInference);
      setResult(res);
      setChosenIndex(res.predictions[0]?.class_index ?? null);
      setShowHeatmap(Boolean(res.gradcam));
      setPhase('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Identification failed.');
      setPhase('preview');
    }
  };

  const handleSave = async () => {
    if (!user || !file || !result || chosenIndex === null) return;
    const chosen = result.predictions.find((p) => p.class_index === chosenIndex);
    if (!chosen) return;
    setPhase('saving');
    setError(null);
    try {
      await saveSighting({
        userId: user.id,
        file,
        chosen,
        top5: result.predictions,
        notes,
      });
      setPhase('saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save sighting.');
      setPhase('results');
    }
  };

  // --- Saved confirmation ---------------------------------------------------
  if (phase === 'saved') {
    return (
      <div className="page">
        <h1>Added to your life list 🎉</h1>
        <p className="page-lead">Your sighting was saved.</p>
        <div className="identify-actions">
          <button className="btn-primary" onClick={reset}>
            Identify another
          </button>
          <Link to="/me" className="btn-secondary">
            View my life list
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Identify a bird</h1>
      <p className="page-lead">
        Upload a photo — the model returns its top-5 guesses with a Grad-CAM heat
        map of where it looked. Confirm the species to add it to your life list.
      </p>

      {error && <p className="identify-error">{error}</p>}

      {/* Upload */}
      {phase === 'upload' && (
        <div
          className="upload-area"
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <div className="upload-icon">📸</div>
          <h3>Drop a bird photo here</h3>
          <p>or</p>
          <label htmlFor="file-input" className="btn-primary">
            Choose file
          </label>
          <input
            id="file-input"
            type="file"
            accept="image/*"
            onChange={onFileInput}
            hidden
          />
          <p className="upload-hint">JPG, PNG, GIF up to {MAX_MB} MB</p>
        </div>
      )}

      {/* Preview + identify */}
      {(phase === 'preview' || phase === 'identifying') && previewUrl && (
        <div className="identify-stage">
          <img className="stage-image" src={previewUrl} alt="Selected bird" />
          <div className="identify-actions">
            <button
              className="btn-primary"
              onClick={handleIdentify}
              disabled={phase === 'identifying'}
            >
              {phase === 'identifying' ? 'Identifying…' : 'Identify bird'}
            </button>
            <button
              className="btn-secondary"
              onClick={reset}
              disabled={phase === 'identifying'}
            >
              Choose different
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {(phase === 'results' || phase === 'saving') && result && previewUrl && (
        <div className="results-grid">
          <div className="results-image">
            <img
              className="stage-image"
              src={showHeatmap && result.gradcam ? result.gradcam : previewUrl}
              alt={showHeatmap ? 'Grad-CAM heat map' : 'Selected bird'}
            />
            {result.gradcam && (
              <button
                className="heatmap-toggle"
                onClick={() => setShowHeatmap((s) => !s)}
              >
                {showHeatmap ? 'Show photo' : 'Show heat map'}
              </button>
            )}
          </div>

          <div className="results-panel">
            <h3>Top 5 guesses</h3>
            <ul className="prediction-list">
              {result.predictions.map((p) => {
                const pct = Math.round(p.probability * 100);
                const selected = p.class_index === chosenIndex;
                return (
                  <li key={p.class_index}>
                    <button
                      className={`prediction${selected ? ' selected' : ''}`}
                      onClick={() => setChosenIndex(p.class_index)}
                    >
                      <span className="prediction-top">
                        <span className="prediction-name">{p.common_name}</span>
                        <span className="prediction-pct">{pct}%</span>
                      </span>
                      <span className="confidence-track">
                        <span
                          className="confidence-fill"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <label className="notes-label">
              Notes <span className="auth-optional">(optional)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Where did you spot it?"
              />
            </label>

            <div className="identify-actions">
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={phase === 'saving' || chosenIndex === null}
              >
                {phase === 'saving' ? 'Saving…' : 'Save to life list'}
              </button>
              <button
                className="btn-secondary"
                onClick={reset}
                disabled={phase === 'saving'}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
