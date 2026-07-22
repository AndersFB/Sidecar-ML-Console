import { useEffect, useRef, useState } from 'react';
import { MicRecorder } from '../utils/recorder';
import { Button } from './Primitives';

/** Recording grows ~11.5 MB of buffered audio per minute and keeps doing so
 * even while the panel is hidden, so cap it. Five minutes is far above any
 * realistic clip and still well under the server's 50 MB upload cap. */
const MAX_RECORDING_MS = 5 * 60 * 1000;

/** File upload + microphone recording (encoded to WAV client-side). */
export function AudioInput({ onAudio }: { onAudio: (audio: Blob, name: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MicRecorder | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  // Panels remount this component (key bump) on Clear — without teardown an
  // in-progress recording would keep the mic live and buffering forever.
  useEffect(
    () => () => {
      if (autoStopRef.current !== null) clearTimeout(autoStopRef.current);
      recorderRef.current?.discard();
      recorderRef.current = null;
    },
    [],
  );

  const finishRecording = async (autoStopped: boolean) => {
    const recorder = recorderRef.current;
    if (!recorder?.isRecording) return;
    if (autoStopRef.current !== null) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    try {
      const blob = await recorder.stop();
      setRecording(false);
      const stamp = new Date().toISOString().slice(11, 19);
      setFileName(`recording-${stamp}.wav${autoStopped ? ' (auto-stopped at 5 min)' : ''}`);
      onAudio(blob, 'recording.wav');
    } catch (error) {
      recorder.discard();
      setRecording(false);
      setMicError(error instanceof Error ? error.message : 'Recording failed');
    }
  };
  // The auto-stop timer must call the latest render's closure, not the one
  // captured five minutes ago.
  const finishRef = useRef(finishRecording);
  finishRef.current = finishRecording;

  const toggleRecording = async () => {
    setMicError(null);
    try {
      if (!recording) {
        recorderRef.current = new MicRecorder();
        await recorderRef.current.start();
        setRecording(true);
        autoStopRef.current = window.setTimeout(() => {
          autoStopRef.current = null;
          void finishRef.current(true);
        }, MAX_RECORDING_MS);
      } else {
        await finishRecording(false);
      }
    } catch (error) {
      recorderRef.current?.discard();
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
