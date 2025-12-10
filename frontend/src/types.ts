export type SearchResult = {
  id?: string;
  path?: string;
  snippet?: string;
  score?: number;
  metadata?: Record<string, unknown>;
};

export type SearchPayload = SearchResult[] | { results: SearchResult[] };

export type FilePreview = {
  path: string;
  content: string;
  truncated: boolean;
  size: number;
  contentType?: string;
  content_type?: string;
  encoding?: string;
  dataBase64?: string;
  data_base64?: string;
  dataUrl?: string;
  data_url?: string;
};

