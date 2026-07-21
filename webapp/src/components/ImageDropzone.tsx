import { useCallback, useRef, useState, type DragEvent } from 'react';

export interface PickedImage {
  file: File;
  previewUrl: string;
}

export function ImageDropzone({
  onPick,
  label = 'Drop an image or click to browse',
}: {
  onPick: (image: PickedImage) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file || !file.type.startsWith('image/')) return;
      const url = URL.createObjectURL(file);
      setPreview(url);
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
          <span className="text-2xl">🖼️</span>
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
