import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { fetchMangaDetailsReal, fetchChapterImagesReal, fetchNovelTextReal, normalizeMangaUrl, SearchResult } from '@/utils/scraper';

export interface ActiveDownload {
  id: string;
  mangaTitle: string;
  coverUrl: string;
  chaptersCount: number;
  selectedChapters: string[];
  currentChapterIndex: number;
  currentChapterTitle: string;
  chapterProgress: number; // 0 to 100
  currentPage: number;
  totalPages: number;
  totalProgress: number; // 0 to 100
  status: 'downloading' | 'paused' | 'completed' | 'failed';
  speed: string;
  eta: string;
  logs: string[];
  chapterUrls?: Record<string, string>;
  mangaType?: string;
  synopsis?: string;
}

export interface HistoryItem {
  id: string;
  mangaTitle: string;
  coverUrl: string;
  chaptersCount: number;
  downloadDate: string;
  savePath: string;
  source: string;
  mangaType?: string;
  synopsis?: string;
  lastReadChapter?: string;
}

export interface MangaDetail {
  title: string;
  coverUrl: string;
  synopsis: string;
  chapters: string[];
  chapterUrls?: Record<string, string>;
  source: string;
  url: string;
}

interface MangaContextType {
  activeSource: string;
  setActiveSource: (source: string) => void;
  currentSavePath: string;
  setCurrentSavePath: (path: string) => void;
  mangaDetails: MangaDetail | null;
  loadingDetails: boolean;
  fetchMangaDetails: (url: string) => Promise<void>;
  clearDetails: () => void;
  activeDownloads: ActiveDownload[];
  downloadHistory: HistoryItem[];
  localLibrary: HistoryItem[];
  loadingLibrary: boolean;
  scanLibrary: () => Promise<void>;
  deleteManga: (mangaTitle: string, savePath: string) => Promise<void>;
  updateLastReadChapter: (savePath: string, chapterFolder: string) => Promise<void>;
  startDownload: (chapters: string[], overridenType?: string, customDetails?: {
    title: string;
    coverUrl: string;
    synopsis: string;
    chapterUrls: Record<string, string>;
    source: string;
  }) => void;
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  clearHistory: () => void;
  searchResults: SearchResult[];
  searching: boolean;
  searchManga: (query: string) => Promise<void>;
  clearSearchResults: () => void;
  latestUpdates: SearchResult[];
  loadingLatest: boolean;
  loadingMore: boolean;
  hasMorePages: boolean;
  fetchLatestUpdates: () => Promise<void>;
  fetchMoreLatestUpdates: () => Promise<void>;
  trendingNovels: SearchResult[];
  loadingTrending: boolean;
}

const MangaContext = createContext<MangaContextType | undefined>(undefined);

// Preset mock data for instant demo testing
const PRESETS: Record<string, Omit<MangaDetail, 'url' | 'source'>> = {
  'solo-leveling': {
    title: 'Solo Leveling',
    coverUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=400&q=80', // Anime/manga themed search
    synopsis: 'No mundo onde caçadores devem lutar contra monstros mortais para proteger a humanidade, Sung Jinwoo, o caçador mais fraco de todos, encontra-se em uma luta pela sobrevivência que mudará sua vida para sempre.',
    chapters: Array.from({ length: 179 }, (_, i) => `Capítulo ${179 - i}`),
  },
  'beginning-after-end': {
    title: 'The Beginning After the End',
    coverUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&q=80',
    synopsis: 'O Rei Grey tem força, riqueza e prestígio incomparáveis em um mundo governado pela habilidade marcial. No entanto, a solidão permanece de perto. Reencarnado em um novo mundo cheio de magia e monstros, ele tem uma segunda chance de reviver sua vida.',
    chapters: Array.from({ length: 150 }, (_, i) => `Capítulo ${150 - i}`),
  },
  'one-piece': {
    title: 'One Piece',
    coverUrl: 'https://images.unsplash.com/photo-1560169897-fc0cdbdfa4d5?w=400&q=80',
    synopsis: 'Monkey D. Luffy recusa-se a deixar que qualquer pessoa ou coisa se interponha em seu caminho para se tornar o rei de todos os piratas. Com um curso traçado para as águas traiçoeiras da Grand Line, este é um capitão que nunca desistirá até conseguir o maior tesouro da Terra.',
    chapters: Array.from({ length: 1110 }, (_, i) => `Capítulo ${1110 - i}`),
  },
};

const HISTORY_FILE_PATH = `${FileSystem.documentDirectory}history.json`;

