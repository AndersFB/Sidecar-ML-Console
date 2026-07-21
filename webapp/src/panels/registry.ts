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
  { id: 'chat', capabilityId: 'chat', title: 'Chat', icon: 'chat', group: 'Language', component: ChatPanel },
  { id: 'translate', capabilityId: 'translation', title: 'Translate', icon: 'globe', group: 'Language', component: TranslatePanel },
  { id: 'nlp', capabilityId: 'nlp', title: 'Text Analysis', icon: 'text-search', group: 'Language', component: NlpPanel },

  { id: 'ocr', capabilityId: 'vision-ocr', title: 'OCR', icon: 'scan-text', group: 'Vision', component: OcrPanel },
  { id: 'subject-mask', capabilityId: 'vision-subjects', title: 'Remove Background', icon: 'scissors', group: 'Vision', component: SubjectMaskPanel },
  { id: 'person-seg', capabilityId: 'vision-subjects', title: 'Person Mask', icon: 'person', group: 'Vision', component: PersonSegPanel },
  { id: 'barcodes', capabilityId: 'vision-analysis', title: 'Barcodes & QR', icon: 'qr', group: 'Vision', component: BarcodePanel },
  { id: 'classify', capabilityId: 'vision-analysis', title: 'Classify', icon: 'tag', group: 'Vision', component: ClassifyPanel },
  { id: 'similarity', capabilityId: 'vision-analysis', title: 'Image Similarity', icon: 'images', group: 'Vision', component: SimilarityPanel },
  { id: 'faces', capabilityId: 'vision-detectors', title: 'Faces', icon: 'smile', group: 'Vision', component: FacesPanel },
  { id: 'pose', capabilityId: 'vision-detectors', title: 'Pose', icon: 'pose', group: 'Vision', component: PosePanel },
  { id: 'document', capabilityId: 'vision-detectors', title: 'Document Scan', icon: 'file-text', group: 'Vision', component: DocumentPanel },
  { id: 'image-gen', capabilityId: 'image-gen', title: 'Generate Image', icon: 'sparkle', group: 'Vision', component: ImageGenPanel },

  { id: 'transcribe', capabilityId: 'speech-transcribe', title: 'Transcribe', icon: 'mic', group: 'Audio', component: TranscribePanel },
  { id: 'speak', capabilityId: 'speech-speak', title: 'Speak', icon: 'speaker', group: 'Audio', component: SpeakPanel },
  { id: 'sound', capabilityId: 'sound', title: 'Sound Events', icon: 'audio-lines', group: 'Audio', component: SoundPanel },
  { id: 'shazam', capabilityId: 'shazam', title: 'Song ID', icon: 'music', group: 'Audio', component: ShazamPanel },
];
