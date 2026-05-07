import { create } from 'zustand';

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  chatModel: string;
  embedModel: string;
  webSearch: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { documents: number; messages: number };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string | null;
  sources?: string | null;
  collectionId: string;
  createdAt: string;
}

export interface Document {
  id: string;
  name: string;
  type: string;
  content: string;
  chunkCount: number;
  embedded: boolean;
  collectionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

interface AppState {
  // Collections
  collections: Collection[];
  selectedCollectionId: string | null;
  
  // Chat
  messages: ChatMessage[];
  isChatLoading: boolean;
  
  // Documents
  documents: Document[];
  
  // Models
  chatModels: OllamaModel[];
  embeddingModels: OllamaModel[];
  ollamaConnected: boolean;
  
  // UI
  sidebarOpen: boolean;
  documentsPanelOpen: boolean;
  settingsPanelOpen: boolean;
  
  // Actions
  setCollections: (collections: Collection[]) => void;
  selectCollection: (id: string | null) => void;
  setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  addMessage: (message: ChatMessage) => void;
  setIsChatLoading: (loading: boolean) => void;
  setDocuments: (documents: Document[]) => void;
  setChatModels: (models: OllamaModel[]) => void;
  setEmbeddingModels: (models: OllamaModel[]) => void;
  setOllamaConnected: (connected: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setDocumentsPanelOpen: (open: boolean) => void;
  setSettingsPanelOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  collections: [],
  selectedCollectionId: null,
  messages: [],
  isChatLoading: false,
  documents: [],
  chatModels: [],
  embeddingModels: [],
  ollamaConnected: false,
  sidebarOpen: true,
  documentsPanelOpen: false,
  settingsPanelOpen: false,
  
  setCollections: (collections) => set({ collections }),
  selectCollection: (id) => set({ selectedCollectionId: id, messages: [], documents: [] }),
  setMessages: (messages) => set(typeof messages === 'function'
    ? (state) => ({ messages: (messages as (prev: ChatMessage[]) => ChatMessage[])(state.messages) })
    : { messages }
  ),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setIsChatLoading: (loading) => set({ isChatLoading: loading }),
  setDocuments: (documents) => set({ documents }),
  setChatModels: (models) => set({ chatModels: models }),
  setEmbeddingModels: (models) => set({ embeddingModels: models }),
  setOllamaConnected: (connected) => set({ ollamaConnected: connected }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setDocumentsPanelOpen: (open) => set({ documentsPanelOpen: open }),
  setSettingsPanelOpen: (open) => set({ settingsPanelOpen: open }),
}));
