import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Modal,
  Platform,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { SymbolView } from '@/components/ui/symbol-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useManga } from '@/context/manga-context';
import { useTheme } from '@/hooks/use-theme';

// Import separated styles
import { createSharedStyles } from '@/styles/shared.styles';
import { createDetailsStyles } from '@/styles/details.styles';;
import * as FileSystem from 'expo-file-system/legacy';
import { toggleToReadLocal, isToReadLocal, toggleFavoriteLocal, isFavoriteLocal, getMangaLastReadChapterLocal } from '@/utils/database';
import OnlineReaderModal from '@/components/online-reader-modal';

interface MangaDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (text: string, type: 'success' | 'error') => void;
  onOpenReader?: (manga: any, chapterFolder: string) => void;
}

export default function MangaDetailsModal({ isOpen, onClose, onShowToast, onOpenReader }: MangaDetailsModalProps) {
  const theme = useTheme();
  const sharedStyles = createSharedStyles(theme);
  const styles = createDetailsStyles(theme);

  const {
    mangaDetails,
    loadingDetails,
    fetchMangaDetails,
    startDownload,
    localLibrary,
  } = useManga();

  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [searchChapter, setSearchChapter] = useState('');
  const [sortAscending, setSortAscending] = useState(false);
  const [selectedType, setSelectedType] = useState<string>(''); // Vazio por padrão
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [isSourceDropdownOpen, setIsSourceDropdownOpen] = useState(false);

  // Source states
  const [readingSource, setReadingSource] = useState<'novelbuddy.com' | 'novelfull.com' | 'mangadex.org'>('novelbuddy.com');
  const [loadingNovelFull, setLoadingNovelFull] = useState(false);
  const [novelFullDetails, setNovelFullDetails] = useState<any>(null);
  const [novelFullPage, setNovelFullPage] = useState(1);

  // MangaDex states
  const [loadingMangaDex, setLoadingMangaDex] = useState(false);
  const [mangaDexDetails, setMangaDexDetails] = useState<any>(null);
  const [mangaDexPage, setMangaDexPage] = useState(1);
  const [langFilter, setLangFilter] = useState<'ALL' | 'PT-BR' | 'EN'>('ALL');

  // Range selector state
  const [isRangeActive, setIsRangeActive] = useState(false);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [isToRead, setIsToRead] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [lastReadChapter, setLastReadChapter] = useState<string | null>(null);

  // Online reader state
  const [onlineReaderChapter, setOnlineReaderChapter] = useState<string | null>(null);
  const [isOnlineReaderOpen, setIsOnlineReaderOpen] = useState(false);

  const openOnlineReader = (chapterName: string) => {
    setOnlineReaderChapter(chapterName);
    setIsOnlineReaderOpen(true);
  };

  // Clear selections when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSelectedChapters([]);
      setSearchChapter('');
      setIsRangeActive(false);
      setRangeStart('');
      setRangeEnd('');
      setIsSourceDropdownOpen(false);
      
      const originSource = (mangaDetails as any)?.source;
      if (originSource === 'mangadex.org' || originSource === 'novelbuddy.com' || originSource === 'novelfull.com') {
        setReadingSource(originSource);
      } else {
        setReadingSource('novelbuddy.com');
      }

      setNovelFullDetails(null);
      setNovelFullPage(1);
      setLoadingNovelFull(false);
      setMangaDexDetails(null);
      setMangaDexPage(1);
      setLoadingMangaDex(false);
      setLangFilter('ALL');
    }
  }, [isOpen, mangaDetails]);

  // Load To Read, Favorite, and Last Read status
  useEffect(() => {
    const checkStatus = async () => {
      if (isOpen && mangaDetails) {
        try {
          const toReadVal = await isToReadLocal(mangaDetails.title);
          setIsToRead(toReadVal);
          
          const favVal = await isFavoriteLocal(mangaDetails.title);
          setIsFavorite(favVal);

          const lastReadVal = await getMangaLastReadChapterLocal(mangaDetails.title);
          setLastReadChapter(lastReadVal);
        } catch (e) {
          console.error(e);
        }
      }
    };
    checkStatus();
  }, [isOpen, mangaDetails]);

  const handleToggleToRead = async () => {
    if (!mangaDetails) return;
    try {
      const nextVal = await toggleToReadLocal(
        mangaDetails.title,
        mangaDetails.coverUrl,
        'planning',
        mangaDetails.url,
        mangaDetails.source
      );
      setIsToRead(nextVal);
      onShowToast(nextVal ? 'Adicionado à lista A Ler!' : 'Removido da lista A Ler.', 'success');
    } catch (e) {
      console.error(e);
      onShowToast('Erro ao atualizar lista A Ler.', 'error');
    }
  };

  const handleToggleFavorite = async () => {
    if (!mangaDetails) return;
    try {
      const nextVal = await toggleFavoriteLocal(
        mangaDetails.title,
        mangaDetails.coverUrl,
        mangaDetails.url,
        mangaDetails.source
      );
      setIsFavorite(nextVal);
      onShowToast(nextVal ? 'Adicionado aos Favoritos!' : 'Removido dos Favoritos.', 'success');
    } catch (e) {
      console.error(e);
      onShowToast('Erro ao atualizar Favoritos.', 'error');
    }
  };

  const loadNovelFullDetails = async (page: number = 1) => {
    if (!mangaDetails) return;

    // If we already have the full list loaded, just change page virtual offset in memory
    if (novelFullDetails && novelFullDetails.chapters && novelFullDetails.chapters.length > 0) {
      setNovelFullPage(page);
      return;
    }

    setLoadingNovelFull(true);
    setSelectedChapters([]);
    try {
      const { searchNovelFull, fetchNovelFullDetails, fetchNovelFullAllChapters } = require('@/utils/scraper');
      let novelPath = null;
      novelPath = await searchNovelFull(mangaDetails.title);

      if (!novelPath) {
        onShowToast('Nenhum resultado encontrado no novelfull.com.', 'error');
        setReadingSource('novelbuddy.com');
        setLoadingNovelFull(false);
        return;
      }

      console.log(`[DEBUG] loadNovelFullDetails: fetching details and AJAX chapters for path: ${novelPath}`);
      const [meta, allCh] = await Promise.all([
        fetchNovelFullDetails(novelPath, 1),
        fetchNovelFullAllChapters(novelPath),
      ]);

      const finalChapters = allCh.chapters && allCh.chapters.length > 0 ? allCh.chapters : meta.chapters;
      const finalUrls = allCh.chapters && allCh.chapters.length > 0 ? allCh.chapterUrls : meta.chapterUrls;

      const mergedDetails = {
        ...meta,
        chapters: finalChapters,
        chapterUrls: finalUrls,
        totalPages: Math.ceil(finalChapters.length / 50),
      };

      setNovelFullDetails(mergedDetails);
      setNovelFullPage(page);
    } catch (e: any) {
      console.error('[DEBUG] loadNovelFullDetails error:', e);
      onShowToast('Erro ao carregar capítulos do novelfull.com.', 'error');
      setReadingSource('novelbuddy.com');
    } finally {
      setLoadingNovelFull(false);
    }
  };

  const loadMangaDexDetails = async (page: number = 1) => {
    if (!mangaDetails) return;

    // Virtual page navigation in memory
    if (mangaDexDetails && mangaDexDetails.chapters && mangaDexDetails.chapters.length > 0) {
      setMangaDexPage(page);
      return;
    }

    setLoadingMangaDex(true);
    setSelectedChapters([]);
    try {
      const { searchMangaDex, fetchMangaDexChapters } = require('@/utils/scraper');
      console.log(`[DEBUG] loadMangaDexDetails: searching MangaDex for: ${mangaDetails.title}`);
      const meta = await searchMangaDex(mangaDetails.title);

      if (!meta) {
        onShowToast('Nenhum mangá correspondente encontrado no MangaDex.', 'error');
        setReadingSource('novelbuddy.com');
        setLoadingMangaDex(false);
        return;
      }

      console.log(`[DEBUG] loadMangaDexDetails: fetching chapters for MangaDex ID: ${meta.id}`);
      const allCh = await fetchMangaDexChapters(meta.id);

      const mergedDetails = {
        ...meta,
        chapters: allCh.chapters,
        chapterUrls: allCh.chapterUrls,
        totalPages: Math.ceil(allCh.chapters.length / 50),
      };

      setMangaDexDetails(mergedDetails);
      setMangaDexPage(page);
    } catch (e: any) {
      console.error('[DEBUG] loadMangaDexDetails error:', e);
      onShowToast('Erro ao carregar capítulos do MangaDex.', 'error');
      setReadingSource('novelbuddy.com');
    } finally {
      setLoadingMangaDex(false);
    }
  };

  // Set of numeric chapter numbers that are already downloaded locally
  const [downloadedNums, setDownloadedNums] = useState<Set<number>>(new Set());

  // Scan the local folder to find which chapters are already downloaded
  useEffect(() => {
    const scan = async () => {
      if (!mangaDetails || Platform.OS === 'web') {
        setDownloadedNums(new Set());
        return;
      }
      const localEntry = localLibrary.find(
        (item) => item.mangaTitle.trim().toLowerCase() === mangaDetails.title.trim().toLowerCase()
      );
      if (!localEntry) {
        setDownloadedNums(new Set());
        return;
      }
      try {
        const contents = await FileSystem.readDirectoryAsync(localEntry.savePath);
        const nums = new Set<number>();
        contents.forEach(name => {
          // folder names are like "cap-10" or "cap-10.5"
          const match = name.match(/(\d+(?:\.\d+)?)/);
          if (match) nums.add(parseFloat(match[1]));
        });
        setDownloadedNums(nums);
      } catch {
        setDownloadedNums(new Set());
      }
    };
    scan();
  }, [mangaDetails, localLibrary]);

  // Returns true if an online chapter name (e.g. "Capítulo 10") is already downloaded locally
  const isDownloaded = (chapterName: string): boolean => {
    const match = chapterName.match(/(\d+(?:\.\d+)?)/);
    if (!match) return false;
    return downloadedNums.has(parseFloat(match[1]));
  };

  const toggleChapter = (chapter: string) => {
    if (isDownloaded(chapter)) return;
    setSelectedChapters((prev) =>
      prev.includes(chapter) ? prev.filter((c) => c !== chapter) : [...prev, chapter]
    );
  };

  const handleSelectAll = () => {
    if (!mangaDetails) return;
    const baseList = readingSource === 'novelfull.com'
      ? (novelFullDetails?.chapters || [])
      : readingSource === 'mangadex.org'
        ? (mangaDexDetails?.chapters || [])
        : mangaDetails.chapters;
    setSelectedChapters(baseList.filter(ch => !isDownloaded(ch)));
  };

  const handleSelectNone = () => {
    setSelectedChapters([]);
  };

  const applyRangeSelection = () => {
    if (!mangaDetails) return;
    const startNum = parseInt(rangeStart);
    const endNum = parseInt(rangeEnd);

    if (isNaN(startNum) || isNaN(endNum)) {
      onShowToast('Por favor, insira números válidos para o intervalo.', 'error');
      return;
    }

    const min = Math.min(startNum, endNum);
    const max = Math.max(startNum, endNum);

    const baseList = readingSource === 'novelfull.com'
      ? (novelFullDetails?.chapters || [])
      : readingSource === 'mangadex.org'
        ? (mangaDexDetails?.chapters || [])
        : mangaDetails.chapters;

    const matched = baseList.filter((ch) => {
      if (isDownloaded(ch)) return false;
      const match = ch.match(/\d+/);
      if (match) {
        const num = parseInt(match[0]);
        return num >= min && num <= max;
      }
      return false;
    });

    setSelectedChapters((prev) => {
      const next = new Set([...prev, ...matched]);
      return Array.from(next);
    });

    onShowToast(`${matched.length} capítulos selecionados pelo intervalo.`, 'success');
    setIsRangeActive(false);
    setRangeStart('');
    setRangeEnd('');
  };

  const handleStartDownload = () => {
    if (selectedChapters.length === 0) {
      onShowToast('Selecione pelo menos um capítulo para baixar.', 'error');
      return;
    }

    if (readingSource === 'novelfull.com' && novelFullDetails) {
      startDownload(
        selectedChapters,
        'Novel',
        {
          title: novelFullDetails.title,
          coverUrl: novelFullDetails.coverUrl,
          synopsis: novelFullDetails.synopsis || mangaDetails?.synopsis || '',
          chapterUrls: novelFullDetails.chapterUrls,
          source: 'novelfull.com',
        }
      );
    } else if (readingSource === 'mangadex.org' && mangaDexDetails) {
      startDownload(
        selectedChapters,
        'Manga',
        {
          title: mangaDexDetails.title,
          coverUrl: mangaDexDetails.coverUrl,
          synopsis: mangaDexDetails.synopsis || mangaDetails?.synopsis || '',
          chapterUrls: mangaDexDetails.chapterUrls,
          source: 'mangadex.org',
        }
      );
    } else {
      startDownload(selectedChapters, selectedType || undefined);
    }
    
    onClose();
    onShowToast('Download iniciado! Acompanhe na aba Downloads.', 'success');
    setSelectedChapters([]);
  };

  // Filter chapters by search input and language filter (if MangaDex)
  const baseChapters = readingSource === 'novelfull.com'
    ? (novelFullDetails?.chapters || [])
    : readingSource === 'mangadex.org'
      ? (mangaDexDetails?.chapters || mangaDetails?.chapters || [])
      : (mangaDetails?.chapters || []);

  const languageFilteredChapters = baseChapters.filter((ch) => {
    if (readingSource === 'mangadex.org' && langFilter !== 'ALL') {
      return ch.includes(`(${langFilter})`);
    }
    return true;
  });

  const filteredChapters = languageFilteredChapters.filter((ch) =>
    ch.toLowerCase().includes(searchChapter.toLowerCase())
  );

  const displayedChaptersFull = sortAscending
    ? [...filteredChapters].reverse()
    : filteredChapters;

  // Recalculate dynamic total pages based on current language-filtered count
  const mangaDexTotalPages = Math.ceil(filteredChapters.length / 50) || 1;
  const currentMangaDexPage = Math.min(mangaDexPage, mangaDexTotalPages);

  const displayedChapters = (readingSource === 'novelfull.com' || readingSource === 'mangadex.org')
    ? displayedChaptersFull.slice(
        ((readingSource === 'novelfull.com' ? novelFullPage : currentMangaDexPage) - 1) * 50,
        (readingSource === 'novelfull.com' ? novelFullPage : currentMangaDexPage) * 50
      )
    : displayedChaptersFull;

  return (
    <>
    <Modal
      visible={isOpen}
      animationType="slide"
      onRequestClose={onClose}>
      <ThemedView style={styles.modalOverlay}>
        {loadingDetails ? (
          <View style={styles.modalLoading}>
            <ActivityIndicator size="large" color={theme.accent} />
            <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
              Carregando detalhes do mangá...
            </ThemedText>
            <Pressable
              onPress={onClose}
              style={styles.cancelFetchBtn}>
              <ThemedText type="smallBold" themeColor="textSecondary">Cancelar</ThemedText>
            </Pressable>
          </View>
        ) : (
          mangaDetails && (
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <Pressable onPress={onClose} style={styles.modalBackBtn}>
                  <SymbolView name="chevron.left" size={18} tintColor={theme.text} />
                  <ThemedText type="smallBold" style={{ marginLeft: 4 }}>Voltar</ThemedText>
                </Pressable>
                <ThemedText type="smallBold" style={styles.modalHeaderTitle} numberOfLines={1}>
                  Detalhes do Mangá
                </ThemedText>
                <View style={{ width: 70 }} />
              </View>

              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                showsVerticalScrollIndicator={false}>
                
                {/* Summary Block */}
                <View style={styles.mangaMetaBlock}>
                  <Image
                    source={{ uri: mangaDetails.coverUrl }}
                    style={styles.detailCoverImage}
                    contentFit="cover"
                  />
                  <View style={styles.detailMetaInfo}>
                    <ThemedText type="default" style={styles.detailTitle}>
                      {mangaDetails.title}
                    </ThemedText>
                    <View style={styles.detailSourceRow}>
                      <SymbolView name="globe" size={12} tintColor={theme.textSecondary} />
                      <ThemedText type="small" themeColor="textSecondary" style={{ marginLeft: 4 }}>
                        {mangaDetails.source}
                      </ThemedText>
                    </View>

                    {lastReadChapter && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <SymbolView name="clock.fill" size={10} tintColor={theme.accent} />
                        <ThemedText type="smallBold" style={{ marginLeft: 4, color: theme.accent, fontSize: 10 }}>
                          Último lido: {lastReadChapter}
                        </ThemedText>
                      </View>
                    )}

                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {/* To Read (A Ler) Button */}
                      <Pressable
                        onPress={handleToggleToRead}
                        style={({ pressed }) => [
                          {
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: 4,
                            paddingHorizontal: 8,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: isToRead ? '#4CAF50' : theme.textSecondary,
                            backgroundColor: isToRead ? 'rgba(76, 175, 80, 0.08)' : 'transparent',
                            opacity: pressed ? 0.8 : 1,
                          }
                        ]}
                      >
                        <SymbolView
                          name={isToRead ? 'checkmark.circle.fill' : 'plus.circle'}
                          size={12}
                          tintColor={isToRead ? '#4CAF50' : theme.textSecondary}
                        />
                        <ThemedText
                          type="code"
                          style={{
                            fontSize: 10,
                            marginLeft: 4,
                            color: isToRead ? '#4CAF50' : theme.textSecondary,
                            fontWeight: 'bold',
                          }}
                        >
                          {isToRead ? 'A Ler (Na Lista)' : 'A Ler'}
                        </ThemedText>
                      </Pressable>

                      {/* Favorite Button */}
                      <Pressable
                        onPress={handleToggleFavorite}
                        style={({ pressed }) => [
                          {
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: 4,
                            paddingHorizontal: 8,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: isFavorite ? '#FFD700' : theme.textSecondary,
                            backgroundColor: isFavorite ? 'rgba(255, 215, 0, 0.08)' : 'transparent',
                            opacity: pressed ? 0.8 : 1,
                          }
                        ]}
                      >
                        <SymbolView
                          name={isFavorite ? 'star.fill' : 'star'}
                          size={12}
                          tintColor={isFavorite ? '#FFD700' : theme.textSecondary}
                        />
                        <ThemedText
                          type="code"
                          style={{
                            fontSize: 10,
                            marginLeft: 4,
                            color: isFavorite ? '#FFD700' : theme.textSecondary,
                            fontWeight: 'bold',
                          }}
                        >
                          {isFavorite ? 'Favoritado' : 'Favoritar'}
                        </ThemedText>
                      </Pressable>
                    </View>

                    {/* Custom Override and Source Selector Row */}
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 6, zIndex: 10 }}>
                      {readingSource !== 'novelbuddy.com' && readingSource !== 'novelfull.com' && !mangaDetails.source?.toLowerCase().includes('asura') && (
                        <View style={{ position: 'relative', zIndex: 15 }}>
                          <Pressable
                            onPress={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              backgroundColor: theme.backgroundSelected,
                              paddingVertical: 4,
                              paddingHorizontal: 8,
                              borderRadius: 6,
                              borderWidth: 0.5,
                              borderColor: theme.accent,
                              minWidth: 100,
                            }}>
                            <ThemedText type="code" style={{ fontSize: 11, color: theme.text }}>
                              {selectedType || 'Tipo: Auto'}
                            </ThemedText>
                            <SymbolView name="chevron.down" size={8} tintColor={theme.text} style={{ marginLeft: 6 }} />
                          </Pressable>

                          {isTypeDropdownOpen && (
                            <ThemedView
                              type="backgroundElement"
                              style={{
                                position: 'absolute',
                                top: 28,
                                left: 0,
                                right: 0,
                                borderRadius: 6,
                                borderWidth: 0.5,
                                borderColor: theme.backgroundSelected,
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.2,
                                shadowRadius: 3,
                                elevation: 4,
                                zIndex: 1000,
                                minWidth: 100,
                              }}>
                              {['', 'Manga', 'Manhwa', 'Manhua'].map((typeOption) => {
                                const isOptionSelected = selectedType === typeOption;
                                return (
                                  <Pressable
                                    key={typeOption || 'auto'}
                                    onPress={() => {
                                      setSelectedType(typeOption);
                                      setIsTypeDropdownOpen(false);
                                    }}
                                    style={{
                                      paddingVertical: 6,
                                      paddingHorizontal: 8,
                                      borderBottomWidth: typeOption === 'Novel' ? 0 : 0.5,
                                      borderBottomColor: theme.backgroundSelected,
                                      backgroundColor: isOptionSelected ? theme.backgroundSelected : undefined,
                                    }}>
                                    <ThemedText type="small" style={{ fontSize: 11, color: isOptionSelected ? theme.accent : theme.text }}>
                                      {typeOption || 'Auto (Padrão)'}
                                    </ThemedText>
                                  </Pressable>
                                );
                              })}
                            </ThemedView>
                          )}
                        </View>
                      )}

                      {mangaDetails.source === 'novelbuddy.com' && (
                        <View style={{ position: 'relative', zIndex: 20 }}>
                          <Pressable
                            onPress={() => setIsSourceDropdownOpen(!isSourceDropdownOpen)}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              backgroundColor: theme.backgroundSelected,
                              paddingVertical: 4,
                              paddingHorizontal: 8,
                              borderRadius: 6,
                              borderWidth: 0.5,
                              borderColor: theme.accent,
                              minWidth: 120,
                            }}>
                            <ThemedText type="code" style={{ fontSize: 11, color: theme.text, fontWeight: 'bold' }}>
                              Fonte: {readingSource}
                            </ThemedText>
                            <SymbolView name="chevron.down" size={8} tintColor={theme.text} style={{ marginLeft: 6 }} />
                          </Pressable>

                          {isSourceDropdownOpen && (
                            <ThemedView
                              type="backgroundElement"
                              style={{
                                position: 'absolute',
                                top: 28,
                                left: 0,
                                right: 0,
                                borderRadius: 6,
                                borderWidth: 0.5,
                                borderColor: theme.backgroundSelected,
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.2,
                                shadowRadius: 3,
                                elevation: 4,
                                zIndex: 1000,
                                minWidth: 120,
                              }}>
                              {['novelbuddy.com', 'novelfull.com'].map((src) => {
                                const isOptionSelected = readingSource === src;
                                return (
                                  <Pressable
                                    key={src}
                                    onPress={() => {
                                      setReadingSource(src as any);
                                      setIsSourceDropdownOpen(false);
                                      if (src === 'novelfull.com' && !novelFullDetails) {
                                        loadNovelFullDetails(1);
                                      }
                                    }}
                                    style={{
                                      paddingVertical: 6,
                                      paddingHorizontal: 8,
                                      borderBottomWidth: src === 'novelfull.com' ? 0 : 0.5,
                                      borderBottomColor: theme.backgroundSelected,
                                      backgroundColor: isOptionSelected ? theme.backgroundSelected : undefined,
                                    }}>
                                    <ThemedText type="small" style={{ fontSize: 11, color: isOptionSelected ? theme.accent : theme.text }}>
                                      {src}
                                    </ThemedText>
                                  </Pressable>
                                );
                              })}
                            </ThemedView>
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                </View>

                {lastReadChapter && localLibrary.find(l => l.mangaTitle.trim().toLowerCase() === mangaDetails.title.trim().toLowerCase()) && onOpenReader && (
                  <Pressable
                    onPress={() => {
                      const localEntry = localLibrary.find(l => l.mangaTitle.trim().toLowerCase() === mangaDetails.title.trim().toLowerCase());
                      if (localEntry) {
                        onOpenReader(localEntry, lastReadChapter);
                        onClose();
                      }
                    }}
                    style={({ pressed }) => [
                      styles.downloadBtn,
                      {
                        backgroundColor: theme.accent,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <SymbolView name="play.fill" size={14} tintColor="#000000" />
                    <ThemedText type="smallBold" style={[styles.downloadBtnText, { color: '#000000' }]}>
                      Continuar Lendo
                    </ThemedText>
                    <ThemedText type="code" style={{ color: 'rgba(0,0,0,0.6)', fontSize: 11 }}>
                      {lastReadChapter}
                    </ThemedText>
                  </Pressable>
                )}

                {/* Synopsis */}
                <ThemedView type="backgroundElement" style={styles.synopsisCard}>
                  <ThemedText type="smallBold" style={{ marginBottom: 4 }}>Sinopse</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.synopsisText}>
                    {mangaDetails.synopsis}
                  </ThemedText>
                </ThemedView>

                <View style={sharedStyles.divider} />

                {/* Selection Header */}
                <View style={styles.selectionControls}>
                  <ThemedText type="smallBold">
                    Capítulos ({selectedChapters.length}/{baseChapters.length})
                  </ThemedText>
                  <View style={styles.bulkButtons}>
                    <Pressable onPress={handleSelectAll} style={sharedStyles.actionPill}>
                      <ThemedText type="code" style={sharedStyles.actionPillText}>Todos</ThemedText>
                    </Pressable>
                    <Pressable onPress={handleSelectNone} style={sharedStyles.actionPill}>
                      <ThemedText type="code" style={sharedStyles.actionPillText}>Nenhum</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => setIsRangeActive(!isRangeActive)}
                      style={[sharedStyles.actionPill, isRangeActive && sharedStyles.actionPillActive]}>
                      <ThemedText type="code" style={[sharedStyles.actionPillText, isRangeActive && sharedStyles.actionPillTextActive]}>
                        Intervalo
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>

                {/* Range selection panel */}
                {isRangeActive && (
                  <View style={[styles.rangeBox, { backgroundColor: theme.backgroundElement }]}>
                    <ThemedText type="small" style={styles.rangeText}>
                      Selecionar do capítulo número:
                    </ThemedText>
                    <View style={styles.rangeInputs}>
                      <TextInput
                        value={rangeStart}
                        onChangeText={setRangeStart}
                        keyboardType="numeric"
                        placeholder="Ex: 1"
                        placeholderTextColor={theme.textSecondary}
                        style={[styles.rangeInput, { color: theme.text, backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}
                      />
                      <ThemedText type="small" style={{ marginHorizontal: Spacing.two }}>até</ThemedText>
                      <TextInput
                        value={rangeEnd}
                        onChangeText={setRangeEnd}
                        keyboardType="numeric"
                        placeholder="Ex: 20"
                        placeholderTextColor={theme.textSecondary}
                        style={[styles.rangeInput, { color: theme.text, backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}
                      />
                      <Pressable onPress={applyRangeSelection} style={[styles.rangeApplyBtn, { backgroundColor: theme.accent }]}>
                        <ThemedText type="smallBold" style={{ color: '#fff' }}>Aplicar</ThemedText>
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* Search and Sort row */}
                <View style={styles.searchSortRow}>
                  <View style={[styles.modalSearchWrapper, { backgroundColor: theme.backgroundElement }]}>
                    <SymbolView name="magnifyingglass" size={12} tintColor={theme.textSecondary} />
                    <TextInput
                      value={searchChapter}
                      onChangeText={setSearchChapter}
                      placeholder="Buscar capítulo..."
                      placeholderTextColor={theme.textSecondary}
                      style={[styles.modalSearchInput, { color: theme.text }]}
                    />
                  </View>
                  <Pressable
                    onPress={() => setSortAscending(!sortAscending)}
                    style={({ pressed }) => [
                      styles.sortButton,
                      {
                        backgroundColor: theme.backgroundSelected,
                        borderColor: theme.backgroundSelected,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}>
                    <SymbolView
                      name={sortAscending ? 'arrow.up.arrow.down.circle.fill' : 'arrow.up.arrow.down.circle'}
                      size={14}
                      tintColor={sortAscending ? theme.accent : theme.text}
                    />
                    <ThemedText type="smallBold" style={[styles.sortButtonText, { color: theme.text }]}>
                      {sortAscending ? 'Crescente' : 'Decrescente'}
                    </ThemedText>
                  </Pressable>
                </View>

                {/* Language Filter (Only for MangaDex) */}
                {readingSource === 'mangadex.org' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12, gap: 8 }}>
                    <ThemedText type="small" themeColor="textSecondary" style={{ marginRight: 4 }}>Idioma:</ThemedText>
                    {[
                      { key: 'ALL', label: 'Todos' },
                      { key: 'PT-BR', label: 'Português' },
                      { key: 'EN', label: 'Inglês' }
                    ].map((opt) => {
                      const isSel = langFilter === opt.key;
                      return (
                        <Pressable
                          key={opt.key}
                          onPress={() => {
                            setLangFilter(opt.key as any);
                            setMangaDexPage(1); // reset virtual page
                            setSelectedChapters([]); // clear active selections
                          }}
                          style={({ pressed }) => ({
                            paddingVertical: 4,
                            paddingHorizontal: 10,
                            borderRadius: 12,
                            backgroundColor: isSel ? theme.accent : theme.backgroundSelected,
                            opacity: pressed ? 0.8 : 1,
                            borderWidth: 0.5,
                            borderColor: isSel ? theme.accent : 'transparent',
                          })}
                        >
                          <ThemedText
                            type="smallBold"
                            style={{
                              fontSize: 11,
                              color: isSel ? '#fff' : theme.text,
                            }}
                          >
                            {opt.label}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {/* Chapters List */}
                {loadingNovelFull || loadingMangaDex ? (
                  <View style={{ height: 200, justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator size="large" color={theme.accent} />
                    <ThemedText type="small" themeColor="textSecondary">
                      {loadingMangaDex ? 'Buscando capítulos no mangadex.org...' : 'Buscando capítulos no novelfull.com...'}
                    </ThemedText>
                  </View>
                ) : (
                  <>
                    <ScrollView
                      style={styles.chaptersListWrapper}
                      contentContainerStyle={styles.chaptersListContent}
                      nestedScrollEnabled={true}
                      showsVerticalScrollIndicator={true}>
                      {displayedChapters.map((item, idx) => {
                        const isChecked = selectedChapters.includes(item);
                        const alreadyDownloaded = isDownloaded(item);
                        const hasUrl = readingSource === 'novelfull.com'
                          ? !!novelFullDetails?.chapterUrls?.[item]
                          : readingSource === 'mangadex.org'
                            ? !!(mangaDexDetails?.chapterUrls?.[item] || mangaDetails?.chapterUrls?.[item])
                            : !!mangaDetails?.chapterUrls?.[item];

                        return (
                          <Pressable
                            key={`${item}-${idx}`}
                            onPress={() => toggleChapter(item)}
                            disabled={alreadyDownloaded}
                            style={[
                              styles.chapterRow,
                              {
                                backgroundColor: alreadyDownloaded
                                  ? 'rgba(76, 175, 80, 0.08)'
                                  : isChecked ? theme.backgroundSelected : theme.background,
                                borderColor: alreadyDownloaded
                                  ? 'rgba(76, 175, 80, 0.3)'
                                  : isChecked ? theme.accent : theme.backgroundSelected,
                              },
                            ]}>
                            <ThemedText
                              type="small"
                              style={{
                                color: alreadyDownloaded ? '#4CAF50' : isChecked ? theme.text : theme.textSecondary,
                                flex: 1,
                              }}>
                              {item}
                            </ThemedText>

                            {/* Ler Online button */}
                            {hasUrl && (
                              <Pressable
                                onPress={(e) => { e.stopPropagation(); openOnlineReader(item); }}
                                style={{
                                  marginRight: 6,
                                  padding: 4,
                                  borderRadius: 6,
                                  backgroundColor: 'rgba(79, 195, 247, 0.12)',
                                }}
                              >
                                <SymbolView name="eye.fill" size={13} tintColor="#4fc3f7" />
                              </Pressable>
                            )}

                            {alreadyDownloaded ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <ThemedText type="code" style={{ fontSize: 9, color: '#4CAF50' }}>
                                  Baixado
                                </ThemedText>
                                <SymbolView
                                  name="checkmark.circle.fill"
                                  size={16}
                                  tintColor="#4CAF50"
                                />
                              </View>
                            ) : (
                              <SymbolView
                                name={isChecked ? 'checkmark.square.fill' : 'square'}
                                size={16}
                                tintColor={isChecked ? theme.accent : theme.textSecondary}
                              />
                            )}
                          </Pressable>
                        );
                      })}
                      {displayedChapters.length === 0 && (
                        <View style={styles.emptyChapters}>
                          <ThemedText type="small" themeColor="textSecondary">
                            Nenhum capítulo encontrado.
                          </ThemedText>
                        </View>
                      )}
                    </ScrollView>

                    {/* Source Pagination (NovelFull & MangaDex) */}
                    {((readingSource === 'novelfull.com' && novelFullDetails && novelFullDetails.totalPages > 1) ||
                      (readingSource === 'mangadex.org' && mangaDexTotalPages > 1)) && (
                      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginVertical: 12, gap: 16 }}>
                        <Pressable
                          disabled={(readingSource === 'novelfull.com' ? novelFullPage === 1 : currentMangaDexPage === 1) || loadingNovelFull || loadingMangaDex}
                          onPress={() => readingSource === 'novelfull.com' ? loadNovelFullDetails(novelFullPage - 1) : loadMangaDexDetails(currentMangaDexPage - 1)}
                          style={({ pressed }) => ({
                            paddingVertical: 6,
                            paddingHorizontal: 12,
                            borderRadius: 6,
                            backgroundColor: theme.backgroundSelected,
                            opacity: ((readingSource === 'novelfull.com' ? novelFullPage === 1 : currentMangaDexPage === 1) || loadingNovelFull || loadingMangaDex) ? 0.4 : pressed ? 0.7 : 1,
                          })}
                        >
                          <ThemedText type="smallBold">{"< Anterior"}</ThemedText>
                        </Pressable>
                        <ThemedText type="smallBold">
                          Pág. {readingSource === 'novelfull.com' ? novelFullPage : currentMangaDexPage} / {readingSource === 'novelfull.com' ? novelFullDetails.totalPages : mangaDexTotalPages}
                        </ThemedText>
                        <Pressable
                          disabled={(readingSource === 'novelfull.com' ? novelFullPage === novelFullDetails.totalPages : currentMangaDexPage === mangaDexTotalPages) || loadingNovelFull || loadingMangaDex}
                          onPress={() => readingSource === 'novelfull.com' ? loadNovelFullDetails(novelFullPage + 1) : loadMangaDexDetails(currentMangaDexPage + 1)}
                          style={({ pressed }) => ({
                            paddingVertical: 6,
                            paddingHorizontal: 12,
                            borderRadius: 6,
                            backgroundColor: theme.backgroundSelected,
                            opacity: ((readingSource === 'novelfull.com' ? novelFullPage === novelFullDetails.totalPages : currentMangaDexPage === mangaDexTotalPages) || loadingNovelFull || loadingMangaDex) ? 0.4 : pressed ? 0.7 : 1,
                          })}
                        >
                          <ThemedText type="smallBold">{"Próxima >"}</ThemedText>
                        </Pressable>
                      </View>
                    )}
                  </>
                )}

                {/* Download Action Button */}
                {selectedChapters.length > 0 && (
                  <Pressable
                    onPress={handleStartDownload}
                    style={({ pressed }) => [
                      styles.downloadBtn,
                      { backgroundColor: theme.accent, opacity: pressed ? 0.9 : 1 },
                    ]}>
                    <SymbolView name="arrow.down.circle.fill" size={18} tintColor="#fff" />
                    <ThemedText type="default" style={styles.downloadBtnText}>
                      Baixar {selectedChapters.length} {selectedChapters.length === 1 ? 'Capítulo' : 'Capítulos'}
                    </ThemedText>
                  </Pressable>
                )}
              </ScrollView>
            </SafeAreaView>
          )
        )}
      </ThemedView>
    </Modal>

    {mangaDetails && (
      <OnlineReaderModal
        isOpen={isOnlineReaderOpen}
        onClose={() => {
          setIsOnlineReaderOpen(false);
          setOnlineReaderChapter(null);
        }}
        mangaTitle={
          readingSource === 'novelfull.com' && novelFullDetails
            ? novelFullDetails.title
            : readingSource === 'mangadex.org' && mangaDexDetails
              ? mangaDexDetails.title
              : mangaDetails.title
        }
        mangaType={
          readingSource === 'novelfull.com'
            ? 'Novel'
            : readingSource === 'mangadex.org'
              ? 'Manga'
              : (selectedType || (mangaDetails as any).mangaType)
        }
        chapters={
          readingSource === 'novelfull.com' && novelFullDetails
            ? novelFullDetails.chapters
            : readingSource === 'mangadex.org' && mangaDexDetails
              ? mangaDexDetails.chapters
              : mangaDetails.chapters
        }
        chapterUrls={
          readingSource === 'novelfull.com' && novelFullDetails
            ? (novelFullDetails.chapterUrls || {})
            : readingSource === 'mangadex.org' && mangaDexDetails
              ? (mangaDexDetails.chapterUrls || {})
              : (mangaDetails.chapterUrls || {})
        }
        initialChapter={onlineReaderChapter}
      />
    )}
  </>
  );
}
