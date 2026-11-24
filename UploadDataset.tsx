import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { FileSpreadsheet, UploadCloud, X } from 'lucide-react';
import { api } from '../lib/api';
import { ACCEPTED, parseFile, type ParsedFile } from '../lib/parseFile';
import type { Dataset, Model, Project } from '../lib/types';
import { bytes, intf } from '../lib/format';
import { Badge, Button, Field, InlineError, Input, Modal, Note, Select, useToast } from './ui';

const KINDS: { value: Dataset['kind']; label: string; hint: string }[] = [
  { value: 'reference', label: 'Reference', hint: 'Training / baseline window used as the drift comparison point.' },
  { value: 'production', label: 'Production', hint: 'Live window to be compared against the reference.' },
  { value: 'prediction', label: 'Predictions', hint: 'Model outputs for a scored window.' },
  { value: 'ground_truth', label: 'Ground truth', hint: 'Labels collected after the fact.' },
];

export default function UploadDataset({
  open,
  onClose,
  onUploaded,
  projects,
  models,
  defaultProjectId,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
  projects: Project[];
  models: Model[];
  defaultProjectId?: number;
}) {
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [parsing, setParsing] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Dataset['kind']>('reference');
  const [projectId, setProjectId] = useState(String(defaultProjectId || projects[0]?.id || ''));
  const [modelId, setModelId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { push } = useToast();

  const reset = () => {
    setParsed(null);
    setName('');
    setError(null);
    setKind('reference');
    setModelId('');
  };

  const handleFile = async (file: File) => {
    setError(null);
    setParsing(true);
    try {
      const result = await parseFile(file);
      setParsed(result);
      if (!name) setName(file.name.replace(/\.[^.]+$/, ''));
    } catch (err) {
      setParsed(null);
      setError(err instanceof Error ? err.message : 'Failed to parse the file.');
    } finally {
      setParsing(false);
    }
  };

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const submit = async () => {
    if (!parsed) return setError('Select a file to upload.');
    if (!name.trim()) return setError('Dataset name is required.');
    if (!projectId) return setError('Select a project.');
    setUploading(true);
    setError(null);
    try {
      await api.post('/api/datasets', {
        project_id: Number(projectId),
        model_id: modelId ? Number(modelId) : null,
        name: name.trim(),
        kind,
        file_name: parsed.fileName,
        file_size: parsed.fileSize,
        rows: parsed.rows,
      });
      push('success', `Uploaded ${intf(parsed.rows.length)} rows and profiled ${parsed.columns.length} columns.`);
      reset();
      onUploaded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const projectModels = models.filter((m) => String(m.project_id) === projectId);

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Upload dataset"
      description="CSV, TSV or Excel. Parsed in your browser, profiled and validated on the server."
      width="max-w-2xl"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={uploading} disabled={!parsed}>
            Upload dataset
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!parsed ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ' +
              (dragging ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2 hover:border-line-strong')
            }
          >
            <UploadCloud className="h-7 w-7 text-muted" />
            <p className="text-[14px] font-medium text-ink">
              {parsing ? 'Parsing file…' : 'Drop a file here or click to browse'}
            </p>
            <p className="text-[12.5px] text-muted">{ACCEPTED.join(', ')} · up to 10 MB · max 20,000 rows</p>
            <input ref={inputRef} type="file" accept={ACCEPTED.join(',')} className="hidden" onChange={onInput} />
          </div>
        ) : (
          <div className="rounded-lg border border-line bg-surface-2 p-3.5">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-ink">{parsed.fileName}</p>
                <p className="tnum mt-0.5 text-[12.5px] text-muted">
                  {intf(parsed.rows.length)} rows · {parsed.columns.length} columns · {bytes(parsed.fileSize)}
                </p>
              </div>
              <button
                onClick={() => setParsed(null)}
                aria-label="Remove file"
                className="rounded p-1 text-muted hover:bg-surface-3 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {parsed.columns.slice(0, 14).map((c) => (
                <Badge key={c} tone="muted" className="normal-case">
                  {c}
                </Badge>
              ))}
              {parsed.columns.length > 14 && <Badge tone="muted">+{parsed.columns.length - 14} more</Badge>}
            </div>
            {parsed.truncated && (
              <p className="mt-2.5 text-[12.5px] text-warn">
                Only the first 20,000 rows will be uploaded — the remainder was truncated.
              </p>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dataset name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Production window — March" />
          </Field>
          <Field label="Project" required>
            <Select
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setModelId('');
              }}
            >
              <option value="">Select a project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dataset role" required hint={KINDS.find((k) => k.value === kind)?.hint}>
            <Select value={kind} onChange={(e) => setKind(e.target.value as Dataset['kind'])}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Associated model" hint="Optional — links the dataset to a registered model.">
            <Select value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={!projectModels.length}>
              <option value="">{projectModels.length ? 'None' : 'No models in this project'}</option>
              {projectModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Note>
          Column types, missing-value rates, duplicates and distribution statistics are computed on the server from the
          uploaded rows — nothing is inferred client-side or estimated.
        </Note>

        {error && <InlineError message={error} />}
      </div>
    </Modal>
  );
}
