'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useAppStore, type Collection, type ChatMessage, type OllamaModel } from '@/stores/app-store';
import { DEFAULT_HP_SYSTEM_PROMPT } from '@/lib/ollama';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import {
  MessageSquare,
  Plus,
  FolderOpen,
  Trash2,
  Settings,
  FileText,
  Upload,
  Send,
  Bot,
  User,
  Wifi,
  WifiOff,
  PanelLeftClose,
  PanelLeft,
  Loader2,
  Database,
  X,
  Check,
  File,
  Copy,
  Sparkles,
  Globe,
  ExternalLink,
  Mic,
  MicOff,
  Cloud,
  Server,
  Key,
  RefreshCw,
  Cog,
  Square,
  RotateCcw,
} from 'lucide-react';
import { useVoiceRecognition } from '@/hooks/useVoiceRecognition';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Code block component with syntax highlighting and copy button
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const textarea = document.createElement('textarea');
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-gray-200">
      {/* Header bar with language label + copy button */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-100 border-b border-gray-200 text-xs text-gray-500">
        <span className="font-medium">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-gray-200 transition-colors text-gray-400 hover:text-gray-600"
          title="Copiar código"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-500" />
              <span className="text-green-500">Copiado</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneLight}
        customStyle={{
          margin: 0,
          padding: '0.75rem 1rem',
          fontSize: '0.8125rem',
          background: '#fafafa',
          borderRadius: 0,
        }}
        showLineNumbers={code.split('\n').length > 3}
        lineNumberStyle={{ color: '#c0c0c0', fontSize: '0.75rem' }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

export default function Home() {
  const {
    collections,
    selectedCollectionId,
    messages,
    isChatLoading,
    documents,
    chatModels,
    embeddingModels,
    ollamaConnected,
    sidebarOpen,
    documentsPanelOpen,
    settingsPanelOpen,
    setCollections,
    selectCollection,
    setMessages,
    addMessage,
    setIsChatLoading,
    setDocuments,
    setChatModels,
    setEmbeddingModels,
    setOllamaConnected,
    setSidebarOpen,
    setDocumentsPanelOpen,
    setSettingsPanelOpen,
  } = useAppStore();

  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDesc, setNewCollectionDesc] = useState('');

  const [chatInput, setChatInput] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [embeddingDocs, setEmbeddingDocs] = useState(false);
  const [embedProgress, setEmbedProgress] = useState<{ embedded: number; total: number; remaining: number } | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [pasteName, setPasteName] = useState('');
  const [showPasteDialog, setShowPasteDialog] = useState(false);
  const [chunkSize, setChunkSize] = useState(1200);
  const [chunkOverlap, setChunkOverlap] = useState(200);
  const [chunkPreview, setChunkPreview] = useState<{ chunkCount: number; chunkSize: number; overlap: number; stats: { totalChars: number; hasHeaders: boolean; headerCount: number; headers: string[]; estimatedChunks: number }; chunks: { index: number; length: number; preview: string }[] } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  // Track which assistant message is currently streaming (has thinking but no content yet)
  const streamingAssistantId = useRef<string | null>(null);
  const [webSearchProvider, setWebSearchProvider] = useState<'zai' | 'duckduckgo' | 'searxng'>('duckduckgo');
  const [searxngUrl, setSearxngUrl] = useState('http://localhost:8080');
  const [testingSearch, setTestingSearch] = useState(false);
  const [searchTestResult, setSearchTestResult] = useState<{ok: boolean; error?: string} | null>(null);
  const [voiceKeyword, setVoiceKeyword] = useState('asistente');
  const [voicePauseDuration, setVoicePauseDuration] = useState(1.5);
  const [voiceLanguage, setVoiceLanguage] = useState('es-ES');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  // LLM Provider settings
  const [llmProvider, setLlmProvider] = useState<'local' | 'online'>('local');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);
  const [openaiModel, setOpenaiModel] = useState('gpt-5.4-mini');
  const [defaultChatModel, setDefaultChatModel] = useState('llama3.2');
  const [defaultEmbedModel, setDefaultEmbedModel] = useState('nomic-embed-text');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
  const [maxThinkingTokens, setMaxThinkingTokens] = useState(8000);
  const [maxThinkingSeconds, setMaxThinkingSeconds] = useState(60);
  const [llmProviderDialogOpen, setLlmProviderDialogOpen] = useState(false);
  const [syncingKey, setSyncingKey] = useState(false);
  const [syncResult, setSyncResult] = useState<{ok: boolean; message: string} | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const selectedCollection = collections.find(c => c.id === selectedCollectionId);

  // Chat is available when: local provider + Ollama connected, OR online provider + API key saved
  const chatAvailable = llmProvider === 'online' ? hasSavedApiKey : ollamaConnected;

  // Fetch initial data
  const fetchCollections = useCallback(async () => {
    try {
      const res = await fetch('/api/collections');
      const data = await res.json();
      setCollections(data.collections || []);
    } catch (err) {
      console.error('Failed to fetch collections:', err);
    }
  }, [setCollections]);

  const fetchModels = useCallback(async () => {
    try {
      const [chatRes, embedRes, statusRes] = await Promise.all([
        fetch('/api/ollama/models'),
        fetch('/api/ollama/embedding-models'),
        fetch('/api/ollama/status'),
      ]);
      const chatData = await chatRes.json();
      const embedData = await embedRes.json();
      const statusData = await statusRes.json();
      setChatModels(chatData.models || []);
      setEmbeddingModels(embedData.models || []);
      setOllamaConnected(statusData.connected || false);
    } catch (err) {
      console.error('Failed to fetch models:', err);
      setOllamaConnected(false);
    }
  }, [setChatModels, setEmbeddingModels, setOllamaConnected]);

  const fetchMessages = useCallback(async (collectionId: string) => {
    try {
      const res = await fetch(`/api/collections/${collectionId}/chat`);
      const data = await res.json();
      const msgs = Array.isArray(data.messages) ? data.messages : [];
      setMessages(msgs);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
      setMessages([]);
    }
  }, [setMessages]);

  const fetchDocuments = useCallback(async (collectionId: string) => {
    try {
      const res = await fetch(`/api/collections/${collectionId}/documents`);
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    }
  }, [setDocuments]);

  // Fetch web search settings
  const fetchWebSearchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/web-search');
      const data = await res.json();
      if (data.config) {
        setWebSearchProvider(data.config.provider || 'duckduckgo');
        setSearxngUrl(data.config.searxngUrl || 'http://localhost:8080');
      }
    } catch (err) {
      console.error('Failed to fetch web search settings:', err);
    }
  }, []);

  // Fetch voice settings
  const fetchVoiceSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/voice');
      const data = await res.json();
      if (data.config) {
        setVoiceKeyword(data.config.keyword || 'asistente');
        setVoicePauseDuration(data.config.pauseDuration || 1.5);
        setVoiceLanguage(data.config.language || 'es-ES');
        setVoiceEnabled(data.config.enabled || false);
      }
    } catch (err) {
      console.error('Failed to fetch voice settings:', err);
    }
  }, []);

  // Fetch LLM provider settings
  const fetchLlmProviderSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/llm-provider');
      const data = await res.json();
      if (data.config) {
        setLlmProvider(data.config.provider || 'local');
        setOpenaiApiKey(''); // Never pre-fill the actual key
        setHasSavedApiKey(data.config.hasApiKey || false);
        setOpenaiModel(data.config.openaiModel || 'gpt-5.4-mini');
        setDefaultChatModel(data.config.defaultChatModel || 'llama3.2');
        setDefaultEmbedModel(data.config.defaultEmbedModel || 'nomic-embed-text');
        setSystemPrompt(data.config.systemPrompt || DEFAULT_HP_SYSTEM_PROMPT);
        setThinkingEnabled(data.config.thinkingEnabled ?? true);
        setMaxThinkingTokens(data.config.maxThinkingTokens ?? 8000);
        setMaxThinkingSeconds(data.config.maxThinkingSeconds ?? 60);
      }
    } catch (err) {
      console.error('Failed to fetch LLM provider settings:', err);
    }
  }, []);

  // Save LLM provider settings
  const saveLlmProviderSettings = useCallback(async (provider: 'local' | 'online', apiKey: string, model: string, chatModel?: string, embedModel?: string, sysPrompt?: string, thinkTokens?: number, thinkSeconds?: number, thinkEnabled?: boolean) => {
    try {
      await fetch('/api/settings/llm-provider', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          openaiApiKey: apiKey,
          openaiModel: model,
          defaultChatModel: chatModel || defaultChatModel,
          defaultEmbedModel: embedModel || defaultEmbedModel,
          systemPrompt: sysPrompt !== undefined ? sysPrompt : systemPrompt,
          thinkingEnabled: thinkEnabled !== undefined ? thinkEnabled : thinkingEnabled,
          maxThinkingTokens: thinkTokens !== undefined ? thinkTokens : maxThinkingTokens,
          maxThinkingSeconds: thinkSeconds !== undefined ? thinkSeconds : maxThinkingSeconds,
        }),
      });
    } catch (err) {
      console.error('Failed to save LLM provider settings:', err);
    }
  }, [defaultChatModel, defaultEmbedModel, systemPrompt, thinkingEnabled, maxThinkingTokens, maxThinkingSeconds]);

  // Sync API key from Google Drive
  const handleSyncApiKey = useCallback(async () => {
    setSyncingKey(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/settings/llm-provider', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setHasSavedApiKey(true);
        setOpenaiApiKey(''); // Clear the input since the key is now saved
        setSyncResult({ ok: true, message: data.message || 'API key sincronizada' });
      } else {
        setSyncResult({ ok: false, message: data.error || 'Error al sincronizar' });
      }
    } catch (err) {
      setSyncResult({ ok: false, message: 'Error de conexión al sincronizar' });
    } finally {
      setSyncingKey(false);
    }
  }, []);

  // Ref for sending voice messages directly (initialized after handleSendMessage is defined)
  const sendMessageRef = useRef<((text?: string) => Promise<void>) | null>(null);

  const handleVoiceMessage = useCallback((text: string) => {
    sendMessageRef.current?.(text);
  }, []);

  const { state: voiceState, transcript: voiceTranscript, lastSentTranscript, startListening, stopListening, supported: voiceSupported } = useVoiceRecognition({
    keyword: voiceKeyword,
    pauseDuration: voicePauseDuration,
    language: voiceLanguage,
    enabled: voiceActive,
    onMessage: handleVoiceMessage,
  });

  useEffect(() => {
    fetchCollections();
    fetchModels();
    fetchWebSearchSettings();
    fetchVoiceSettings();
    fetchLlmProviderSettings();
  }, [fetchCollections, fetchModels, fetchWebSearchSettings, fetchVoiceSettings, fetchLlmProviderSettings]);

  useEffect(() => {
    if (selectedCollectionId) {
      fetchMessages(selectedCollectionId);
      fetchDocuments(selectedCollectionId);
    }
  }, [selectedCollectionId, fetchMessages, fetchDocuments]);

  // Auto-scroll chat - smart scrolling
  const scrollToBottom = useCallback((smooth?: boolean) => {
    if (!chatEndRef.current) return;
    // If user scrolled up, don't force scroll (unless it's a new user message)
    if (!isNearBottomRef.current && smooth !== undefined) return;
    chatEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });
  }, []);

  // Track if user is near the bottom of the chat
  const handleChatScroll = useCallback(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    const threshold = 100;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  // Auto-scroll on messages change
  useEffect(() => {
    if (isChatLoading) {
      // During streaming: instant scroll, no animation
      scrollToBottom(false);
    } else {
      // New message (user sent or assistant finished): smooth scroll
      isNearBottomRef.current = true;
      scrollToBottom(true);
    }
  }, [messages, isChatLoading, scrollToBottom]);

  // Create collection
  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) return;
    try {
      const res = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCollectionName.trim(),
          description: newCollectionDesc.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.collection) {
        setNewCollectionName('');
        setNewCollectionDesc('');
        setCreateDialogOpen(false);
        await fetchCollections();
        selectCollection(data.collection.id);
      }
    } catch (err) {
      console.error('Failed to create collection:', err);
    }
  };

  // Delete collection
  const handleDeleteCollection = async (id: string) => {
    try {
      await fetch(`/api/collections/${id}`, { method: 'DELETE' });
      if (selectedCollectionId === id) {
        selectCollection(null);
      }
      await fetchCollections();
    } catch (err) {
      console.error('Failed to delete collection:', err);
    }
  };

  // Select collection
  const handleSelectCollection = (id: string) => {
    selectCollection(id);
    setDocumentsPanelOpen(false);
    setSettingsPanelOpen(false);
  };

  // Upload documents (supports multiple files)
  const handleUploadDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0 || !selectedCollectionId) return;

    const files = Array.from(fileList);
    setUploadingDoc(true);
    setUploadProgress({ current: 0, total: files.length });

    try {
      // Send all files in a single batch request
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });
      formData.append('chunkSize', chunkSize.toString());
      formData.append('overlap', chunkOverlap.toString());

      setUploadProgress({ current: 1, total: files.length });

      const res = await fetch(`/api/collections/${selectedCollectionId}/documents`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.batch) {
        setUploadProgress({ current: files.length, total: files.length });
      }

      await fetchDocuments(selectedCollectionId);
      await fetchCollections();
    } catch (err) {
      console.error('Failed to upload documents:', err);
    } finally {
      setUploadingDoc(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Preview chunking for pasted text
  const handlePreviewChunks = async () => {
    if (!pasteText.trim() || !selectedCollectionId) return;
    setLoadingPreview(true);
    setChunkPreview(null);
    try {
      const formData = new FormData();
      formData.append('text', pasteText);
      formData.append('chunkSize', chunkSize.toString());
      formData.append('overlap', chunkOverlap.toString());
      formData.append('preview', 'true');
      const res = await fetch(`/api/collections/${selectedCollectionId}/documents`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      setChunkPreview(data);
    } catch (err) {
      console.error('Failed to preview chunks:', err);
    } finally {
      setLoadingPreview(false);
    }
  };

  // Paste text as document
  const handlePasteDocument = async () => {
    if (!pasteText.trim() || !selectedCollectionId) return;
    setUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append('text', pasteText);
      formData.append('name', pasteName.trim() || 'Pasted Text');
      formData.append('chunkSize', chunkSize.toString());
      formData.append('overlap', chunkOverlap.toString());
      const res = await fetch(`/api/collections/${selectedCollectionId}/documents`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.document) {
        await fetchDocuments(selectedCollectionId);
        await fetchCollections();
        setPasteText('');
        setPasteName('');
        setShowPasteDialog(false);
        setChunkPreview(null);
      }
    } catch (err) {
      console.error('Failed to paste document:', err);
    } finally {
      setUploadingDoc(false);
    }
  };

  // Generate embeddings (batch loop with progress)
  const handleGenerateEmbeddings = async () => {
    if (!selectedCollectionId) return;
    setEmbeddingDocs(true);
    setEmbedProgress(null);

    let totalEmbedded = 0;
    let totalChunks = 0;

    try {
      // Keep calling embed endpoint in batches until all done
      while (true) {
        const res = await fetch(`/api/collections/${selectedCollectionId}/embed`, {
          method: 'POST',
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          console.error('Embed error:', errorData);
          break;
        }

        const data = await res.json();

        if (totalChunks === 0 && data.total > 0) {
          totalChunks = data.total;
        }

        totalEmbedded += data.embedded || 0;

        setEmbedProgress({
          embedded: totalEmbedded,
          total: totalChunks,
          remaining: data.remaining || 0,
        });

        // If no more chunks to embed or only errors, stop
        if (data.done || data.embedded === 0) {
          break;
        }
      }

      await fetchDocuments(selectedCollectionId);
      await fetchCollections();
    } catch (err) {
      console.error('Failed to generate embeddings:', err);
    } finally {
      setEmbeddingDocs(false);
      // Keep progress visible for a moment after finishing
      setTimeout(() => setEmbedProgress(null), 3000);
    }
  };

  // Stop streaming chat
  const handleStopChat = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsChatLoading(false);
    streamingAssistantId.current = null;
  }, [setIsChatLoading]);

  // Send chat message
  const handleSendMessage = async (overrideText?: string | unknown) => {
    const input = typeof overrideText === 'string' ? overrideText : chatInput;
    const text = input.trim();
    if (!text || !selectedCollectionId || isChatLoading) return;

    const userMessage = text;
    setChatInput('');
    addMessage({
      id: 'temp-' + Date.now(),
      role: 'user',
      content: userMessage,
      collectionId: selectedCollectionId,
      createdAt: new Date().toISOString(),
    });
    setIsChatLoading(true);

    // Create abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const res = await fetch(`/api/collections/${selectedCollectionId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, enableWebSearch: webSearchEnabled }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Chat request failed');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let assistantContent = '';
      let assistantThinking = '';
      const assistantId = 'temp-assistant-' + Date.now();
      streamingAssistantId.current = assistantId;

      addMessage({
        id: assistantId,
        role: 'assistant',
        content: '',
        thinking: '',
        collectionId: selectedCollectionId,
        createdAt: new Date().toISOString(),
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n').filter(l => l.trim());

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            // Capture thinking/reasoning — just display it, backend handles loop truncation
            if (parsed.thinking) {
              assistantThinking += parsed.thinking;
              setMessages(prev => {
                const arr = Array.isArray(prev) ? prev : [];
                return arr.map(m =>
                  m.id === assistantId
                    ? { ...m, thinking: assistantThinking }
                    : m
                );
              });
            }
            // Capture content
            if (parsed.content) {
              assistantContent += parsed.content;
              setMessages(prev => {
                const arr = Array.isArray(prev) ? prev : [];
                return arr.map(m =>
                  m.id === assistantId
                    ? { ...m, content: assistantContent }
                    : m
                );
              });
            }
          } catch {
            // skip
          }
        }
      }

      // Refresh messages from DB to get proper IDs
      await fetchMessages(selectedCollectionId);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User manually stopped the chat - this is expected
        console.log('Chat stopped by user');
      } else {
        console.error('Chat error:', err);
        addMessage({
          id: 'error-' + Date.now(),
          role: 'assistant',
          content: 'Error: Failed to get response. Please check that Ollama is running and the model is available.',
          collectionId: selectedCollectionId,
          createdAt: new Date().toISOString(),
        });
      }
    } finally {
      setIsChatLoading(false);
      streamingAssistantId.current = null;
    }
  };

  // Keep ref in sync with latest handleSendMessage
  useEffect(() => {
    sendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  // Handle Enter key in chat
  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Delete document
  const handleDeleteDocument = async (docId: string) => {
    if (!selectedCollectionId) return;
    try {
      await fetch(`/api/collections/${selectedCollectionId}/documents?docId=${docId}`, {
        method: 'DELETE',
      });
      await fetchDocuments(selectedCollectionId);
      await fetchCollections();
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  };

  return (
    <div className="h-screen flex bg-white">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? 'w-[300px]' : 'w-0'
        } transition-all duration-300 overflow-hidden border-r border-gray-100 flex flex-col bg-white`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-[#024ad8] flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-bold text-gray-900">HP Chat</h1>
          </div>

          {/* Ollama Status */}
          <div className="flex items-center gap-2 text-sm mb-3">
            {ollamaConnected ? (
              <>
                <Wifi className="w-4 h-4 text-green-500" />
                <span className="text-green-600 font-medium">Ollama conectado</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-red-400" />
                <span className="text-red-500 font-medium">Ollama desconectado</span>
              </>
            )}
          </div>

          {/* New Collection Button */}
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full bg-[#024ad8] hover:bg-[#0139a3] text-white">
                <Plus className="w-4 h-4 mr-2" />
                Nueva Colección
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear Nueva Colección</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nombre *</Label>
                  <Input
                    placeholder="Nombre de la colección"
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateCollection()}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descripción</Label>
                  <Input
                    placeholder="Descripción opcional"
                    value={newCollectionDesc}
                    onChange={(e) => setNewCollectionDesc(e.target.value)}
                  />
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-500 mb-1">Modelos configurados globalmente:</p>
                  <div className="flex items-center gap-2 text-xs">
                    <MessageSquare className="w-3 h-3 text-[#024ad8]" />
                    <span className="text-gray-700">Chat: <strong>{llmProvider === 'online' ? openaiModel : defaultChatModel}</strong></span>
                  </div>
                  <div className="flex items-center gap-2 text-xs mt-1">
                    <Database className="w-3 h-3 text-[#024ad8]" />
                    <span className="text-gray-700">Embeddings: <strong>{defaultEmbedModel}</strong></span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1.5">Configura los modelos en ⚙️ Configuración General</p>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancelar</Button>
                </DialogClose>
                <Button
                  className="bg-[#024ad8] hover:bg-[#0139a3] text-white"
                  onClick={handleCreateCollection}
                  disabled={!newCollectionName.trim()}
                >
                  Crear
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Collections List */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          <div className="p-2">
            {collections.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No hay colecciones</p>
                <p className="text-xs mt-1">Crea una para comenzar</p>
              </div>
            ) : (
              collections.map((collection) => (
                <div
                  key={collection.id}
                  className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer mb-1 transition-all ${
                    selectedCollectionId === collection.id
                      ? 'bg-[#024ad8]/10 text-[#024ad8] border border-[#024ad8]/20'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                  onClick={() => handleSelectCollection(collection.id)}
                >
                  <FolderOpen className={`w-4 h-4 flex-shrink-0 ${
                    selectedCollectionId === collection.id ? 'text-[#024ad8]' : 'text-gray-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{collection.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {collection._count && (
                        <span className="text-xs text-gray-400">
                          {collection._count.documents} docs · {collection._count.messages} msgs
                        </span>
                      )}
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar colección</AlertDialogTitle>
                        <AlertDialogDescription>
                          ¿Estás seguro de que quieres eliminar &quot;{collection.name}&quot;? Esta acción no se puede deshacer y se eliminarán todos los documentos y mensajes.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-500 hover:bg-red-600 text-white"
                          onClick={() => handleDeleteCollection(collection.id)}
                        >
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sidebar Footer - Model info */}
        {selectedCollection && (
          <div className="p-3 border-t border-gray-100 bg-gray-50/80 flex-shrink-0">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <div className="flex items-center gap-1.5 min-w-0">
                {llmProvider === 'online' ? (
                  <Cloud className="w-3 h-3 text-[#024ad8] flex-shrink-0" />
                ) : (
                  <Server className="w-3 h-3 text-[#024ad8] flex-shrink-0" />
                )}
                <span className="truncate">{llmProvider === 'online' ? openaiModel : defaultChatModel}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="w-6 h-6"
                onClick={() => setSettingsPanelOpen(!settingsPanelOpen)}
              >
                <Settings className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Top Bar with 3 icons */}
        <div className="h-12 flex items-center justify-between px-4 bg-white flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="w-9 h-9 text-gray-500 hover:text-[#024ad8]"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
          </Button>

          {selectedCollection ? (
            <div className="flex items-center gap-1">
              {/* Reset conversation button */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-9 h-9 text-gray-500 hover:text-red-500"
                    title="Reiniciar conversación"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reiniciar conversación</AlertDialogTitle>
                    <AlertDialogDescription>
                      ¿Estás seguro de que quieres eliminar todos los mensajes de esta colección? Esta acción no se puede deshacer.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-500 hover:bg-red-600 text-white"
                      onClick={async () => {
                        if (!selectedCollectionId) return;
                        try {
                          await fetch(`/api/collections/${selectedCollectionId}/chat`, {
                            method: 'DELETE',
                          });
                          setMessages([]);
                          await fetchCollections();
                        } catch (err) {
                          console.error('Failed to reset conversation:', err);
                        }
                      }}
                    >
                      Reiniciar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button
                variant={documentsPanelOpen ? 'secondary' : 'ghost'}
                size="icon"
                className={`w-9 h-9 ${documentsPanelOpen ? 'text-[#024ad8]' : 'text-gray-500 hover:text-[#024ad8]'}`}
                onClick={() => {
                  setDocumentsPanelOpen(!documentsPanelOpen);
                  setSettingsPanelOpen(false);
                }}
              >
                <FileText className="w-4 h-4" />
              </Button>
              <Button
                variant={settingsPanelOpen ? 'secondary' : 'ghost'}
                size="icon"
                className={`w-9 h-9 ${settingsPanelOpen ? 'text-[#024ad8]' : 'text-gray-500 hover:text-[#024ad8]'}`}
                onClick={() => {
                  setSettingsPanelOpen(!settingsPanelOpen);
                  setDocumentsPanelOpen(false);
                }}
              >
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div />
          )}
        </div>

        {/* HP Banner Header - always visible, never scrolls */}
        <div className="w-full flex-shrink-0 flex justify-center border-b border-gray-100/50">
          <img
            src="/banner2.png"
            alt="Pregúntale a la IA con HP"
            className="h-auto"
          />
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Chat Area */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {selectedCollectionId ? (
              <>
                {/* Messages - ONLY scrollable region */}
                <div
                  ref={chatScrollRef}
                  onScroll={handleChatScroll}
                  className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4"
                >
                  <div className="max-w-3xl mx-auto space-y-4">
                    {messages.length === 0 && (
                      <div className="text-center py-16">
                        <div className="w-16 h-16 rounded-2xl bg-[#024ad8]/10 flex items-center justify-center mx-auto mb-4">
                          <Sparkles className="w-8 h-8 text-[#024ad8]" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          Hola soy tu asistente HP potenciado con Inteligencia artificial
                        </h3>
                        <p className="text-sm text-gray-500 max-w-md mx-auto">
                          Agrega documentos a esta colección y hazme preguntas basadas en tu información.
                        </p>
                        {documents.length > 0 && documents.some(d => d.embedded) && (
                          <Badge className="mt-3 bg-green-100 text-green-700 hover:bg-green-100">
                            <Check className="w-3 h-3 mr-1" />
                            Embeddings generados
                          </Badge>
                        )}
                      </div>
                    )}
                    {Array.isArray(messages) && messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        {msg.role === 'assistant' && (
                          <div className="w-8 h-8 rounded-lg bg-[#024ad8] flex items-center justify-center flex-shrink-0 mt-1">
                            <Bot className="w-4 h-4 text-white" />
                          </div>
                        )}
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                            msg.role === 'user'
                              ? 'bg-[#024ad8] text-white'
                              : 'bg-gray-100 text-gray-900'
                          }`}
                        >
                          {/* Thinking block for reasoning models - ChatGPT/Grok style */}
                          {msg.role === 'assistant' && msg.thinking && (
                            <div className="mb-2">
                              {/* While actively reasoning (streaming thinking, no content yet) - show only latest section */}
                              {isChatLoading && streamingAssistantId.current === msg.id && !msg.content ? (
                                <div>
                                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-1.5">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span>Razonando...</span>
                                    {msg.thinking.includes('⚠️ Razonamiento truncado') && (
                                      <span className="text-amber-600 text-[10px] ml-1">Bucle detectado — esperando respuesta</span>
                                    )}
                                  </div>
                                  <div className="p-2.5 rounded-lg bg-gray-50/80 border border-gray-100 text-xs text-gray-500 whitespace-pre-wrap max-h-24 overflow-hidden">
                                    {(() => {
                                      // Show only the last paragraph/section of reasoning for a cleaner look
                                      const cleanThinking = msg.thinking.replace(/⚠️ Razonamiento truncado.*/g, '').trim();
                                      const paragraphs = cleanThinking.split(/\n{2,}/).filter((p: string) => p.trim());
                                      const lastSection = paragraphs.length > 0 ? paragraphs[paragraphs.length - 1] : cleanThinking;
                                      return lastSection;
                                    })()}
                                    <span className="inline-block w-1.5 h-3 bg-gray-400 animate-pulse ml-0.5 align-middle rounded-sm" />
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="mt-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 h-7 px-2"
                                    onClick={handleStopChat}
                                  >
                                    <Square className="w-3 h-3 mr-1 fill-current" />
                                    Detener
                                  </Button>
                                </div>
                              ) : (
                                /* After reasoning - show collapsed "Razonamiento" that can expand */
                                <details className="group">
                                  <summary className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer hover:text-gray-500 select-none list-none">
                                    <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                    </svg>
                                    <span>Razonamiento</span>
                                    {msg.thinking.includes('⚠️ Razonamiento truncado') && (
                                      <span className="text-amber-500 text-[10px]">(truncado)</span>
                                    )}
                                  </summary>
                                  <div className="mt-1.5 p-2.5 rounded-lg bg-gray-50 border border-gray-100 text-xs text-gray-500 whitespace-pre-wrap max-h-64 overflow-y-auto custom-scrollbar">
                                    {msg.thinking.replace(/⚠️ Razonamiento truncado.*/g, '').trim()}
                                  </div>
                                </details>
                              )}
                            </div>
                          )}

                          <div className={`chat-message text-sm leading-relaxed ${
                            msg.role === 'user' ? 'text-white' : ''
                          }`}>
                            {msg.role === 'assistant' ? (
                              msg.content ? (
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  rehypePlugins={[rehypeRaw]}
                                  components={{
                                    code({ className, children, ...props }) {
                                      const match = /language-(\w+)/.exec(className || '');
                                      const codeStr = String(children).replace(/\n$/, '');
                                      if (match) {
                                        return <CodeBlock language={match[1]} code={codeStr} />;
                                      }
                                      return <code className={className} {...props}>{children}</code>;
                                    },
                                  }}
                                >{msg.content}</ReactMarkdown>
                              ) : !msg.thinking ? (
                                /* Non-reasoning model loading state */
                                <div className="flex items-center gap-2">
                                  <Loader2 className="w-4 h-4 animate-spin text-[#024ad8]" />
                                  <span className="text-sm text-gray-500">Pensando...</span>
                                </div>
                              ) : null
                            ) : (
                              <p className="whitespace-pre-wrap">{msg.content}</p>
                            )}
                          </div>

                          {/* Sources: RAG references + Web sources */}
                          {msg.role === 'assistant' && msg.sources && (() => {
                            try {
                              const sources = JSON.parse(msg.sources);
                              const ragRefs = sources.rag as { id: string; content: string; documentName: string; similarity: number }[] | undefined;
                              const webRefs = sources.web as { name: string; url: string }[] | undefined;
                              // Also handle legacy format (array of web sources)
                              const legacyWeb = Array.isArray(sources) ? sources : null;
                              const hasRag = ragRefs && ragRefs.length > 0;
                              const hasWeb = (webRefs && webRefs.length > 0) || (legacyWeb && legacyWeb.length > 0);
                              if (!hasRag && !hasWeb) return null;
                              return (
                                <div className="mt-2 pt-2 border-t border-gray-200/60">
                                  {/* RAG References */}
                                  {hasRag && (
                                    <div className="mb-1.5">
                                      <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                                        <Database className="w-3 h-3" />
                                        Referencias
                                      </p>
                                      <div className="flex flex-wrap gap-1">
                                        {ragRefs!.map((ref, i) => (
                                          <span key={ref.id} className="group relative">
                                            <span className="inline-flex items-center gap-0.5 text-xs bg-[#024ad8]/10 text-[#024ad8] rounded px-1.5 py-0.5 cursor-pointer hover:bg-[#024ad8]/20 transition-colors">
                                              <FileText className="w-2.5 h-2.5" />
                                              ref{i + 1}
                                            </span>
                                            {/* Tooltip */}
                                            <span className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-72 p-2.5 rounded-lg bg-white text-black border border-dashed border-[#024ad8] text-xs shadow-md whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar">
                                              <span className="font-semibold text-[#024ad8] block mb-1">{ref.documentName}</span>
                                              {ref.content}
                                            </span>
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {/* Web Sources */}
                                  {hasWeb && (
                                    <div>
                                      <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                                        <Globe className="w-3 h-3" />
                                        Fuentes web
                                      </p>
                                      <div className="flex flex-wrap gap-1">
                                        {(webRefs || legacyWeb)!.map((s: { name: string; url: string }, i: number) => (
                                          <a
                                            key={i}
                                            href={s.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-[#024ad8] hover:underline flex items-center gap-0.5 bg-blue-50 rounded px-1.5 py-0.5"
                                          >
                                            {s.name.substring(0, 30)}
                                            <ExternalLink className="w-2.5 h-2.5" />
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            } catch { /* skip */ }
                            return null;
                          })()}
                        </div>
                        {msg.role === 'user' && (
                          <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0 mt-1">
                            <User className="w-4 h-4 text-gray-600" />
                          </div>
                        )}
                      </div>
                    ))}
                    {/* Show loading only when no assistant message exists yet (edge case) */}
                    {isChatLoading && Array.isArray(messages) && messages.length > 0 && messages[messages.length - 1]?.role === 'user' && (
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#024ad8] flex items-center justify-center flex-shrink-0 mt-1">
                          <Bot className="w-4 h-4 text-white" />
                        </div>
                        <div className="bg-gray-100 rounded-2xl px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-[#024ad8]" />
                            <span className="text-sm text-gray-500">Pensando...</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                </div>

                {/* Voice Marquee - Real-time transcription display */}
                {voiceActive && (
                  <div className="flex-shrink-0">
                    {/* Listening State - Blue themed with scrolling marquee */}
                    {voiceState === 'listening' && (
                      <div className="bg-gradient-to-r from-[#024ad8]/5 via-[#024ad8]/8 to-[#024ad8]/5 border-t border-[#024ad8]/15 px-4 py-2.5 flex items-center gap-3 overflow-hidden">
                        {/* Sound wave bars */}
                        <div className="flex items-center gap-[3px] h-5 flex-shrink-0">
                          <div className="w-[3px] bg-[#024ad8]/50 rounded-full voice-sound-bar" style={{ height: 4 }} />
                          <div className="w-[3px] bg-[#024ad8]/50 rounded-full voice-sound-bar" style={{ height: 4 }} />
                          <div className="w-[3px] bg-[#024ad8]/50 rounded-full voice-sound-bar" style={{ height: 4 }} />
                          <div className="w-[3px] bg-[#024ad8]/50 rounded-full voice-sound-bar" style={{ height: 4 }} />
                          <div className="w-[3px] bg-[#024ad8]/50 rounded-full voice-sound-bar" style={{ height: 4 }} />
                        </div>
                        {/* Scrolling marquee text */}
                        <div className="flex-1 overflow-hidden relative min-w-0">
                          <div className="voice-marquee-scroll whitespace-nowrap inline-flex">
                            <span className="text-sm text-[#024ad8] font-medium pr-8">
                              Escuchando... di &quot;{voiceKeyword}&quot; para activar ✦
                            </span>
                            <span className="text-sm text-[#024ad8]/60 font-medium pr-8">
                              Escuchando... di &quot;{voiceKeyword}&quot; para activar ✦
                            </span>
                          </div>
                        </div>
                        {/* LIVE badge */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#024ad8] animate-pulse" />
                          <span className="text-[10px] font-bold text-[#024ad8]/70 tracking-wider uppercase">LIVE</span>
                        </div>
                      </div>
                    )}

                    {/* Keyword Detected State - Amber flash */}
                    {voiceState === 'keyword-detected' && (
                      <div className="bg-gradient-to-r from-amber-50 via-amber-100/80 to-amber-50 border-t border-amber-200 px-4 py-2.5 flex items-center gap-3 voice-keyword-glow">
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <Mic className="w-4 h-4 text-amber-600" />
                          <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-amber-700">
                            ¡&quot;{voiceKeyword}&quot; detectado! Habla ahora...
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Recording State - Green themed with live transcription */}
                    {voiceState === 'recording' && (
                      <div className="bg-gradient-to-r from-green-50/80 via-emerald-50/60 to-green-50/80 border-t border-green-200/60 px-4 py-2.5 flex items-center gap-3 overflow-hidden">
                        {/* Recording dot + sound bars */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="w-2.5 h-2.5 rounded-full bg-red-500 voice-rec-dot" />
                          <div className="flex items-center gap-[3px] h-5">
                            <div className="w-[3px] bg-green-500/60 rounded-full voice-sound-bar-green" style={{ height: 4 }} />
                            <div className="w-[3px] bg-green-500/60 rounded-full voice-sound-bar-green" style={{ height: 4 }} />
                            <div className="w-[3px] bg-green-500/60 rounded-full voice-sound-bar-green" style={{ height: 4 }} />
                            <div className="w-[3px] bg-green-500/60 rounded-full voice-sound-bar-green" style={{ height: 4 }} />
                            <div className="w-[3px] bg-green-500/60 rounded-full voice-sound-bar-green" style={{ height: 4 }} />
                          </div>
                        </div>
                        {/* Live transcription text with blinking cursor */}
                        <div className="flex-1 min-w-0 overflow-hidden">
                          {voiceTranscript ? (
                            <p className="text-sm text-green-700 font-medium truncate">
                              {voiceTranscript}
                              <span className="voice-blink-cursor text-green-500 ml-0.5">|</span>
                            </p>
                          ) : (
                            <p className="text-sm text-green-500/70 italic">
                              Habla ahora...<span className="voice-blink-cursor text-green-400 ml-0.5">|</span>
                            </p>
                          )}
                        </div>
                        {/* Pause indicator */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          <span className="text-[10px] font-medium text-green-500/70 tracking-wider uppercase">REC</span>
                        </div>
                      </div>
                    )}

                    {/* Last sent transcript - shown below marquee when available */}
                    {lastSentTranscript && voiceState === 'listening' && (
                      <div className="bg-gray-50/60 border-t border-gray-100/50 px-4 py-1.5 flex items-center gap-2">
                        <Send className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <p className="text-xs text-gray-400 truncate">
                          Último: {lastSentTranscript}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Chat Input - pinned to bottom */}
                <div className="border-t border-gray-100 p-4 bg-white flex-shrink-0">
                  <div className="max-w-3xl mx-auto">
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 relative">
                        <Textarea
                          ref={chatInputRef}
                          placeholder={
                            chatAvailable
                              ? 'Escribe tu mensaje...'
                              : llmProvider === 'online' ? 'Configura tu API Key de OpenAI...' : 'Ollama no está conectado...'
                          }
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={handleChatKeyDown}
                          disabled={isChatLoading || !chatAvailable}
                          className="min-h-[44px] max-h-32 resize-none pr-10 rounded-xl border-gray-100 focus:border-[#024ad8] focus:ring-[#024ad8]/20"
                          rows={1}
                        />
                      </div>
                      <Button
                        onClick={() => {
                          if (voiceActive) {
                            stopListening();
                            setVoiceActive(false);
                          } else {
                            startListening();
                            setVoiceActive(true);
                          }
                        }}
                        disabled={!voiceSupported || isChatLoading}
                        className={`h-11 w-11 rounded-xl transition-all duration-300 ${
                          voiceActive
                            ? voiceState === 'recording'
                              ? 'bg-green-500 hover:bg-green-600 text-white ring-2 ring-green-200'
                              : voiceState === 'keyword-detected'
                                ? 'bg-amber-500 hover:bg-amber-600 text-white ring-2 ring-amber-200'
                                : 'bg-red-500 hover:bg-red-600 text-white ring-2 ring-red-200'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                        }`}
                        size="icon"
                        title={voiceSupported ? (voiceActive ? 'Detener escucha' : 'Activar escucha de voz') : 'Reconocimiento de voz no soportado'}
                      >
                        {voiceActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      </Button>
                      {isChatLoading ? (
                        <Button
                          onClick={handleStopChat}
                          className="bg-red-500 hover:bg-red-600 text-white h-11 w-11 rounded-xl"
                          size="icon"
                          title="Detener generación"
                        >
                          <Square className="w-4 h-4 fill-current" />
                        </Button>
                      ) : (
                        <Button
                          onClick={handleSendMessage}
                          disabled={!chatInput.trim() || !chatAvailable}
                          className="bg-[#024ad8] hover:bg-[#0139a3] text-white h-11 w-11 rounded-xl"
                          size="icon"
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Badge variant="outline" className={`text-xs ${
                        llmProvider === 'online'
                          ? 'text-[#024ad8] border-[#024ad8]/30 bg-[#024ad8]/10'
                          : 'text-gray-400'
                      }`}>
                        {llmProvider === 'online' ? <Cloud className="w-3 h-3 mr-1" /> : <Server className="w-3 h-3 mr-1" />}
                        {llmProvider === 'online' ? openaiModel : defaultChatModel}
                      </Badge>
                      {documents.some(d => d.embedded) && (
                        <Badge variant="outline" className="text-xs text-green-500 border-green-200">
                          <Database className="w-3 h-3 mr-1" />
                          RAG activo
                        </Badge>
                      )}
                      <button
                        onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors ${
                          webSearchEnabled
                            ? 'border-[#024ad8]/30 bg-[#024ad8]/10 text-[#024ad8]'
                            : 'border-gray-200 text-gray-400 hover:text-gray-500'
                        }`}
                      >
                        <Globe className="w-3 h-3" />
                        Web
                      </button>
                      {voiceActive && (
                        <Badge variant="outline" className={`text-xs ${
                          voiceState === 'recording'
                            ? 'text-green-600 border-green-300 bg-green-50'
                            : voiceState === 'keyword-detected'
                              ? 'text-amber-600 border-amber-300 bg-amber-50'
                              : 'text-[#024ad8] border-[#024ad8]/30 bg-[#024ad8]/5'
                        }`}>
                          <Mic className="w-3 h-3 mr-1" />
                          {voiceState === 'recording' ? 'Grabando' : voiceState === 'keyword-detected' ? '¡Detectado!' : 'Voz activa'}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              /* Welcome Screen */
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center max-w-md">
                  <p className="text-gray-500 mb-6">
                    Chatea con tus documentos de manera local y segura. Crea una colección, agrega documentos y haz preguntas sobre ese tema.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                    <div className="p-4 rounded-xl bg-gray-50">
                      <FolderOpen className="w-6 h-6 text-[#024ad8] mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-900">1. Crear Colección</p>
                      <p className="text-xs text-gray-500 mt-1">Organiza tus documentos</p>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50">
                      <Upload className="w-6 h-6 text-[#024ad8] mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-900">2. Agregar Docs</p>
                      <p className="text-xs text-gray-500 mt-1">Sube archivos o pega texto</p>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50">
                      <MessageSquare className="w-6 h-6 text-[#024ad8] mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-900">3. Chatea</p>
                      <p className="text-xs text-gray-500 mt-1">Pregunta sobre tus docs</p>
                    </div>
                  </div>
                  {!chatAvailable && (
                    <div className="mt-6 p-4 rounded-xl bg-red-50 border border-red-100">
                      <div className="flex items-center gap-2 text-red-600 justify-center">
                        <WifiOff className="w-4 h-4" />
                        <span className="text-sm font-medium">
                          {llmProvider === 'online' ? 'API Key no configurada' : 'Ollama no está conectado'}
                        </span>
                      </div>
                      <p className="text-xs text-red-400 mt-1">
                        {llmProvider === 'online'
                          ? 'Configura tu API Key de OpenAI en la configuración del proveedor'
                          : 'Asegúrate de que Ollama esté ejecutándose en localhost:11434'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Documents or Settings */}
          {(documentsPanelOpen || settingsPanelOpen) && selectedCollectionId && (
            <div className="w-[360px] border-l border-gray-100 flex flex-col bg-white min-h-0">
              {documentsPanelOpen && (
                <>
                  <div className="p-4 border-b border-gray-100 flex-shrink-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900">Documentos</h3>
                      <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => setDocumentsPanelOpen(false)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="p-4 border-b border-gray-100 space-y-3 flex-shrink-0">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleUploadDocument}
                      accept=".txt,.md,.csv,.json,.html,.xml,.log,.py,.js,.ts,.java,.c,.cpp,.rs,.go,.sh,.yaml,.yml,.toml,.cfg,.ini"
                      multiple
                      className="hidden"
                    />
                    {/* Chunk config summary */}
                    <div className="flex items-center justify-between text-[10px] text-gray-400 px-1">
                      <span>Chunks: {chunkSize} chars · {chunkOverlap} overlap</span>
                      <span>Usa ## para secciones</span>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full border-dashed"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingDoc}
                    >
                      {uploadingDoc ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4 mr-2" />
                      )}
                      {uploadingDoc
                        ? (uploadProgress
                            ? `Subiendo ${uploadProgress.current}/${uploadProgress.total}...`
                            : 'Subiendo...')
                        : 'Subir Archivos'}
                    </Button>
                    <Dialog open={showPasteDialog} onOpenChange={setShowPasteDialog}>
                      <Button
                        variant="outline"
                        className="w-full border-dashed"
                        onClick={() => setShowPasteDialog(true)}
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Pegar Texto
                      </Button>
                      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Pegar Texto como Documento</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label>Nombre del documento</Label>
                            <Input
                              placeholder="Nombre opcional"
                              value={pasteName}
                              onChange={(e) => setPasteName(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Contenido</Label>
                            <Textarea
                              placeholder="Pega tu texto aquí... Usa ## para separar secciones y obtener mejores chunks"
                              value={pasteText}
                              onChange={(e) => { setPasteText(e.target.value); setChunkPreview(null); }}
                              className="min-h-[200px] font-mono text-sm"
                            />
                          </div>

                          {/* Chunking Configuration */}
                          <div className="p-3 rounded-lg bg-gray-50 border border-gray-100 space-y-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-medium text-gray-700">Configuración de Chunks</Label>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={handlePreviewChunks}
                                disabled={!pasteText.trim() || loadingPreview}
                              >
                                {loadingPreview ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Database className="w-3 h-3 mr-1" />}
                                Vista previa
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-[11px] text-gray-500">Tamaño del chunk (caracteres)</Label>
                                <Input
                                  type="number"
                                  min={200}
                                  max={4000}
                                  value={chunkSize}
                                  onChange={(e) => { setChunkSize(Number(e.target.value)); setChunkPreview(null); }}
                                  className="h-8 text-sm"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[11px] text-gray-500">Solapamiento (caracteres)</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  max={500}
                                  value={chunkOverlap}
                                  onChange={(e) => { setChunkOverlap(Number(e.target.value)); setChunkPreview(null); }}
                                  className="h-8 text-sm"
                                />
                              </div>
                            </div>
                            <p className="text-[10px] text-gray-400">
                              Los documentos con encabezados ## se dividen por secciones automáticamente. Cada chunk incluye su encabezado para preservar contexto.
                            </p>
                          </div>

                          {/* Chunk Preview Results */}
                          {chunkPreview && (
                            <div className="p-3 rounded-lg bg-blue-50/50 border border-blue-100 space-y-2">
                              <div className="flex items-center justify-between">
                                <Label className="text-xs font-medium text-[#024ad8]">Vista Previa de Chunks</Label>
                                <Badge className="h-5 text-xs bg-[#024ad8] text-white">
                                  {chunkPreview.chunkCount} chunks
                                </Badge>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div className="p-2 rounded bg-white border border-gray-100 text-center">
                                  <div className="font-bold text-gray-900">{chunkPreview.stats.totalChars.toLocaleString()}</div>
                                  <div className="text-gray-400">caracteres</div>
                                </div>
                                <div className="p-2 rounded bg-white border border-gray-100 text-center">
                                  <div className="font-bold text-gray-900">{chunkPreview.stats.headerCount}</div>
                                  <div className="text-gray-400">{chunkPreview.stats.hasHeaders ? 'secciones ##' : 'sin headers'}</div>
                                </div>
                                <div className="p-2 rounded bg-white border border-gray-100 text-center">
                                  <div className="font-bold text-gray-900">{chunkPreview.chunkSize}</div>
                                  <div className="text-gray-400">chunk size</div>
                                </div>
                              </div>
                              {chunkPreview.stats.headers.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {chunkPreview.stats.headers.map((h, i) => (
                                    <Badge key={i} variant="outline" className="h-5 text-[10px] text-gray-600 border-gray-200">
                                      {h}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1">
                                {chunkPreview.chunks.map((c) => (
                                  <div key={c.index} className="p-2 rounded bg-white border border-gray-100 text-xs">
                                    <div className="flex items-center justify-between mb-0.5">
                                      <span className="font-medium text-gray-700">Chunk {c.index + 1}</span>
                                      <span className="text-gray-400">{c.length} chars</span>
                                    </div>
                                    <p className="text-gray-500 leading-tight line-clamp-2">{c.preview}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <DialogFooter>
                          <DialogClose asChild>
                            <Button variant="outline">Cancelar</Button>
                          </DialogClose>
                          <Button
                            className="bg-[#024ad8] hover:bg-[#0139a3] text-white"
                            onClick={handlePasteDocument}
                            disabled={!pasteText.trim() || uploadingDoc}
                          >
                            {uploadingDoc ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            Agregar
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    {(documents.length > 0 && documents.some(d => !d.embedded)) || embeddingDocs ? (
                      <Button
                        className="w-full bg-[#024ad8] hover:bg-[#0139a3] text-white"
                        onClick={handleGenerateEmbeddings}
                        disabled={embeddingDocs}
                      >
                        {embeddingDocs ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4 mr-2" />
                        )}
                        {embeddingDocs
                          ? (embedProgress
                              ? `Embedding ${embedProgress.embedded}/${embedProgress.total}...`
                              : 'Generando...')
                          : 'Generar Embeddings'}
                      </Button>
                    ) : null}
                    {/* Embed progress bar */}
                    {embedProgress && (
                      <div className="space-y-1">
                        <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-[#024ad8] h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${embedProgress.total > 0 ? (embedProgress.embedded / embedProgress.total) * 100 : 0}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-gray-400 text-center">
                          {embedProgress.embedded} de {embedProgress.total} chunks procesados
                          {embedProgress.remaining > 0 ? ` · ${embedProgress.remaining} restantes` : ' · Completado'}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    <div className="p-4 space-y-2">
                      {documents.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">
                          <File className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Sin documentos</p>
                          <p className="text-xs mt-1">Sube archivos o pega texto</p>
                        </div>
                      ) : (
                        documents.map((doc) => (
                          <div
                            key={doc.id}
                            className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors"
                          >
                            <File className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-gray-400">{doc.chunkCount} chunks</span>
                                {doc.embedded ? (
                                  <Badge className="h-5 text-xs bg-green-100 text-green-700 hover:bg-green-100">
                                    <Check className="w-3 h-3 mr-0.5" />
                                    Embed
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="h-5 text-xs text-gray-400">
                                    Sin embed
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-7 h-7 text-gray-400 hover:text-red-500"
                              onClick={() => handleDeleteDocument(doc.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}

              {settingsPanelOpen && selectedCollection && (
                <>
                  <div className="p-4 border-b border-gray-100 flex-shrink-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900">Configuración de Colección</h3>
                      <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => setSettingsPanelOpen(false)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-6">
                    {/* Web Search toggle for this collection */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Búsqueda Web</Label>
                      <p className="text-xs text-gray-500">Buscar en internet para complementar las respuestas de esta colección</p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            await fetch(`/api/collections/${selectedCollectionId}`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ webSearch: !selectedCollection.webSearch }),
                            });
                            await fetchCollections();
                          }}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            selectedCollection.webSearch ? 'bg-[#024ad8]' : 'bg-gray-200'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              selectedCollection.webSearch ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                        <span className="text-sm text-gray-600">
                          {selectedCollection.webSearch ? 'Activado' : 'Desactivado'}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400">El proveedor de búsqueda se configura en ⚙️ Configuración General</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Floating LLM Provider Gear Button - Bottom Right */}
      <Dialog open={llmProviderDialogOpen} onOpenChange={setLlmProviderDialogOpen}>
        <button
          onClick={() => setLlmProviderDialogOpen(true)}
          className="fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full bg-[#024ad8] hover:bg-[#0139a3] text-white shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group"
          title="Configurar proveedor de IA"
        >
          <Cog className="w-5 h-5 transition-transform duration-300 group-hover:rotate-90" />
        </button>

        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cog className="w-5 h-5 text-[#024ad8]" />
              Configuración General
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {/* Provider Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Tipo de Proveedor</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={async () => {
                    setLlmProvider('local');
                    await saveLlmProviderSettings('local', openaiApiKey, openaiModel);
                  }}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    llmProvider === 'local'
                      ? 'border-[#024ad8] bg-[#024ad8]/5 text-[#024ad8]'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-600'
                  }`}
                >
                  <Server className="w-7 h-7" />
                  <span className="text-sm font-medium">Local</span>
                  <span className="text-[10px] opacity-70">Ollama</span>
                </button>
                <button
                  onClick={async () => {
                    setLlmProvider('online');
                    await saveLlmProviderSettings('online', openaiApiKey, openaiModel);
                  }}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    llmProvider === 'online'
                      ? 'border-[#024ad8] bg-[#024ad8]/5 text-[#024ad8]'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-600'
                  }`}
                >
                  <Cloud className="w-7 h-7" />
                  <span className="text-sm font-medium">Online</span>
                  <span className="text-[10px] opacity-70">OpenAI</span>
                </button>
              </div>
            </div>

            {/* === Chat Model Selection === */}
            <div className="space-y-3 p-4 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#024ad8]" />
                <Label className="text-sm font-medium">Modelo de Chat</Label>
              </div>
              
              {llmProvider === 'local' ? (
                <div className="space-y-1">
                  <p className="text-xs text-gray-500">Modelo de Ollama para generar respuestas</p>
                  <Select
                    value={defaultChatModel}
                    onValueChange={async (v) => {
                      setDefaultChatModel(v);
                      await saveLlmProviderSettings(llmProvider, openaiApiKey, openaiModel, v);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar modelo" />
                    </SelectTrigger>
                    <SelectContent>
                      {chatModels.map((model) => (
                        <SelectItem key={model.name} value={model.name}>
                          {model.name}
                          <span className="text-xs text-gray-400 ml-2">
                            {model.details?.parameter_size}
                          </span>
                        </SelectItem>
                      ))}
                      {chatModels.length === 0 && (
                        <SelectItem value={defaultChatModel}>
                          {defaultChatModel}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {ollamaConnected ? (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px]">
                      <Wifi className="w-2.5 h-2.5 mr-1" />
                      Ollama conectado
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-[10px]">
                      <WifiOff className="w-2.5 h-2.5 mr-1" />
                      Ollama desconectado
                    </Badge>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs text-gray-500">Modelo de OpenAI para generar respuestas</p>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-[#024ad8]/20 text-sm">
                    <Cloud className="w-4 h-4 text-[#024ad8]/70" />
                    <span className="font-medium text-[#024ad8]">{openaiModel}</span>
                  </div>
                  <p className="text-[10px] text-[#024ad8]/60">Modelo de OpenAI fijo para el proveedor online</p>
                </div>
              )}
            </div>

            {/* === Embedding Model Selection (always local) === */}
            <div className="space-y-3 p-4 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#024ad8]" />
                <Label className="text-sm font-medium">Modelo de Embeddings</Label>
              </div>
              <p className="text-xs text-gray-500">Los embeddings siempre se generan localmente con Ollama</p>
              <Select
                value={defaultEmbedModel}
                onValueChange={async (v) => {
                  setDefaultEmbedModel(v);
                  await saveLlmProviderSettings(llmProvider, openaiApiKey, openaiModel, undefined, v);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar modelo de embeddings" />
                </SelectTrigger>
                <SelectContent>
                  {embeddingModels.map((model) => (
                    <SelectItem key={model.name} value={model.name}>
                      {model.name}
                      <span className="text-xs text-gray-400 ml-2">
                        {model.details?.parameter_size}
                      </span>
                    </SelectItem>
                  ))}
                  {embeddingModels.length === 0 && (
                    <SelectItem value={defaultEmbedModel}>
                      {defaultEmbedModel}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* === System Prompt Configuration === */}
            <div className="space-y-3 p-4 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#024ad8]" />
                <Label className="text-sm font-medium">System Prompt</Label>
                {systemPrompt === DEFAULT_HP_SYSTEM_PROMPT && (
                  <Badge className="bg-[#024ad8]/10 text-[#024ad8] hover:bg-[#024ad8]/10 text-[10px]">
                    Prompt HP por defecto
                  </Badge>
                )}
                {systemPrompt !== DEFAULT_HP_SYSTEM_PROMPT && systemPrompt.length > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px]">
                    Personalizado
                  </Badge>
                )}
              </div>
              <p className="text-xs text-gray-500">
                Este es el prompt que se envía al modelo. Edítalo según necesites. El contexto RAG y las instrucciones anti-bucle se agregan automáticamente.
              </p>
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                onBlur={async () => {
                  await saveLlmProviderSettings(llmProvider, openaiApiKey, openaiModel, undefined, undefined, systemPrompt);
                }}
                className="min-h-[180px] text-xs resize-y font-mono"
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400">
                  {systemPrompt.length} caracteres
                  {systemPrompt !== DEFAULT_HP_SYSTEM_PROMPT && systemPrompt.length > 0 ? ' · Personalizado' : ''}
                </span>
                {systemPrompt !== DEFAULT_HP_SYSTEM_PROMPT && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[10px] text-[#024ad8] hover:text-[#0139a3] h-6 px-2"
                    onClick={async () => {
                      setSystemPrompt(DEFAULT_HP_SYSTEM_PROMPT);
                      await saveLlmProviderSettings(llmProvider, openaiApiKey, openaiModel, undefined, undefined, DEFAULT_HP_SYSTEM_PROMPT);
                    }}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Restaurar HP por defecto
                  </Button>
                )}
              </div>
            </div>

            {/* === Online Provider: API Key Settings === */}
            {llmProvider === 'online' && (
              <div className="space-y-4 p-4 rounded-xl bg-[#024ad8]/5 border border-[#024ad8]/20">
                {/* API Key Input */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-[#024ad8]">API Key de OpenAI</Label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#024ad8]/50" />
                    <Input
                      type="password"
                      value={openaiApiKey}
                      onChange={(e) => setOpenaiApiKey(e.target.value)}
                      onBlur={async () => {
                        await saveLlmProviderSettings(llmProvider, openaiApiKey, openaiModel);
                      }}
                      placeholder="Ingresa una nueva API key..."
                      className="pl-9 text-sm h-10 border-[#024ad8]/20 focus:border-[#024ad8] focus:ring-[#024ad8]/20"
                    />
                  </div>
                  {hasSavedApiKey && !openaiApiKey && (
                    <p className="text-[10px] text-green-600 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      API Key configurada
                    </p>
                  )}
                </div>

                {/* Sync Button */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button
                      onClick={handleSyncApiKey}
                      disabled={syncingKey}
                      variant="outline"
                      className="flex-1 border-[#024ad8]/20 text-[#024ad8] hover:bg-[#024ad8]/10 hover:text-[#0139a3]"
                    >
                      {syncingKey ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Sincronizando...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Sincronizar
                        </>
                      )}
                    </Button>
                    {hasSavedApiKey && (
                      <Button
                        onClick={async () => {
                          await fetch('/api/settings/llm-provider', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ provider: llmProvider, openaiApiKey: 'CLEAR', openaiModel, defaultChatModel, defaultEmbedModel, systemPrompt }),
                          });
                          setOpenaiApiKey('');
                          setHasSavedApiKey(false);
                        }}
                        variant="outline"
                        className="border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600"
                        title="Limpiar API Key guardada"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <p className="text-[10px] text-[#024ad8]/60 text-center">
                    Obtiene la API key desde el archivo compartido en Google Drive
                  </p>
                </div>

                {/* Sync Result */}
                {syncResult && (
                  <div className={`text-xs px-3 py-2 rounded-lg ${
                    syncResult.ok
                      ? 'bg-green-50 text-green-700 border border-green-100'
                      : 'bg-red-50 text-red-700 border border-red-100'
                  }`}>
                    {syncResult.ok ? '✓ ' : '✗ '}{syncResult.message}
                  </div>
                )}
              </div>
            )}

            {/* Local Provider Info */}
            {llmProvider === 'local' && (
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                <div className="flex items-center gap-3 mb-2">
                  <Server className="w-5 h-5 text-[#024ad8]" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">Ollama (Local)</p>
                    <p className="text-xs text-gray-500">Las respuestas se generan localmente usando tu instancia de Ollama</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {ollamaConnected ? (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">
                      <Wifi className="w-3 h-3 mr-1" />
                      Conectado
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs">
                      <WifiOff className="w-3 h-3 mr-1" />
                      Desconectado
                    </Badge>
                  )}
                  <Button variant="ghost" size="sm" onClick={fetchModels} className="text-xs text-[#024ad8]">
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Reconectar
                  </Button>
                </div>
              </div>
            )}

            {/* === Reasoning Configuration === */}
            <div className="space-y-3 p-4 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#024ad8]" />
                  <Label className="text-sm font-medium">Razonamiento</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-gray-500">{thinkingEnabled ? 'Activado' : 'Desactivado'}</Label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={thinkingEnabled}
                    onClick={async () => {
                      const newVal = !thinkingEnabled;
                      setThinkingEnabled(newVal);
                      await saveLlmProviderSettings(llmProvider, openaiApiKey, openaiModel, undefined, undefined, undefined, undefined, undefined, newVal);
                    }}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#024ad8] focus-visible:ring-offset-2 ${
                      thinkingEnabled ? 'bg-[#024ad8]' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                        thinkingEnabled ? 'translate-x-[18px]' : 'translate-x-[2px]'
                      }`}
                    />
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Activa o desactiva el razonamiento interno de modelos como Qwen3, DeepSeek-R1 o QwQ. Al desactivarlo, el modelo responde directamente sin pensar.
              </p>

              {thinkingEnabled && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-gray-600">Máx. caracteres de razonamiento</Label>
                      <Input
                        type="number"
                        min={0}
                        max={50000}
                        step={500}
                        value={maxThinkingTokens}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setMaxThinkingTokens(v);
                        }}
                        onBlur={async () => {
                          await saveLlmProviderSettings(llmProvider, openaiApiKey, openaiModel, undefined, undefined, undefined, maxThinkingTokens, maxThinkingSeconds);
                        }}
                        className="h-8 text-sm"
                      />
                      <p className="text-[10px] text-gray-400">0 = sin límite</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-gray-600">Máx. segundos de razonamiento</Label>
                      <Input
                        type="number"
                        min={0}
                        max={300}
                        step={5}
                        value={maxThinkingSeconds}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setMaxThinkingSeconds(v);
                        }}
                        onBlur={async () => {
                          await saveLlmProviderSettings(llmProvider, openaiApiKey, openaiModel, undefined, undefined, undefined, maxThinkingTokens, maxThinkingSeconds);
                        }}
                        className="h-8 text-sm"
                      />
                      <p className="text-[10px] text-gray-400">0 = sin límite</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-[10px] h-6 px-2"
                      onClick={async () => {
                        setMaxThinkingTokens(4000);
                        setMaxThinkingSeconds(30);
                        await saveLlmProviderSettings(llmProvider, openaiApiKey, openaiModel, undefined, undefined, undefined, 4000, 30);
                      }}
                    >
                      Rápido (4K / 30s)
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-[10px] h-6 px-2"
                      onClick={async () => {
                        setMaxThinkingTokens(8000);
                        setMaxThinkingSeconds(60);
                        await saveLlmProviderSettings(llmProvider, openaiApiKey, openaiModel, undefined, undefined, undefined, 8000, 60);
                      }}
                    >
                      Balanceado (8K / 60s)
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-[10px] h-6 px-2"
                      onClick={async () => {
                        setMaxThinkingTokens(0);
                        setMaxThinkingSeconds(0);
                        await saveLlmProviderSettings(llmProvider, openaiApiKey, openaiModel, undefined, undefined, undefined, 0, 0);
                      }}
                    >
                      Sin límite
                    </Button>
                  </div>
                </>
              )}
            </div>

            <Separator />

            {/* === Web Search Configuration === */}
            <div className="space-y-3 p-4 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#024ad8]" />
                <Label className="text-sm font-medium">Búsqueda Web</Label>
              </div>
              <p className="text-xs text-gray-500">Configura el proveedor de búsqueda web</p>

              {/* Search provider selection */}
              <div className="space-y-2">
                <Label className="text-xs text-gray-600">Proveedor de búsqueda</Label>
                <Select
                  value={webSearchProvider}
                  onValueChange={async (v: 'zai' | 'duckduckgo' | 'searxng') => {
                    setWebSearchProvider(v);
                    setSearchTestResult(null);
                    await fetch('/api/settings/web-search', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ provider: v, searxngUrl }),
                    });
                  }}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="duckduckgo">
                      <div className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5" />
                        <span>DuckDuckGo</span>
                        <span className="text-xs text-gray-400 ml-1">(Sin config)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="searxng">
                      <div className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5" />
                        <span>SearXNG</span>
                        <span className="text-xs text-gray-400 ml-1">(Self-hosted)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="zai">
                      <div className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5" />
                        <span>Z-AI SDK</span>
                        <span className="text-xs text-gray-400 ml-1">(Sandbox)</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Provider description */}
              {webSearchProvider === 'duckduckgo' && (
                <div className="p-2.5 rounded-lg bg-green-50 border border-green-100">
                  <p className="text-xs text-green-700">
                    <strong>DuckDuckGo</strong> funciona en cualquier entorno sin configuración adicional. Ideal para uso local en Windows.
                  </p>
                </div>
              )}
              {webSearchProvider === 'searxng' && (
                <>
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-100">
                    <p className="text-xs text-amber-700">
                      <strong>SearXNG</strong> requiere una instancia local. Ejecuta con Docker: <code className="bg-amber-100 px-1 rounded text-[10px]">docker run -p 8080:8080 searxng/searxng</code>
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600">URL de SearXNG</Label>
                    <Input
                      value={searxngUrl}
                      onChange={(e) => setSearxngUrl(e.target.value)}
                      onBlur={async () => {
                        await fetch('/api/settings/web-search', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ provider: webSearchProvider, searxngUrl }),
                        });
                      }}
                      placeholder="http://localhost:8080"
                      className="h-8 text-sm"
                    />
                  </div>
                </>
              )}
              {webSearchProvider === 'zai' && (
                <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-100">
                  <p className="text-xs text-blue-700">
                    <strong>Z-AI SDK</strong> solo funciona en el entorno sandbox de Z-AI. No funcionará en una instalación local de Windows.
                  </p>
                </div>
              )}

              {/* Test connection button */}
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                disabled={testingSearch}
                onClick={async () => {
                  setTestingSearch(true);
                  setSearchTestResult(null);
                  try {
                    const res = await fetch('/api/settings/web-search', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ provider: webSearchProvider, searxngUrl }),
                    });
                    const data = await res.json();
                    setSearchTestResult(data);
                  } catch {
                    setSearchTestResult({ ok: false, error: 'Error de conexión' });
                  } finally {
                    setTestingSearch(false);
                  }
                }}
              >
                {testingSearch ? (
                  <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                ) : (
                  <Globe className="w-3 h-3 mr-1.5" />
                )}
                {testingSearch ? 'Probando...' : 'Probar conexión'}
              </Button>
              {searchTestResult && (
                <div className={`p-2 rounded-lg text-xs ${
                  searchTestResult.ok
                    ? 'bg-green-50 text-green-700 border border-green-100'
                    : 'bg-red-50 text-red-700 border border-red-100'
                }`}>
                  {searchTestResult.ok ? '✓ Conexión exitosa' : `✗ Error: ${searchTestResult.error || 'No se pudo conectar'}`}
                </div>
              )}
            </div>

            <Separator />

            {/* === Voice Activation Configuration === */}
            <div className="space-y-3 p-4 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-[#024ad8]" />
                <Label className="text-sm font-medium">Activación por Voz</Label>
              </div>
              <p className="text-xs text-gray-500">Usa tu voz para enviar mensajes al asistente</p>

              {!voiceSupported && (
                <p className="text-xs text-amber-600">Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.</p>
              )}

              <div className="space-y-2">
                <Label className="text-xs">Idioma de reconocimiento</Label>
                <Select
                  value={voiceLanguage}
                  onValueChange={async (v) => {
                    setVoiceLanguage(v);
                    await fetch('/api/settings/voice', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ keyword: voiceKeyword, pauseDuration: voicePauseDuration, language: v, enabled: voiceEnabled }),
                    });
                  }}
                >
                  <SelectTrigger className="text-sm h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="es-ES">
                      <span className="flex items-center gap-2">🇪🇸 Español (España)</span>
                    </SelectItem>
                    <SelectItem value="es-MX">
                      <span className="flex items-center gap-2">🇲🇽 Español (México)</span>
                    </SelectItem>
                    <SelectItem value="es-AR">
                      <span className="flex items-center gap-2">🇦🇷 Español (Argentina)</span>
                    </SelectItem>
                    <SelectItem value="es-CO">
                      <span className="flex items-center gap-2">🇨🇴 Español (Colombia)</span>
                    </SelectItem>
                    <SelectItem value="es-CL">
                      <span className="flex items-center gap-2">🇨🇱 Español (Chile)</span>
                    </SelectItem>
                    <SelectItem value="es-PE">
                      <span className="flex items-center gap-2">🇵🇪 Español (Perú)</span>
                    </SelectItem>
                    <SelectItem value="en-US">
                      <span className="flex items-center gap-2">🇺🇸 English (US)</span>
                    </SelectItem>
                    <SelectItem value="en-GB">
                      <span className="flex items-center gap-2">🇬🇧 English (UK)</span>
                    </SelectItem>
                    <SelectItem value="fr-FR">
                      <span className="flex items-center gap-2">🇫🇷 Français</span>
                    </SelectItem>
                    <SelectItem value="de-DE">
                      <span className="flex items-center gap-2">🇩🇪 Deutsch</span>
                    </SelectItem>
                    <SelectItem value="pt-BR">
                      <span className="flex items-center gap-2">🇧🇷 Português (Brasil)</span>
                    </SelectItem>
                    <SelectItem value="it-IT">
                      <span className="flex items-center gap-2">🇮🇹 Italiano</span>
                    </SelectItem>
                    <SelectItem value="ja-JP">
                      <span className="flex items-center gap-2">🇯🇵 日本語</span>
                    </SelectItem>
                    <SelectItem value="zh-CN">
                      <span className="flex items-center gap-2">🇨🇳 中文 (简体)</span>
                    </SelectItem>
                    <SelectItem value="ko-KR">
                      <span className="flex items-center gap-2">🇰🇷 한국어</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-gray-400">Selecciona el idioma para mejorar la precisión del reconocimiento</p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Palabra clave</Label>
                <Input
                  value={voiceKeyword}
                  onChange={(e) => setVoiceKeyword(e.target.value)}
                  onBlur={async () => {
                    await fetch('/api/settings/voice', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ keyword: voiceKeyword, pauseDuration: voicePauseDuration, language: voiceLanguage, enabled: voiceEnabled }),
                    });
                  }}
                  placeholder="asistente"
                  className="text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Pausa antes de enviar (segundos)</Label>
                <Input
                  type="number"
                  min={0.5}
                  max={5}
                  step={0.5}
                  value={voicePauseDuration}
                  onChange={(e) => setVoicePauseDuration(parseFloat(e.target.value) || 1.5)}
                  onBlur={async () => {
                    await fetch('/api/settings/voice', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ keyword: voiceKeyword, pauseDuration: voicePauseDuration, language: voiceLanguage, enabled: voiceEnabled }),
                    });
                  }}
                  className="text-sm"
                />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
