import type { ComponentType } from 'react';
import { ChatPanel } from './ChatPanel';
import { OcrPanel } from './OcrPanel';
import { SubjectMaskPanel } from './SubjectMaskPanel';
import { PersonSegPanel } from './PersonSegPanel';
import { BarcodePanel } from './BarcodePanel';
import { ClassifyPanel } from './ClassifyPanel';
import { SimilarityPanel } from './SimilarityPanel';
import { FacesPanel } from './FacesPanel';
import { PosePanel } from './PosePanel';
import { DocumentPanel } from './DocumentPanel';
import { TranscribePanel } from './TranscribePanel';
import { SpeakPanel } from './SpeakPanel';
import { TranslatePanel } from './TranslatePanel';
import { NlpPanel } from './NlpPanel';
import { SoundPanel } from './SoundPanel';
import { ShazamPanel } from './ShazamPanel';
import { ImageGenPanel } from './ImageGenPanel';

export interface PanelDef {
  id: string;
  capabilityId: string;
  title: string;
  icon: string;
  group: string;
  component: ComponentType;
}

export const PANELS: PanelDef[] = [
  { id: 'chat', capabilityId: 'chat', title: 'Chat', icon: '🧠', group: 'Language', component: ChatPanel },
  { id: 'translate', capabilityId: 'translation', title: 'Translate', icon: '🌍', group: 'Language', component: TranslatePanel },
  { id: 'nlp', capabilityId: 'nlp', title: 'Text Analysis', icon: '🔎', group: 'Language', component: NlpPanel },

  { id: 'ocr', capabilityId: 'vision-ocr', title: 'OCR', icon: '🔤', group: 'Vision', component: OcrPanel },
  { id: 'subject-mask', capabilityId: 'vision-subjects', title: 'Remove Background', icon: '✂️', group: 'Vision', component: SubjectMaskPanel },
  { id: 'person-seg', capabilityId: 'vision-subjects', title: 'Person Mask', icon: '🚶', group: 'Vision', component: PersonSegPanel },
  { id: 'barcodes', capabilityId: 'vision-analysis', title: 'Barcodes & QR', icon: '📷', group: 'Vision', component: BarcodePanel },
  { id: 'classify', capabilityId: 'vision-analysis', title: 'Classify', icon: '🏷️', group: 'Vision', component: ClassifyPanel },
  { id: 'similarity', capabilityId: 'vision-analysis', title: 'Image Similarity', icon: '🪞', group: 'Vision', component: SimilarityPanel },
  { id: 'faces', capabilityId: 'vision-detectors', title: 'Faces', icon: '🙂', group: 'Vision', component: FacesPanel },
  { id: 'pose', capabilityId: 'vision-detectors', title: 'Pose', icon: '🤸', group: 'Vision', component: PosePanel },
  { id: 'document', capabilityId: 'vision-detectors', title: 'Document Scan', icon: '📄', group: 'Vision', component: DocumentPanel },
  { id: 'image-gen', capabilityId: 'image-gen', title: 'Generate Image', icon: '🎨', group: 'Vision', component: ImageGenPanel },

  { id: 'transcribe', capabilityId: 'speech-transcribe', title: 'Transcribe', icon: '🎙️', group: 'Audio', component: TranscribePanel },
  { id: 'speak', capabilityId: 'speech-speak', title: 'Speak', icon: '🗣️', group: 'Audio', component: SpeakPanel },
  { id: 'sound', capabilityId: 'sound', title: 'Sound Events', icon: '👂', group: 'Audio', component: SoundPanel },
  { id: 'shazam', capabilityId: 'shazam', title: 'Song ID', icon: '🎵', group: 'Audio', component: ShazamPanel },
];
