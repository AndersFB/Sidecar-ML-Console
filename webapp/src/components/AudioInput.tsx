import { useRef, useState } from 'react';
import { MicRecorder } from '../utils/recorder';
import { Button } from './Primitives';

/** File upload + microphone recording (encoded to WAV client-side). */
export function AudioInput({ onAudio }: { onAudio: (audio: Blob, name: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MicRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  const toggleRecording = async () => {
    setMicError(null);
    try {
      if (!recording) {
        recorderRef.current = new MicRecorder();
        await recorderRef.current.start();
        setRecording(true);
      } else {
        const blob = await recorderRef.current!.stop();
        setRecording(false);
        setFileName(`recording-${new Date().toISOString().slice(11, 19)}.wav`);
        onAudio(blob, 'recording.wav');
      }
    } catch (error) {
      setRecording(false);
      setMicError(
        error instanceof Error
          ? `Microphone unavailable: ${error.message} (mic capture needs http://localhost)`
          : 'Microphone unavailable',
      );
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={() => inputRef.current?.click()}>
          Choose audio file
        </Button>
        <Button variant={recording ? 'danger' : 'ghost'} onClick={() => void toggleRecording()}>
          {recording ? '■ Stop recording' : '● Record microphone'}
        </Button>
        {fileName && <span className="text-xs text-ink-3">{fileName}</span>}
      </div>
      <p className="text-xs text-ink-3">
        WAV, M4A/AAC, MP3, AIFF, CAF or FLAC. Mic recordings are encoded to WAV in the browser.
      </p>
      {micError && <p className="text-xs text-amber-a">{micError}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.wav,.m4a,.mp3,.aiff,.caf,.flac"
        hidden
        data-testid="audio-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            setFileName(file.name);
            onAudio(file, file.name);
          }
        }}
      />
    </div>
  );
}
