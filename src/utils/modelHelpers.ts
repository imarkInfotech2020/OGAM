import { DownloadedModel } from '../types';

export const getMmProjFileSize = (m?: DownloadedModel): number =>
  m?.engine === 'llama' ? (m.mmProjFileSize ?? 0) : 0;
