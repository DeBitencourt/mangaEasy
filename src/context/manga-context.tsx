import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { fetchMangaDetailsReal, fetchChapterImagesReal, normalizeMangaUrl, SearchResult } from '@/utils/scraper';

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
}

export interface HistoryItem {
  id: string;
  mangaTitle: string;
  coverUrl: string;
  chaptersCount: number;
  downloadDate: string;
  savePath: string;
  source: string;
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
  startDownload: (chapters: string[]) => void;
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
  fetchLatestUpdates: () => Promise<void>;
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

export function MangaProvider({ children }: { children: React.ReactNode }) {
  const [activeSource, setActiveSource] = useState('mangaread.org');
  const [currentSavePath, setCurrentSavePath] = useState('/Downloads/MangaEasy');
  const [mangaDetails, setMangaDetails] = useState<MangaDetail | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownload[]>([]);
  const [downloadHistory, setDownloadHistory] = useState<HistoryItem[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [latestUpdates, setLatestUpdates] = useState<SearchResult[]>([]);
  const [loadingLatest, setLoadingLatest] = useState(false);

  const downloadIntervals = useRef<Record<string, NodeJS.Timeout>>({});
  const downloadStateRef = useRef<Record<string, 'downloading' | 'paused' | 'cancelled' | 'completed'>>({});

  // Load history at startup
  useEffect(() => {
    const initHistory = async () => {
      const saved = await loadHistory();
      setDownloadHistory(saved);
    };
    initHistory();
  }, []);

  // Fetch latest updates whenever activeSource changes
  useEffect(() => {
    fetchLatestUpdates();
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
      throw new Error(`Erro ao buscar detalhes do mangá: ${e.message || e}`);
    } finally {
      setLoadingDetails(false);
    }
  };

  const startDownload = (chapters: string[]) => {
    if (!mangaDetails || chapters.length === 0) return;

    const id = `dl-${Date.now()}`;
    const sortedChapters = [...chapters].reverse(); // download in ascending order (older first)
    
    const newDownload: ActiveDownload = {
      id,
      mangaTitle: mangaDetails.title,
      coverUrl: mangaDetails.coverUrl,
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
      logs: [`[INFO] Iniciando download do mangá: ${mangaDetails.title}`, `[INFO] ${sortedChapters.length} capítulos selecionados para download.`],
    };

    setActiveDownloads((prev) => [newDownload, ...prev]);

    if (Platform.OS === 'web') {
      runDownloadSim(id, sortedChapters);
    } else {
      runDownloadReal(id, sortedChapters);
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
            setTimeout(() => {
              setDownloadHistory((hist) => {
                const next = [
                  {
                    id: `hist-${Date.now()}`,
                    mangaTitle: targetMangaTitle,
                    coverUrl: targetCoverUrl,
                    chaptersCount: targetChaptersCount,
                    downloadDate: new Date().toLocaleString('pt-BR'),
                    savePath: `${currentSavePath}/${targetMangaTitle}`,
                    source: activeSource,
                  },
                  ...hist,
                ];
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

  const runDownloadReal = async (id: string, chapters: string[]) => {
    let currentIdx = 0;
    let pageIndex = 0;

    setActiveDownloads((prev) => {
      const dl = prev.find((d) => d.id === id);
      if (dl) {
        currentIdx = dl.currentChapterIndex;
        pageIndex = dl.currentPage;
      }
      return prev;
    });

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

    addLog(`[INFO] Analisando estrutura de capítulos...`);
    
    const sanitizeFolderName = (name: string) => {
      return name.replace(/[\\/:*?"<>|]/g, '_').trim();
    };
    
    const cleanMangaTitle = sanitizeFolderName(mangaDetails?.title || 'Manga');
    const cleanSavePath = currentSavePath.startsWith('/') ? currentSavePath.slice(1) : currentSavePath;

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
      const chapterUrl = mangaDetails?.chapterUrls?.[chapterTitle];

      if (!chapterUrl) {
        addLog(`[ERRO] URL não encontrada para o capítulo: ${chapterTitle}`);
        updateProgress({ status: 'failed' });
        return;
      }

      addLog(`[INFO] Buscando páginas para ${chapterTitle}...`);
      
      let imageUrls: string[] = [];
      try {
        imageUrls = await fetchChapterImagesReal(chapterUrl);
        addLog(`[INFO] Encontradas ${imageUrls.length} páginas para ${chapterTitle}.`);
      } catch (err: any) {
        addLog(`[ERRO] Falha ao obter páginas do capítulo ${chapterTitle}: ${err.message || err}`);
        updateProgress({ status: 'failed' });
        return;
      }

      const cleanChapterTitle = sanitizeFolderName(chapterTitle);
      const targetDir = `${FileSystem.documentDirectory}${cleanSavePath}/${cleanMangaTitle}/${cleanChapterTitle}`;

      try {
        await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
      } catch (err: any) {
        addLog(`[ERRO] Falha ao criar diretório local: ${err.message}`);
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
          
          await FileSystem.downloadAsync(imgUrl, fileUri, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
              'Referer': chapterUrl,
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
        const next = [
          {
            id: `hist-${Date.now()}`,
            mangaTitle: finalMangaTitle,
            coverUrl: finalCoverUrl,
            chaptersCount: finalChaptersCount,
            downloadDate: new Date().toLocaleString('pt-BR'),
            savePath: `${FileSystem.documentDirectory}${cleanSavePath}/${cleanMangaTitle}`,
            source: activeSource,
          },
          ...hist,
        ];
        saveHistory(next);
        return next;
      });
      setActiveDownloads((currDl) => currDl.filter((d) => d.id !== id));
    }, 1000);
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
        runDownloadReal(id, item.selectedChapters);
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
              setTimeout(() => {
                setDownloadHistory((hist) => [
                  {
                    id: `hist-${Date.now()}`,
                    mangaTitle: targetMangaTitle,
                    coverUrl: targetCoverUrl,
                    chaptersCount: targetChaptersCount,
                    downloadDate: new Date().toLocaleString('pt-BR'),
                    savePath: `${currentSavePath}/${targetMangaTitle}`,
                    source: activeSource,
                  },
                  ...hist,
                ]);
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
    setLoadingLatest(true);
    if (Platform.OS === 'web') {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const mockLatest = [
        {
          title: 'World-Saving Is a Skill',
          url: 'https://mangaread.org/manga/world-saving-is-a-skill/',
          coverUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=400&q=80',
        },
        {
          title: 'Reveries of the Moonlight (2025)',
          url: 'https://mangaread.org/manga/reveries-of-the-moonlight-2025/',
          coverUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&q=80',
        },
        {
          title: 'Gatekeeper of the Boundless Worlds',
          url: 'https://mangaread.org/manga/gatekeeper-of-the-boundless-worlds/',
          coverUrl: 'https://images.unsplash.com/photo-1560169897-fc0cdbdfa4d5?w=400&q=80',
        },
        {
          title: 'A Hero Who Is Good At Everything',
          url: 'https://mangaread.org/manga/a-hero-who-is-good-at-everything/',
          coverUrl: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80',
        },
        {
          title: 'Monster Eater',
          url: 'https://mangaread.org/manga/monster-eater/',
          coverUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=400&q=80',
        },
        {
          title: 'Hiding Out in an Apocalypse',
          url: 'https://mangaread.org/manga/hiding-out-in-an-apocalypse/',
          coverUrl: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80',
        }
      ];
      setLatestUpdates(mockLatest);
      setLoadingLatest(false);
      return;
    }

    try {
      const { fetchLatestUpdatesReal } = require('@/utils/scraper');
      const results = await fetchLatestUpdatesReal(activeSource);
      setLatestUpdates(results);
    } catch (e: any) {
      console.error('Erro ao buscar últimos lançamentos:', e);
    } finally {
      setLoadingLatest(false);
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
        fetchLatestUpdates,
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
