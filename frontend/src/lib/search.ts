export type SearchResult = {
  id: string;
  title: string;
  path: string;
  snippet: string;
  tags?: string[];
  updatedAt?: string;
};

const MOCK_RESULTS: SearchResult[] = [
  {
    id: "1",
    title: "Product Requirement Doc",
    path: "docs/specs/file-sense-prd.md",
    snippet: "Defines the RAG-based file discovery flow and Spotlight UX goals.",
    tags: ["docs", "product"],
    updatedAt: "2024-12-04",
  },
  {
    id: "2",
    title: "Embedding Pipeline",
    path: "src/services/embedding.py",
    snippet: "Creates chunk embeddings and stores vectors alongside file metadata.",
    tags: ["backend", "pipeline"],
    updatedAt: "2024-12-02",
  },
  {
    id: "3",
    title: "Chunker",
    path: "src/services/chunker.py",
    snippet: "Splits documents into overlapping chunks tuned for semantic recall.",
    tags: ["backend", "ingestion"],
    updatedAt: "2024-11-28",
  },
  {
    id: "4",
    title: "Vector DB Client",
    path: "src/services/vector_db.py",
    snippet: "Configures the Milvus collection and query parameters.",
    tags: ["backend", "vector"],
    updatedAt: "2024-11-30",
  },
  {
    id: "5",
    title: "LLM Prompt Template",
    path: "src/prompts/chat.py",
    snippet: "System prompt guiding retrieval-augmented chat responses.",
    tags: ["prompts"],
    updatedAt: "2024-11-26",
  },
  {
    id: "6",
    title: "File Loader",
    path: "src/services/document_loader/unified_loader.py",
    snippet: "Routes PDFs, DOCX, and TXT files through consistent parsing.",
    tags: ["ingestion"],
    updatedAt: "2024-11-27",
  },
  {
    id: "7",
    title: "Storage Schema",
    path: "src/services/db.py",
    snippet: "SQLite schema for files, chunks, and embedding metadata.",
    tags: ["storage"],
    updatedAt: "2024-11-25",
  },
  {
    id: "8",
    title: "Hash Utilities",
    path: "src/services/hash.py",
    snippet: "Computes stable content hashes to skip duplicate ingestion.",
    tags: ["utils"],
    updatedAt: "2024-11-23",
  },
];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function searchFiles(query: string): Promise<SearchResult[]> {
  const normalized = query.trim().toLowerCase();
  const scored = MOCK_RESULTS.map((item) => {
    const haystack = `${item.title} ${item.path} ${item.snippet} ${item.tags?.join(" ") ?? ""}`.toLowerCase();
    const score = normalized
      ? haystack.includes(normalized)
        ? 2
        : normalized
            .split(" ")
            .filter(Boolean)
            .reduce((acc, token) => acc + (haystack.includes(token) ? 1 : 0), 0)
      : 0.5;
    return { item, score };
  });

  const filtered = scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);

  await wait(120); // mimic a lightweight network hop
  return normalized ? filtered : filtered.slice(0, 6);
}

