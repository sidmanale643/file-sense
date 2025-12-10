import type { FilePreview, SearchPayload, SearchResult } from './types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:8080';

const SEARCH_PATH = '/search';
const HYBRID_PATH = '/hybrid_search';
const OPEN_PATH = '/open_file';
const OPEN_FOLDER_PATH = '/open_folder';
const PREVIEW_PATH = '/preview_file';

const toArray = (payload: SearchPayload): SearchResult[] => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.results)) return payload.results;
  return [];
};

export async function runSearch(query: string, useHybrid = false): Promise<SearchResult[]> {
  const path = useHybrid ? HYBRID_PATH : SEARCH_PATH;
  const url = new URL(path, API_BASE_URL);
  url.searchParams.set('query', query);

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  const data = (await response.json()) as SearchPayload;
  return toArray(data);
}

export async function openFile(path: string): Promise<void> {
  const url = new URL(OPEN_PATH, API_BASE_URL);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ path }),
  });

  if (!response.ok) {
    throw new Error(`Open failed (${response.status})`);
  }

  const payload = (await response.json()) as { success?: boolean; path?: string };
  if (payload?.success === false) {
    throw new Error('Open failed');
  }
}

export async function openFolder(path: string): Promise<void> {
  const url = new URL(OPEN_FOLDER_PATH, API_BASE_URL);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ path }),
  });

  if (!response.ok) {
    throw new Error(`Open folder failed (${response.status})`);
  }
}

export async function previewFile(path: string): Promise<FilePreview & { success?: boolean }> {
  const url = new URL(PREVIEW_PATH, API_BASE_URL);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ path }),
  });

  if (!response.ok) {
    throw new Error(`Preview failed (${response.status})`);
  }

  const payload = (await response.json()) as FilePreview & { success?: boolean };
  if (payload?.success === false) {
    throw new Error('Preview failed');
  }
  return payload;
}

