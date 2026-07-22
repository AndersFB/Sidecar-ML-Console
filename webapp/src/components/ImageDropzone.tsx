import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { Icon } from './Icon';

export interface PickedImage {
  file: File;
  previewUrl: string;
}

/**
 * Rebuilds the preview URL for a PickedImage restored from storage —
 * blob: URLs die with the page that created them.
 */
export function revivePickedImage(stored: PickedImage | null): PickedImage | null {
  return stored ? { file: stored.file, previewUrl: URL.createObjectURL(stored.file) } : stored;
}

export function ImageDropzone({
  onPick,
  label = 'Drop an image or click to browse',
  preview: previewProp,
}: {
  onPick: (image: PickedImage) => void;
  label?: string;
  /** Controlled preview URL; pass null for the empty state. Omit to let the dropzone track its own. */
  preview?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [internalPreview, setInternalPreview] = useState<string | null>(null);
  const preview = previewProp !== undefined ? previewProp : internalPreview;
  // Each object URL pins its file in memory until revoked.
  const previewRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  // Controlled previews include URLs this component never made — ones
  // `revivePickedImage` minted during hydration. Revoke whichever URL a new
  // preview (or a clear) replaces, or it pins its File until page unload.
  // Revoking an already-revoked URL is a no-op, so overlap with previewRef
  // is harmless.
  const lastControlledRef = useRef<string | null>(null);
  useEffect(() => {
    const previous = lastControlledRef.current;
    const current = previewProp ?? null;
    if (previous && previous !== current && previous.startsWith('blob:')) {
      URL.revokeObjectURL(previous);
    }
    lastControlledRef.current = current;
  }, [previewProp]);

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file || !file.type.startsWith('image/')) return;
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      const url = URL.createObjectURL(file);
      previewRef.current = url;
      setInternalPreview(url);
      onPick({ file, previewUrl: url });
    },
    [onPick],
  );

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      setDragging(false);
      handleFile(event.dataTransfer.files?.[0]);
    },
    [handleFile],
  );

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-sm transition-colors ${
        dragging ? 'border-cyan-a bg-cyan-a/10 text-cyan-a' : 'border-line text-ink-3 hover:border-cyan-a/50'
      }`}
    >
      {preview ? (
        <img src={preview} alt="Selected input" className="max-h-40 rounded-lg object-contain" />
      ) : (
        <>
          <Icon name="image" size={28} className="text-ink-3" />
          <span>{label}</span>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        data-testid="image-input"
        onChange={(event) => handleFile(event.target.files?.[0])}
      />
    </button>
  );
}