const saveHistory = async (historyList: HistoryItem[]) => {
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem('manga_download_history', JSON.stringify(historyList));
    } catch (e) {
      console.error('Failed to save history in localStorage', e);
    }
    return;
  }

  try {
    const jsonStr = JSON.stringify(historyList);
    await FileSystem.writeAsStringAsync(HISTORY_FILE_PATH, jsonStr, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (e) {
    console.error('Failed to save history to file system', e);
  }
};

const loadHistory = async (): Promise<HistoryItem[]> => {
  if (Platform.OS === 'web') {
    try {
      const data = localStorage.getItem('manga_download_history');
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to load history from localStorage', e);
      return [];
    }
  }

  try {
    const fileInfo = await FileSystem.getInfoAsync(HISTORY_FILE_PATH);
    if (fileInfo.exists) {
      const data = await FileSystem.readAsStringAsync(HISTORY_FILE_PATH, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load history from file system', e);
  }
  return [];
};

const BackgroundService = Platform.OS !== 'web' ? require('react-native-background-actions').default : null;

export function MangaProvider({ children }: { children: React.ReactNode }) {
  const [activeSource, setActiveSource] = useState('mangaread.org');
  const [currentSavePath, setCurrentSavePath] = useState('/Downloads/MangaEasy');
  const [mangaDetails, setMangaDetails] = useState<MangaDetail | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownload[]>([]);
  const [downloadHistory, setDownloadHistory] = useState<HistoryItem[]>([]);
  const [deletedMangaWeb, setDeletedMangaWeb] = useState<string[]>([]);
  const [localLibrary, setLocalLibrary] = useState<HistoryItem[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [latestUpdates, setLatestUpdates] = useState<SearchResult[]>([]);
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMorePages, setHasMorePages] = useState(true);
  const [currentLatestPage, setCurrentLatestPage] = useState(1);
  const [trendingNovels, setTrendingNovels] = useState<SearchResult[]>([]);
  const [loadingTrending, setLoadingTrending] = useState(false);

  const downloadIntervals = useRef<Record<string, NodeJS.Timeout>>({});
  const downloadStateRef = useRef<Record<string, 'downloading' | 'paused' | 'cancelled' | 'completed'>>({});
  const activeDownloadLoopsRef = useRef<Record<string, boolean>>({});
  const activeDownloadsRef = useRef<ActiveDownload[]>([]);

  // Keep activeDownloadsRef synced with state for background tasks
  useEffect(() => {
    activeDownloadsRef.current = activeDownloads;
  }, [activeDownloads]);

  // Load history at startup
  useEffect(() => {
    const initHistory = async () => {
      const saved = await loadHistory();
      setDownloadHistory(saved);
    };
    initHistory();
  }, []);

  // Manage background service lifecycle based on active downloads
  useEffect(() => {
    if (Platform.OS === 'web' || !BackgroundService) return;

    // Temporarily bypass native background service to prevent Android 13+ permission crashes
    return;

    const manageBackgroundService = async () => {
      const isRunning = BackgroundService.isRunning();
      
      if (hasActive && !isRunning) {
        try {
          const firstDownloading = activeDownloads.find(dl => dl.status === 'downloading');
          const options = {
            taskName: 'MangaEasyDownload',
            taskTitle: `Baixando ${firstDownloading?.mangaTitle || 'Mangá'}`,
            taskDesc: 'Fazendo download de capítulos...',
            taskIcon: {
              name: 'ic_launcher',
              type: 'mipmap',
            },
            color: '#d026ff',
            linkingURI: 'mangaeasy://',
            foregroundServiceType: ['dataSync'],
            parameters: {
              delay: 1500,
            },
          };
          
          await BackgroundService.start(async () => {
            while (true) {
              const active = activeDownloadsRef.current.filter(dl => dl.status === 'downloading');
              const activeCount = active.length;
              const currentDownload = active.length > 0 ? active[0] : null;

              if (activeCount === 0) {
                break;
              }

              if (currentDownload && BackgroundService.isRunning()) {
                try {
                  await BackgroundService.updateNotification({
                    taskTitle: `Baixando ${currentDownload.mangaTitle}`,
                    taskDesc: `${currentDownload.currentChapterTitle} - ${currentDownload.totalProgress}% concluído`,
                  });
                } catch (e) {
                  // ignore notification update errors
                }
              }

              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }, options);
        } catch (err) {
          console.error('Erro ao iniciar serviço de download em segundo plano:', err);
        }
      } else if (!hasActive && isRunning) {
        try {
          await BackgroundService.stop();
        } catch (err) {
          console.error('Erro ao parar serviço de download em segundo plano:', err);
        }
      }
    };

    manageBackgroundService();
  }, [activeDownloads]);

  const scanLibrary = useCallback(async () => {
    if (Platform.OS === 'web') {
      // Group downloadHistory by mangaTitle on Web to simulate scanned folders
      const grouped: Record<string, HistoryItem> = {};
      downloadHistory.forEach((item) => {
        const title = item.mangaTitle;
        if (deletedMangaWeb.includes(title)) return;
        if (!grouped[title]) {
          grouped[title] = {
            ...item,
            id: `local-${title}`,
            downloadDate: 'Local',
          };
        } else {
          grouped[title].chaptersCount += item.chaptersCount;
        }
      });
      setLocalLibrary(Object.values(grouped));
      return;
    }

    setLoadingLibrary(true);
    try {
      const cleanSavePath = currentSavePath.startsWith('/') ? currentSavePath.slice(1) : currentSavePath;
      const downloadsDir = `${FileSystem.documentDirectory}${cleanSavePath}`;

      const dirInfo = await FileSystem.getInfoAsync(downloadsDir);
      if (!dirInfo.exists) {
        setLocalLibrary([]);
        return;
      }

      const contents = await FileSystem.readDirectoryAsync(downloadsDir);
      const libraryItems: HistoryItem[] = [];

      for (const name of contents) {
        if (name.startsWith('.')) continue;

        const itemPath = `${downloadsDir}/${name}`;
        const itemInfo = await FileSystem.getInfoAsync(itemPath);

        if (itemInfo.isDirectory) {
          const mangaContents = await FileSystem.readDirectoryAsync(itemPath);

          // Find cover image
          let coverUri = '';
          const coverFile = mangaContents.find((f) => {
            const lower = f.toLowerCase();
            return (
              lower.startsWith('cover.') &&
              (lower.endsWith('.jpg') ||
                lower.endsWith('.jpeg') ||
                lower.endsWith('.png') ||
                lower.endsWith('.webp'))
            );
          });

          if (coverFile) {
            coverUri = `${itemPath}/${coverFile}`;
          }

          // Count chapters
          const chapterDirs = mangaContents.filter((f) => {
            if (f.startsWith('.')) return false;
            const lower = f.toLowerCase();
            if (lower.startsWith('cover.')) return false;
            if (
              lower.endsWith('.jpg') ||
              lower.endsWith('.jpeg') ||
              lower.endsWith('.png') ||
              lower.endsWith('.webp') ||
              lower.endsWith('.json')
            ) {
              return false;
            }
            return true;
          });

          const hasDirectImages = mangaContents.some((f) => {
            const lower = f.toLowerCase();
            if (lower.startsWith('cover.')) return false;
            return (
              lower.endsWith('.jpg') ||
              lower.endsWith('.jpeg') ||
              lower.endsWith('.png') ||
              lower.endsWith('.webp')
            );
          });

          let chaptersCount = chapterDirs.length;
          if (hasDirectImages && chaptersCount === 0) {
            chaptersCount = 1;
          }

          // Read metadata.json if exists
          let mangaType = 'Manga';
          let synopsis = '';
          let lastReadChapter: string | undefined;
          let realTitle = name; // Fallback to folder name
          const hasMetadata = mangaContents.includes('metadata.json');
          if (hasMetadata) {
            try {
              const metaContent = await FileSystem.readAsStringAsync(`${itemPath}/metadata.json`);
              const meta = JSON.parse(metaContent);
              if (meta.title) realTitle = meta.title;
              if (meta.mangaType) mangaType = meta.mangaType;
              if (meta.synopsis) synopsis = meta.synopsis;
              if (meta.lastReadChapter) lastReadChapter = meta.lastReadChapter;
            } catch (err) {
              console.warn('Erro ao ler metadados locais do item:', name, err);
            }
          }

          libraryItems.push({
            id: `local-${name}-${Date.now()}`,
            mangaTitle: realTitle,
            coverUrl: coverUri || 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80',
            chaptersCount: chaptersCount,
            downloadDate: 'Local',
            savePath: itemPath,
            source: 'Local',
            mangaType,
            synopsis,
            lastReadChapter,
          });
        }
      }

      setLocalLibrary(libraryItems);
    } catch (err) {
      console.error('Erro ao escanear a biblioteca local:', err);
    } finally {
      setLoadingLibrary(false);
    }
  }, [downloadHistory, currentSavePath, deletedMangaWeb]);

  // Re-scan library when history or save path changes
  useEffect(() => {
    scanLibrary();
  }, [scanLibrary]);

  const deleteManga = useCallback(async (mangaTitle: string, savePath: string) => {
    if (Platform.OS === 'web') {
      setDeletedMangaWeb((prev) => [...prev, mangaTitle]);
      return;
    }

    try {
      const dirInfo = await FileSystem.getInfoAsync(savePath);
      if (dirInfo.exists) {
        // --- Bug 5: preserve cover before deletion ---
        try {
          const coversDir = `${FileSystem.documentDirectory}MangaCovers`;
          const coversDirInfo = await FileSystem.getInfoAsync(coversDir);
          if (!coversDirInfo.exists) {
            await FileSystem.makeDirectoryAsync(coversDir, { intermediates: true });
          }

          const mangaContents = await FileSystem.readDirectoryAsync(savePath);
          const coverFile = mangaContents.find((f) => {
            const lower = f.toLowerCase();
            return (
              lower.startsWith('cover.') &&
              (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp'))
            );
          });

          if (coverFile) {
            const sanitized = mangaTitle.replace(/[\\/:*?"<>|]/g, '_').trim();
            const ext = coverFile.split('.').pop() || 'jpg';
            const destPath = `${coversDir}/${sanitized}.${ext}`;
            await FileSystem.copyAsync({ from: `${savePath}/${coverFile}`, to: destPath });
          }
        } catch (coverErr) {
          console.warn('Não foi possível preservar a capa:', coverErr);
        }
        // --- end Bug 5 ---

        await FileSystem.deleteAsync(savePath, { idempotent: true });
      }

      await scanLibrary();
    } catch (err) {
      console.error('Erro ao excluir mangá local:', err);
      alert('Erro ao excluir o mangá do armazenamento.');
    }
  }, [scanLibrary]);

  const updateLastReadChapter = useCallback(async (savePath: string, chapterFolder: string) => {
    if (Platform.OS === 'web') return;
    try {
      const metaPath = `${savePath}/metadata.json`;
      let meta: Record<string, any> = {};
      const metaInfo = await FileSystem.getInfoAsync(metaPath);
      if (metaInfo.exists) {
        const content = await FileSystem.readAsStringAsync(metaPath);
        meta = JSON.parse(content);
      }
      meta.lastReadChapter = chapterFolder;
      await FileSystem.writeAsStringAsync(metaPath, JSON.stringify(meta));
      // Update in-memory localLibrary as well for instant UI update
      setLocalLibrary(prev =>
        prev.map(item =>
          item.savePath === savePath ? { ...item, lastReadChapter: chapterFolder } : item
        )
      );
    } catch (err) {
      console.warn('Erro ao salvar último capítulo lido:', err);
    }
  }, []);


  // Fetch latest updates whenever activeSource changes
  useEffect(() => {
    fetchLatestUpdates();
    if (activeSource === 'novelbuddy.com') {
      fetchTrendingNovels();
    } else {
      setTrendingNovels([]);
    }
  }, [activeSource]);

  const clearDetails = () => setMangaDetails(null);

  const fetchMangaDetails = async (url: string) => {
    setLoadingDetails(true);

    if (Platform.OS === 'web') {
      // CORS constraints fallback on Web
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const lowerUrl = url.toLowerCase();
      let selectedPreset: Omit<MangaDetail, 'url' | 'source'> | null = null;

      if (lowerUrl.includes('solo') || lowerUrl.includes('leveling')) {
        selectedPreset = PRESETS['solo-leveling'];
      } else if (lowerUrl.includes('beginning') || lowerUrl.includes('after') || lowerUrl.includes('tbate')) {
        selectedPreset = PRESETS['beginning-after-end'];
      } else if (lowerUrl.includes('piece') || lowerUrl.includes('luffy')) {
        selectedPreset = PRESETS['one-piece'];
      }

      if (selectedPreset) {
        setMangaDetails({
          ...selectedPreset,
          source: activeSource,
          url,
        });
      } else {
        let cleanTitle = 'Manga Importado';
        try {
          const parts = url.replace(/(https?:\/\/)?(www\.)?/, '').split('/');
          const segment = parts.find((p) => p.length > 2 && !p.includes('.') && p !== 'manga') || 'Manga';
          cleanTitle = segment
            .split(/[-_]/)
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        } catch (e) {
          // Fallback
        }

        setMangaDetails({
          title: cleanTitle,
          coverUrl: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80',
          synopsis: `[Aviso Web: Download real desativado no navegador devido a restrições de CORS] Mangá importado simulando do site ${activeSource}.`,
          chapters: Array.from({ length: 60 }, (_, i) => `Capítulo ${60 - i}`),
          source: activeSource,
          url,
        });
      }
      setLoadingDetails(false);
      return;
    }

    try {
      const normalizedUrl = normalizeMangaUrl(url);
      const scraped = await fetchMangaDetailsReal(normalizedUrl, activeSource);
      
      setMangaDetails({
        ...scraped,
        source: activeSource,
        url: normalizedUrl,
      });
        } catch (e: any) {
      console.error(e);
      const errorMsg = e.message || String(e);
      if (errorMsg.includes('não está disponível nas fontes de leitura')) {
        if (Platform.OS === 'web') {
          alert(errorMsg);
        } else {
          Alert.alert('Novel Indisponível', errorMsg);
        }
      }
      throw new Error(errorMsg);
    } finally {
      setLoadingDetails(false);
    }
  };

  const startDownload = (
    chapters: string[],
    overridenType?: string,
    customDetails?: {
      title: string;
      coverUrl: string;
      synopsis: string;
      chapterUrls: Record<string, string>;
      source: string;
    }
  ) => {
    const details = customDetails || mangaDetails;
    if (!details || chapters.length === 0) return;

    const id = `dl-${Date.now()}`;
    // Sort chapters in ascending chronological order based on the chapter number
    const getChapterNum = (title: string): number => {
      const match = title.match(/(\d+(?:\.\d+)?)/);
      return match ? parseFloat(match[1]) : 0;
    };
    const sortedChapters = [...chapters].sort((a, b) => getChapterNum(a) - getChapterNum(b));
    
    let finalMangaType = overridenType || (details as any).mangaType || 'Novel';
    if (
      details.source?.toLowerCase().includes('asura') ||
      (details as any).url?.toLowerCase().includes('asura')
    ) {
      finalMangaType = 'Manhwa';
    }

    const newDownload: ActiveDownload = {
      id,
      mangaTitle: details.title,
      coverUrl: details.coverUrl,
      chaptersCount: sortedChapters.length,
      selectedChapters: sortedChapters,
      currentChapterIndex: 0,
      currentChapterTitle: sortedChapters[0],
      chapterProgress: 0,
      currentPage: 0,
      totalPages: 0,
      totalProgress: 0,
      status: 'downloading',
      speed: '0.0 MB/s',
      eta: '--:--',
      logs: [`[INFO] Iniciando download: ${details.title} (${details.source})`, `[INFO] ${sortedChapters.length} capítulos selecionados para download.`],
      chapterUrls: details.chapterUrls,
      mangaType: finalMangaType,
      synopsis: details.synopsis || '',
    };

    setActiveDownloads((prev) => [newDownload, ...prev]);

    if (Platform.OS === 'web') {
      runDownloadSim(id, sortedChapters);
    } else {
      runDownloadReal(id, sortedChapters, 0, 0, {
        title: details.title,
        coverUrl: details.coverUrl,
        synopsis: details.synopsis || '',
        mangaType: finalMangaType,
        chapterUrls: details.chapterUrls,
      });
    }
  };

  const runDownloadSim = (id: string, chapters: string[]) => {
    let currentIdx = 0;
    let page = 0;
    let totalPgs = Math.floor(Math.random() * 8) + 15; // 15 to 22 pages

    const interval = setInterval(() => {
      setActiveDownloads((prev) => {
        const itemIndex = prev.findIndex((dl) => dl.id === id);
        if (itemIndex === -1) {
          clearInterval(interval);
          return prev;
        }

        const item = prev[itemIndex];
        if (item.status === 'paused') return prev;

        page += 1;
        const pagePct = Math.round((page / totalPgs) * 100);
        const overallPct = Math.round(((currentIdx + page / totalPgs) / chapters.length) * 100);

        const randSpeed = (Math.random() * 3.5 + 3.0).toFixed(1);
        const remainingChapters = chapters.length - currentIdx;
        const remainingPages = (remainingChapters * totalPgs) - page;
        const secondsRemaining = Math.max(1, Math.round(remainingPages * 0.4));
        const formattedEta = secondsRemaining >= 60 
          ? `${Math.floor(secondsRemaining / 60)}m ${secondsRemaining % 60}s`
          : `${secondsRemaining}s`;

        let updatedLogs = [...item.logs];
        if (page === 1) {
          updatedLogs.push(`[DOWNLOAD] Baixando ${item.currentChapterTitle}: página 1 de ${totalPgs}`);
        } else if (page % 5 === 0 && page < totalPgs) {
          updatedLogs.push(`[DOWNLOAD] Progresso ${item.currentChapterTitle}: ${page}/${totalPgs} páginas salvas.`);
        }

        let nextIdx = currentIdx;
        let nextChapterTitle = item.currentChapterTitle;
        let nextStatus = item.status;
        let finalPage = page;
        let finalTotalPgs = totalPgs;

        if (page >= totalPgs) {
          updatedLogs.push(`[SUCESSO] ${item.currentChapterTitle} salvo na pasta local.`);
          if (currentIdx + 1 < chapters.length) {
            nextIdx += 1;
            nextChapterTitle = chapters[nextIdx];
            finalPage = 0;
            page = 0;
            finalTotalPgs = Math.floor(Math.random() * 8) + 15;
            totalPgs = finalTotalPgs;
            updatedLogs.push(`[DOWNLOAD] Buscando páginas para ${nextChapterTitle}...`);
          } else {
            clearInterval(interval);
            delete downloadIntervals.current[id];
            nextStatus = 'completed';
            updatedLogs.push(`[SUCESSO] Todos os capítulos baixados com sucesso!`);
            
            const targetMangaTitle = item.mangaTitle;
            const targetCoverUrl = item.coverUrl;
            const targetChaptersCount = item.chaptersCount;
            const mangaDir = `${currentSavePath}/${targetMangaTitle}`;
            setTimeout(() => {
              setDownloadHistory((hist) => {
                const existingIdx = hist.findIndex(h => h.mangaTitle === targetMangaTitle);
                let next = [...hist];
                if (existingIdx !== -1) {
                  const existingItem = hist[existingIdx];
                  const updatedItem = {
                    ...existingItem,
                    coverUrl: targetCoverUrl || existingItem.coverUrl,
                    chaptersCount: existingItem.chaptersCount + targetChaptersCount,
                    downloadDate: new Date().toLocaleString('pt-BR'),
                    savePath: mangaDir,
                  };
                  next.splice(existingIdx, 1);
                  next = [updatedItem, ...next];
                } else {
                  next = [
                    {
                      id: `hist-${Date.now()}`,
                      mangaTitle: targetMangaTitle,
                      coverUrl: targetCoverUrl,
                      chaptersCount: targetChaptersCount,
                      downloadDate: new Date().toLocaleString('pt-BR'),
                      savePath: mangaDir,
                      source: activeSource,
                    },
                    ...next,
                  ];
                }
                saveHistory(next);
                return next;
              });
              setActiveDownloads((currDl) => currDl.filter((d) => d.id !== id));
            }, 1000);
          }
        }

        const updatedItem: ActiveDownload = {
          ...item,
          currentChapterIndex: nextIdx,
          currentChapterTitle: nextChapterTitle,
          chapterProgress: pagePct,
          currentPage: finalPage,
          totalPages: finalTotalPgs,
          totalProgress: Math.min(overallPct, 100),
          status: nextStatus,
          speed: nextStatus === 'completed' ? '0.0 MB/s' : `${randSpeed} MB/s`,
          eta: nextStatus === 'completed' ? '0s' : formattedEta,
          logs: updatedLogs.slice(-40),
        };

        const nextDownloads = [...prev];
        nextDownloads[itemIndex] = updatedItem;
        return nextDownloads;
      });
    }, 450);

    downloadIntervals.current[id] = interval;
  };

  const runDownloadReal = async (
    id: string,
    chapters: string[],
    startChapterIdx = 0,
    startPageIdx = 0,
    metadata?: {
      title: string;
      coverUrl: string;
      synopsis: string;
      mangaType: string;
      chapterUrls?: Record<string, string>;
    }
  ) => {
    activeDownloadLoopsRef.current[id] = true;
    downloadStateRef.current[id] = 'downloading';

    const addLog = (text: string) => {
      setActiveDownloads((prev) =>
        prev.map((dl) => {
          if (dl.id === id) {
            return { ...dl, logs: [...dl.logs, text].slice(-40) };
          }
          return dl;
        })
      );
    };

    const updateProgress = (updates: Partial<ActiveDownload>) => {
      setActiveDownloads((prev) =>
        prev.map((dl) => {
          if (dl.id === id) {
            return { ...dl, ...updates };
          }
          return dl;
        })
      );
    };

    try {
      let currentIdx = startChapterIdx;
      let pageIndex = startPageIdx;

      addLog(`[INFO] Analisando estrutura de capítulos...`);
      
      const sanitizeFolderName = (name: string) => {
        return name.replace(/[\\/:*?"<>|]/g, '_').trim();
      };
      
      const metaTitle = metadata?.title || mangaDetails?.title || 'Manga';
      const metaCoverUrl = metadata?.coverUrl || mangaDetails?.coverUrl || '';
      const metaSynopsis = metadata?.synopsis || mangaDetails?.synopsis || '';
      const metaMangaType = metadata?.mangaType || mangaDetails?.mangaType || 'Manga';
      const metaChapterUrls = metadata?.chapterUrls || mangaDetails?.chapterUrls || {};

      const cleanMangaTitle = sanitizeFolderName(metaTitle);
      const cleanSavePath = currentSavePath.startsWith('/') ? currentSavePath.slice(1) : currentSavePath;
      const mangaDir = `${FileSystem.documentDirectory}${cleanSavePath}/${cleanMangaTitle}`;

      // Create manga folder
      try {
        await FileSystem.makeDirectoryAsync(mangaDir, { intermediates: true });
        
        // Save metadata.json
        const localMeta = {
          title: metaTitle,
          coverUrl: metaCoverUrl,
          synopsis: metaSynopsis,
          mangaType: metaMangaType,
        };
        await FileSystem.writeAsStringAsync(
          `${mangaDir}/metadata.json`,
          JSON.stringify(localMeta, null, 2)
        );
      } catch (err: any) {
        addLog(`[ERRO] Falha ao criar diretório/salvar metadados do mangá: ${err.message}`);
      }

      // Download cover image if it doesn't exist
      let localCoverUri = '';
      if (metaCoverUrl) {
        let ext = 'jpg';
        if (metaCoverUrl.includes('.webp')) ext = 'webp';
        else if (metaCoverUrl.includes('.png')) ext = 'png';
        else if (metaCoverUrl.includes('.jpeg')) ext = 'jpeg';

        const coverFileUri = `${mangaDir}/cover.${ext}`;
        try {
          const fileInfo = await FileSystem.getInfoAsync(coverFileUri);
          if (!fileInfo.exists) {
            addLog(`[INFO] Baixando imagem de capa do mangá...`);
            await FileSystem.downloadAsync(metaCoverUrl, coverFileUri);
            addLog(`[SUCESSO] Capa do mangá salva localmente.`);
          }
          localCoverUri = coverFileUri;
        } catch (err: any) {
          addLog(`[AVISO] Não foi possível salvar a capa localmente: ${err.message}`);
        }
      }

      const formatChapterFolder = (title: string) => {
        const match = title.match(/\d+(\.\d+)?/);
        if (match) {
          return `cap-${match[0]}`;
        }
        return title.toLowerCase().replace(/\s+/g, '-').replace(/[\\/:*?"<>|]/g, '');
      };

      for (let cIdx = currentIdx; cIdx < chapters.length; cIdx++) {
        if (downloadStateRef.current[id] === 'paused') {
          addLog(`[INFO] Download pausado no capítulo: ${chapters[cIdx]}`);
          return;
        }
        if (downloadStateRef.current[id] === 'cancelled') {
          addLog(`[INFO] Download cancelado.`);
          return;
        }

        const chapterTitle = chapters[cIdx];
        const chapterUrl = metaChapterUrls[chapterTitle];

        if (!chapterUrl) {
          addLog(`[ERRO] URL não encontrada para o capítulo: ${chapterTitle}`);
          updateProgress({ status: 'failed' });
          return;
        }

        const isNovel = metaMangaType === 'Novel';
        const formattedChapterFolder = formatChapterFolder(chapterTitle);
        const targetDir = `${mangaDir}/${formattedChapterFolder}`;

        try {
          await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
        } catch (err: any) {
          addLog(`[ERRO] Falha ao criar diretório local: ${err.message}`);
          updateProgress({ status: 'failed' });
          return;
        }

        if (isNovel) {
          addLog(`[INFO] Buscando texto para ${chapterTitle}...`);
          try {
            const paragraphs = await fetchNovelTextReal(chapterUrl);
            addLog(`[INFO] Encontrados ${paragraphs.length} parágrafos para ${chapterTitle}.`);
            
            // Save chapter.json
            const chapterData = {
              title: chapterTitle,
              url: chapterUrl,
              paragraphs,
            };
            await FileSystem.writeAsStringAsync(
              `${targetDir}/chapter.json`,
              JSON.stringify(chapterData, null, 2)
            );
            addLog(`[SUCESSO] Conteúdo do capítulo salvo localmente.`);
            
            const overallPct = Math.round(((cIdx + 1) / chapters.length) * 100);
            updateProgress({
              currentChapterIndex: cIdx,
              currentChapterTitle: chapterTitle,
              chapterProgress: 100,
              currentPage: 1,
              totalPages: 1,
              totalProgress: overallPct,
            });
            continue; // Next chapter!
          } catch (err: any) {
            if (downloadStateRef.current[id] === 'paused' || downloadStateRef.current[id] === 'cancelled') {
              return;
            }
            addLog(`[ERRO] Falha ao obter texto do capítulo ${chapterTitle}: ${err.message || err}`);
            updateProgress({ status: 'failed' });
            return;
          }
        }

        addLog(`[INFO] Buscando páginas para ${chapterTitle}...`);
        
        let imageUrls: string[] = [];
        try {
          imageUrls = await fetchChapterImagesReal(chapterUrl);
          addLog(`[INFO] Encontradas ${imageUrls.length} páginas para ${chapterTitle}.`);
        } catch (err: any) {
          if (downloadStateRef.current[id] === 'paused' || downloadStateRef.current[id] === 'cancelled') {
            return;
          }
          addLog(`[ERRO] Falha ao obter páginas do capítulo ${chapterTitle}: ${err.message || err}`);
          updateProgress({ status: 'failed' });
          return;
        }

        const startPage = cIdx === currentIdx ? pageIndex : 0;
        for (let pIdx = startPage; pIdx < imageUrls.length; pIdx++) {
          if (downloadStateRef.current[id] === 'paused') {
            addLog(`[INFO] Download pausado na página ${pIdx + 1}`);
            updateProgress({ currentPage: pIdx, currentChapterIndex: cIdx, currentChapterTitle: chapterTitle });
            return;
          }
          if (downloadStateRef.current[id] === 'cancelled') {
            addLog(`[INFO] Download cancelado.`);
            return;
          }

          const imgUrl = imageUrls[pIdx];
          let ext = 'jpg';
          if (imgUrl.includes('.webp')) ext = 'webp';
          else if (imgUrl.includes('.png')) ext = 'png';
          else if (imgUrl.includes('.jpeg')) ext = 'jpeg';

          const fileName = `${pIdx + 1}.${ext}`;
          const fileUri = `${targetDir}/${fileName}`;

          const startTime = Date.now();
          try {
            addLog(`[DOWNLOAD] Baixando ${chapterTitle}: página ${pIdx + 1} de ${imageUrls.length}`);
            
            const resolvedReferer = chapterUrl.startsWith('mangadex://') ? 'https://mangadex.org/' : chapterUrl;
            
            await FileSystem.downloadAsync(imgUrl, fileUri, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
                'Referer': resolvedReferer,
              },
            });

            const endTime = Date.now();
            const durationSec = (endTime - startTime) / 1000;
            const speedMB = (0.25 / Math.max(0.1, durationSec)).toFixed(1); // estimating avg size is 250KB

            const overallPct = Math.round(((cIdx + (pIdx + 1) / imageUrls.length) / chapters.length) * 100);
            const pagePct = Math.round(((pIdx + 1) / imageUrls.length) * 100);

            const remainingChapters = chapters.length - cIdx - 1;
            const remainingPages = (remainingChapters * 20) + (imageUrls.length - pIdx - 1);
            const secondsRemaining = Math.max(1, Math.round(remainingPages * Math.max(0.2, durationSec)));
            const formattedEta = secondsRemaining >= 60 
              ? `${Math.floor(secondsRemaining / 60)}m ${secondsRemaining % 60}s`
              : `${secondsRemaining}s`;

            updateProgress({
              currentChapterIndex: cIdx,
              currentChapterTitle: chapterTitle,
              chapterProgress: pagePct,
              currentPage: pIdx + 1,
              totalPages: imageUrls.length,
              totalProgress: Math.min(overallPct, 100),
              speed: `${speedMB} MB/s`,
              eta: formattedEta,
            });
          } catch (err: any) {
            if (downloadStateRef.current[id] === 'paused' || downloadStateRef.current[id] === 'cancelled') {
              return;
            }
            addLog(`[ERRO] Falha ao baixar página ${pIdx + 1}: ${err.message || err}`);
            updateProgress({ status: 'failed' });
            return;
          }
        }

        addLog(`[SUCESSO] ${chapterTitle} salvo na pasta local.`);
        // Reset pageIndex for subsequent chapters
        pageIndex = 0;
      }

      downloadStateRef.current[id] = 'completed';
      updateProgress({ status: 'completed', speed: '0.0 MB/s', eta: '0s' });
      addLog(`[SUCESSO] Todos os capítulos baixados com sucesso!`);
      
      // Force library scan to update localLibrary instantly
      scanLibrary();

      let finalMangaTitle = '';
      let finalCoverUrl = '';
      let finalChaptersCount = 0;

      setActiveDownloads((prev) => {
        const dl = prev.find((d) => d.id === id);
        if (dl) {
          finalMangaTitle = dl.mangaTitle;
          finalCoverUrl = dl.coverUrl;
          finalChaptersCount = dl.chaptersCount;
        }
        return prev;
      });

      setTimeout(() => {
        setDownloadHistory((hist) => {
          const existingIdx = hist.findIndex(item => item.mangaTitle === finalMangaTitle);
          let next = [...hist];

          if (existingIdx !== -1) {
            const existingItem = hist[existingIdx];
            const updatedItem = {
              ...existingItem,
              coverUrl: localCoverUri || existingItem.coverUrl || finalCoverUrl,
              chaptersCount: existingItem.chaptersCount + finalChaptersCount,
              downloadDate: new Date().toLocaleString('pt-BR'),
              savePath: mangaDir,
            };
            next.splice(existingIdx, 1);
            next = [updatedItem, ...next];
          } else {
            next = [
              {
                id: `hist-${Date.now()}`,
                mangaTitle: finalMangaTitle,
                coverUrl: localCoverUri || finalCoverUrl,
                chaptersCount: finalChaptersCount,
                downloadDate: new Date().toLocaleString('pt-BR'),
                savePath: mangaDir,
                source: activeSource,
              },
              ...next,
            ];
          }
          saveHistory(next);
          return next;
        });
        setActiveDownloads((currDl) => currDl.filter((d) => d.id !== id));
      }, 1000);

    } finally {
      activeDownloadLoopsRef.current[id] = false;
    }
  };

  const pauseDownload = (id: string) => {
    downloadStateRef.current[id] = 'paused';
    setActiveDownloads((prev) =>
      prev.map((dl) => (dl.id === id ? { ...dl, status: 'paused', speed: '0.0 MB/s', eta: '--' } : dl))
    );
  };

  const resumeDownload = (id: string) => {
    setActiveDownloads((prev) => {
      const item = prev.find((dl) => dl.id === id);
      if (!item) return prev;

      const updatedDownloads = prev.map((dl) =>
        dl.id === id ? { ...dl, status: 'downloading' as const } : dl
      );
      
      downloadStateRef.current[id] = 'downloading';

      if (Platform.OS !== 'web') {
        if (!activeDownloadLoopsRef.current[id]) {
          runDownloadReal(
            id,
            item.selectedChapters,
            item.currentChapterIndex,
            item.currentPage,
            {
              title: item.mangaTitle,
              coverUrl: item.coverUrl,
              synopsis: item.synopsis || '',
              mangaType: item.mangaType || 'Manga',
              chapterUrls: item.chapterUrls,
            }
          );
        }
        return updatedDownloads;
      }

      // Re-trigger simulator on web
      if (downloadIntervals.current[id]) {
        clearInterval(downloadIntervals.current[id]);
      }

      let currentIdx = item.currentChapterIndex;
      let page = item.currentPage;
      let totalPgs = item.totalPages;

      const interval = setInterval(() => {
        setActiveDownloads((curr) => {
          const itemIdx = curr.findIndex((dl) => dl.id === id);
          if (itemIdx === -1) {
            clearInterval(interval);
            return curr;
          }
          const dlItem = curr[itemIdx];
          if (dlItem.status === 'paused') return curr;

          page += 1;
          const pagePct = Math.round((page / totalPgs) * 100);
          const overallPct = Math.round(((currentIdx + page / totalPgs) / dlItem.selectedChapters.length) * 100);
          const randSpeed = (Math.random() * 3.5 + 3.0).toFixed(1);
          
          const remainingChapters = dlItem.selectedChapters.length - currentIdx;
          const remainingPages = (remainingChapters * totalPgs) - page;
          const secondsRemaining = Math.max(1, Math.round(remainingPages * 0.4));
          const formattedEta = secondsRemaining >= 60 
            ? `${Math.floor(secondsRemaining / 60)}m ${secondsRemaining % 60}s`
            : `${secondsRemaining}s`;

          let updatedLogs = [...dlItem.logs];
          if (page === 1) {
            updatedLogs.push(`[DOWNLOAD] Baixando ${dlItem.currentChapterTitle}: página 1 de ${totalPgs}`);
          } else if (page % 5 === 0 && page < totalPgs) {
            updatedLogs.push(`[DOWNLOAD] Progresso ${dlItem.currentChapterTitle}: ${page}/${totalPgs} páginas salvas.`);
          }

          let nextIdx = currentIdx;
          let nextChapterTitle = dlItem.currentChapterTitle;
          let nextStatus = dlItem.status;
          let finalPage = page;
          let finalTotalPgs = totalPgs;

          if (page >= totalPgs) {
            updatedLogs.push(`[SUCESSO] ${dlItem.currentChapterTitle} salvo na pasta local.`);
            if (currentIdx + 1 < dlItem.selectedChapters.length) {
              nextIdx += 1;
              nextChapterTitle = dlItem.selectedChapters[nextIdx];
              finalPage = 0;
              page = 0;
              finalTotalPgs = Math.floor(Math.random() * 8) + 15;
              totalPgs = finalTotalPgs;
              updatedLogs.push(`[DOWNLOAD] Buscando páginas para ${nextChapterTitle}...`);
            } else {
              clearInterval(interval);
              delete downloadIntervals.current[id];
              nextStatus = 'completed';
              updatedLogs.push(`[SUCESSO] Todos os capítulos baixados com sucesso!`);
              
              const targetMangaTitle = dlItem.mangaTitle;
              const targetCoverUrl = dlItem.coverUrl;
              const targetChaptersCount = dlItem.chaptersCount;
              const mangaDir = `${currentSavePath}/${targetMangaTitle}`;
              setTimeout(() => {
                setDownloadHistory((hist) => {
                  const existingIdx = hist.findIndex(h => h.mangaTitle === targetMangaTitle);
                  let next = [...hist];
                  if (existingIdx !== -1) {
                    const existingItem = hist[existingIdx];
                    const updatedItem = {
                      ...existingItem,
                      coverUrl: targetCoverUrl || existingItem.coverUrl,
                      chaptersCount: existingItem.chaptersCount + targetChaptersCount,
                      downloadDate: new Date().toLocaleString('pt-BR'),
                      savePath: mangaDir,
                    };
                    next.splice(existingIdx, 1);
                    next = [updatedItem, ...next];
                  } else {
                    next = [
                      {
                        id: `hist-${Date.now()}`,
                        mangaTitle: targetMangaTitle,
                        coverUrl: targetCoverUrl,
                        chaptersCount: targetChaptersCount,
                        downloadDate: new Date().toLocaleString('pt-BR'),
                        savePath: mangaDir,
                        source: activeSource,
                      },
                      ...next,
                    ];
                  }
                  saveHistory(next);
                  return next;
                });
                setActiveDownloads((currDl) => currDl.filter((d) => d.id !== id));
              }, 1000);
            }
          }

          const updatedItem: ActiveDownload = {
            ...dlItem,
            currentChapterIndex: nextIdx,
            currentChapterTitle: nextChapterTitle,
            chapterProgress: pagePct,
            currentPage: finalPage,
            totalPages: finalTotalPgs,
            totalProgress: Math.min(overallPct, 100),
            status: nextStatus,
            speed: nextStatus === 'completed' ? '0.0 MB/s' : `${randSpeed} MB/s`,
            eta: nextStatus === 'completed' ? '0s' : formattedEta,
            logs: updatedLogs.slice(-40),
          };

          const nextCurr = [...curr];
          nextCurr[itemIdx] = updatedItem;
          return nextCurr;
        });
      }, 450);

      downloadIntervals.current[id] = interval;
      return updatedDownloads;
    });
  };

  const cancelDownload = (id: string) => {
    downloadStateRef.current[id] = 'cancelled';
    if (downloadIntervals.current[id]) {
      clearInterval(downloadIntervals.current[id]);
      delete downloadIntervals.current[id];
    }
    setActiveDownloads((prev) => prev.filter((dl) => dl.id !== id));
  };

  const clearHistory = () => {
    setDownloadHistory([]);
    saveHistory([]);
  };

  const clearSearchResults = () => {
    setSearchResults([]);
  };

  const searchManga = async (query: string) => {
    setSearching(true);
    setSearchResults([]);

    if (Platform.OS === 'web') {
      await new Promise((resolve) => setTimeout(resolve, 850));
      const qLower = query.trim().toLowerCase();
      const mockResults: SearchResult[] = [
        {
          title: 'Solo Leveling',
          url: 'https://mangaread.org/manga/solo-leveling-manhwa/',
          coverUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=400&q=80',
        },
        {
          title: 'The Beginning After the End',
          url: 'https://mangaread.org/manga/the-beginning-after-the-end/',
          coverUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&q=80',
        },
        {
          title: 'One Piece',
          url: 'https://mangaread.org/manga/one-piece/',
          coverUrl: 'https://images.unsplash.com/photo-1560169897-fc0cdbdfa4d5?w=400&q=80',
        },
      ];

      const filtered = qLower
        ? mockResults.filter((m) => m.title.toLowerCase().includes(qLower))
        : mockResults;

      setSearchResults(filtered);
      setSearching(false);
      return;
    }

    try {
      const { searchMangaReal } = require('@/utils/scraper');
      const results = await searchMangaReal(query, activeSource);
      setSearchResults(results);
    } catch (e: any) {
      console.error(e);
      throw new Error(`Erro ao buscar mangás: ${e.message || e}`);
    } finally {
      setSearching(false);
    }
  };

  const fetchLatestUpdates = async () => {
    setLoadingMore(false); // Reset pagination loading indicator to prevent stuck state on source change
    setHasMorePages(true); // Reset pagination availability for new source
    setCurrentLatestPage(1); // Reset page counter for new source
    setLoadingLatest(true);
    if (Platform.OS === 'web') {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const mockLatest = [
        {
          title: 'My Golden Traits Can Evolve Infinitely',
          url: 'https://mangaread.org/manga/my-golden-traits-can-evolve-infinitely/',
          coverUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=400&q=80',
          rating: '3.8',
          chapters: [
            { name: 'Chapter 8', date: '25 mins ago' },
            { name: 'Chapter 7', date: '20.06.2026' }
          ]
        },
        {
          title: 'The Villainous General in a Musou Game: Breaking the...',
          url: 'https://mangaread.org/manga/the-villainous-general-in-a-musou-game-breaking-the/',
          coverUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&q=80',
          rating: '4.4',
          chapters: [
            { name: 'Chapter 7.1', date: '27 mins ago' },
            { name: 'Chapter 6.2', date: '27 mins ago' }
          ]
        },
        {
          title: 'World-Saving Is a Skill',
          url: 'https://mangaread.org/manga/world-saving-is-a-skill/',
          coverUrl: 'https://images.unsplash.com/photo-1560169897-fc0cdbdfa4d5?w=400&q=80',
          rating: '4.0',
          chapters: [
            { name: 'Chapter 15', date: '1 hour ago' },
            { name: 'Chapter 14', date: '2 hours ago' }
          ]
        },
        {
          title: 'Reveries of the Moonlight (2025)',
          url: 'https://mangaread.org/manga/reveries-of-the-moonlight-2025/',
          coverUrl: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80',
          rating: '4.2',
          chapters: [
            { name: 'Chapter 5', date: '1 day ago' },
            { name: 'Chapter 4', date: '3 days ago' }
          ]
        },
        {
          title: 'Gatekeeper of the Boundless Worlds',
          url: 'https://mangaread.org/manga/gatekeeper-of-the-boundless-worlds/',
          coverUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=400&q=80',
          rating: '4.7',
          chapters: [
            { name: 'Chapter 12', date: '2 days ago' },
            { name: 'Chapter 11', date: '5 days ago' }
          ]
        },
        {
          title: 'Monster Eater',
          url: 'https://mangaread.org/manga/monster-eater/',
          coverUrl: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80',
          rating: '3.9',
          chapters: [
            { name: 'Chapter 3', date: '3 days ago' },
            { name: 'Chapter 2', date: '1 week ago' }
          ]
        }
      ];
      setLatestUpdates(mockLatest);
      setLoadingLatest(false);
      return;
    }

    try {
      const { fetchLatestUpdatesReal } = require('@/utils/scraper');
      const results = await fetchLatestUpdatesReal(activeSource, 1);
      
      // Deduplicate results
      const unique = [];
      const seen = new Set();
      for (const item of results) {
        if (!seen.has(item.url)) {
          seen.add(item.url);
          unique.push(item);
        }
      }
      setLatestUpdates(unique);
      setCurrentLatestPage(1);
    } catch (e: any) {
      console.error('Erro ao buscar últimos lançamentos:', e);
    } finally {
      setLoadingLatest(false);
    }
  };

  const fetchMoreLatestUpdates = async () => {
    if (loadingMore || !hasMorePages || Platform.OS === 'web') return;
    setLoadingMore(true);
    console.log('[DEBUG] fetchMoreLatestUpdates called. Current page:', currentLatestPage, 'activeSource:', activeSource);
    try {
      const nextPage = currentLatestPage + 1;
      const { fetchLatestUpdatesReal } = require('@/utils/scraper');
      console.log('[DEBUG] Fetching page:', nextPage);
      const results = await fetchLatestUpdatesReal(activeSource, nextPage);
      console.log('[DEBUG] fetchLatestUpdatesReal returned results count:', results.length);
      if (results.length > 0) {
        setLatestUpdates(prev => {
          const combined = [...prev, ...results];
          const unique = [];
          const seen = new Set();
          for (const item of combined) {
            if (!seen.has(item.url)) {
              seen.add(item.url);
              unique.push(item);
            }
          }
          return unique;
        });
        setCurrentLatestPage(nextPage);
        console.log('[DEBUG] Successfully appended page:', nextPage, 'New page state set to:', nextPage);
      } else {
        console.log('[DEBUG] No more pages available for source:', activeSource, '- stopping pagination.');
        setHasMorePages(false);
      }
    } catch (e: any) {
      console.error('[DEBUG] Erro ao carregar mais:', e);
    } finally {
      setLoadingMore(false);
    }
  };

  const fetchTrendingNovels = async () => {
    if (Platform.OS === 'web') return;
    setLoadingTrending(true);
    try {
      const { fetchNovelBuddyTrending } = require('@/utils/scraper');
      const results = await fetchNovelBuddyTrending();
      setTrendingNovels(results);
    } catch (e: any) {
      console.warn('[DEBUG] fetchTrendingNovels error:', e.message);
    } finally {
      setLoadingTrending(false);
    }
  };

  // Clean intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(downloadIntervals.current).forEach((interval) => clearInterval(interval));
    };
  }, []);

  return (
    <MangaContext.Provider
      value={{
        activeSource,
        setActiveSource,
        currentSavePath,
        setCurrentSavePath,
        mangaDetails,
        loadingDetails,
        fetchMangaDetails,
        clearDetails,
        activeDownloads,
        downloadHistory,
        localLibrary,
        loadingLibrary,
        scanLibrary,
        deleteManga,
        updateLastReadChapter,
        startDownload,
        pauseDownload,
        resumeDownload,
        cancelDownload,
        clearHistory,
        searchResults,
        searching,
        searchManga,
        clearSearchResults,
        latestUpdates,
        loadingLatest,
        loadingMore,
        hasMorePages,
        fetchLatestUpdates,
        fetchMoreLatestUpdates,
        trendingNovels,
        loadingTrending,
      }}>
      {children}
    </MangaContext.Provider>
  );
}

export function useManga() {
  const context = useContext(MangaContext);
  if (!context) {
    throw new Error('useManga must be used within a MangaProvider');
  }
  return context;
}
