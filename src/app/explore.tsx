import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  TextInput,
  View,
  ActivityIndicator,
  Platform,
  Modal,
  RefreshControl,
  Animated,
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { SymbolView } from '@/components/ui/symbol-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useManga, HistoryItem } from '@/context/manga-context';
import { useTheme } from '@/hooks/use-theme';
import { useFocusEffect } from 'expo-router';
import { toggleFavoriteLocal, getActiveFavoritesLocal, getToReadListLocal, Favorite, ToReadItem } from '@/utils/database';
import * as FileSystem from 'expo-file-system/legacy';

// Import separated components and styles
import MangaReaderModal from '@/components/manga-reader-modal';
import LocalMangaDetailsModal from '@/components/local-manga-details-modal';
import MangaDetailsModal from '@/components/manga-details-modal';
import SyncSettingsModal from '@/components/sync-settings-modal';
import { createSharedStyles } from '@/styles/shared.styles';
import { createLibraryStyles } from '@/styles/library.styles';

// Bug 5: Resolve the best available cover URI for a manga title.
// Checks the permanent MangaCovers folder first (covers preserved on deletion),
// then falls back to the provided remote/local URL.
async function resolveLocalCover(title: string, remoteCoverUrl: string | null | undefined): Promise<string | undefined> {
  if (Platform.OS === 'web') return remoteCoverUrl || undefined;
  const sanitized = title.replace(/[\\/:*?"<>|]/g, '_').trim();
  const coversDir = `${FileSystem.documentDirectory}MangaCovers`;
  const extensions = ['jpg', 'jpeg', 'png', 'webp'];
  for (const ext of extensions) {
    try {
      const path = `${coversDir}/${sanitized}.${ext}`;
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) return path;
    } catch { /* ignore */ }
  }
  return remoteCoverUrl || undefined;
}

// Placeholder shown while cover images are loading
const COVER_PLACEHOLDER = require('../../assets/images/icon-manga-easy.png');

export default function LibraryScreen() {
  const theme = useTheme();
  const sharedStyles = createSharedStyles(theme);
  const styles = createLibraryStyles(theme);

  const {
    localLibrary,
    loadingLibrary,
    scanLibrary,
    deleteManga,
    updateLastReadChapter,
    fetchMangaDetails,
    setActiveSource,
    activeSource,
  } = useManga();

  // Reader Modal State
  const [isReaderOpen, setIsReaderOpen] = useState(false);
  const [selectedManga, setSelectedManga] = useState<HistoryItem | null>(null);
  const [initialChapter, setInitialChapter] = useState<string | null>(null);

  // Local Details Modal State
  const [isLocalDetailsOpen, setIsLocalDetailsOpen] = useState(false);

  // Online Details Modal State (for cloud items)
  const [isOnlineDetailsOpen, setIsOnlineDetailsOpen] = useState(false);

  const handleOpenOnlineDetails = useCallback((mangaUrl: string, source: string) => {
    if (source && source !== activeSource) {
      setActiveSource(source);
    }
    fetchMangaDetails(mangaUrl);
    setIsOnlineDetailsOpen(true);
  }, [activeSource, fetchMangaDetails, setActiveSource]);

  // Custom Delete Modal State
  const [mangaToDelete, setMangaToDelete] = useState<HistoryItem | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);

  // Sync Modal State
  const [isSyncOpen, setIsSyncOpen] = useState(false);

  // Status Toast State
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' }>({
    text: '',
    type: 'success',
  });

  const showStatus = (text: string, type: 'success' | 'error') => {
    setStatusMessage({ text, type });
    setTimeout(() => {
      setStatusMessage({ text: '', type: 'success' });
    }, 3000);
  };

  // Active Tab state
  const [activeTab, setActiveTab] = useState<'downloads' | 'favorites' | 'to_read'>('downloads');

  // Library search
  const [librarySearch, setLibrarySearch] = useState('');

  // Manga/Novel Type Filter
  const [typeFilter, setTypeFilter] = useState<'all' | 'manga' | 'novel'>('all');

  // Custom library reordering state
  const [customOrder, setCustomOrder] = useState<string[]>([]);

  // Drag and drop variables
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const dragXY = useRef(new Animated.ValueXY()).current;
  const [cardWidth, setCardWidth] = useState(110);
  const [cardHeight, setCardHeight] = useState(165);

  const draggedIndexRef = useRef<number | null>(null);
  draggedIndexRef.current = draggedIndex;

  const filteredItemsRef = useRef<any[]>([]);

  // Load custom order from storage
  const loadCustomOrder = useCallback(async () => {
    try {
      if (Platform.OS === 'web') {
        const saved = localStorage.getItem('library_custom_order');
        if (saved) setCustomOrder(JSON.parse(saved));
      } else {
        const orderFilePath = `${FileSystem.documentDirectory}library_custom_order.json`;
        const fileInfo = await FileSystem.getInfoAsync(orderFilePath);
        if (fileInfo.exists) {
          const content = await FileSystem.readAsStringAsync(orderFilePath);
          setCustomOrder(JSON.parse(content));
        }
      }
    } catch (err) {
      console.warn('Failed to load custom order:', err);
    }
  }, []);

  // Save custom order to storage
  const saveCustomOrder = async (newOrder: string[]) => {
    try {
      setCustomOrder(newOrder);
      if (Platform.OS === 'web') {
        localStorage.setItem('library_custom_order', JSON.stringify(newOrder));
      } else {
        const orderFilePath = `${FileSystem.documentDirectory}library_custom_order.json`;
        await FileSystem.writeAsStringAsync(orderFilePath, JSON.stringify(newOrder));
      }
    } catch (err) {
      console.warn('Failed to save custom order:', err);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: () => draggedIndexRef.current !== null,
      onPanResponderMove: (e, gestureState) => {
        if (draggedIndexRef.current !== null) {
          dragXY.setValue({ x: gestureState.dx, y: gestureState.dy });
        }
      },
      onPanResponderRelease: (e, gestureState) => {
        const dIdx = draggedIndexRef.current;
        if (dIdx === null) return;

        const items = filteredItemsRef.current;
        const colsMoved = Math.round(gestureState.dx / cardWidth);
        const rowsMoved = Math.round(gestureState.dy / cardHeight);
        const targetIndex = Math.max(0, Math.min(items.length - 1, dIdx + rowsMoved * 3 + colsMoved));

        if (targetIndex !== dIdx) {
          const newItems = [...items];
          const [draggedItem] = newItems.splice(dIdx, 1);
          newItems.splice(targetIndex, 0, draggedItem);

          const newOrder = newItems.map(item => item.title.toLowerCase());
          saveCustomOrder(newOrder);
        }

        setDraggedIndex(null);
        dragXY.setValue({ x: 0, y: 0 });
      },
      onPanResponderTerminate: () => {
        setDraggedIndex(null);
        dragXY.setValue({ x: 0, y: 0 });
      }
    })
  ).current;

  // Lists state
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [toReadList, setToReadList] = useState<ToReadItem[]>([]);
  const [favoriteTitles, setFavoriteTitles] = useState<Set<string>>(new Set());

  // Bug 4 & 5: resolved cover URI map (title.lower -> local URI or remote URL)
  const [resolvedCovers, setResolvedCovers] = useState<Record<string, string | undefined>>({});

  const loadFavoritesAndToRead = useCallback(async () => {
    try {
      const activeFavs = await getActiveFavoritesLocal();
      setFavorites(activeFavs);
      setFavoriteTitles(new Set(activeFavs.map(f => f.title.toLowerCase())));
      
      const activeToRead = await getToReadListLocal();
      setToReadList(activeToRead);
    } catch (err) {
      console.error('Erro ao buscar favoritos/a ler na biblioteca:', err);
    }
  }, []);

  // Bug 4 & 5: resolve local cover paths whenever lists or library change
  useEffect(() => {
    const allItems = [
      ...favorites.map(f => ({ title: f.title, url: f.cover_url })),
      ...toReadList.map(t => ({ title: t.title, url: t.cover_url })),
    ];
    if (allItems.length === 0) return;

    let cancelled = false;
    const resolve = async () => {
      const map: Record<string, string | undefined> = {};
      await Promise.all(
        allItems.map(async ({ title, url }) => {
          const key = title.toLowerCase();
          map[key] = await resolveLocalCover(title, url);
        })
      );
      if (!cancelled) setResolvedCovers(map);
    };
    resolve();
    return () => { cancelled = true; };
  }, [favorites, toReadList]);

  useFocusEffect(
    useCallback(() => {
      scanLibrary();
      loadFavoritesAndToRead();
      loadCustomOrder();
    }, [scanLibrary, loadFavoritesAndToRead, loadCustomOrder])
  );

  const handleToggleFavorite = async (title: string, coverUrl: string | null) => {
    try {
      await toggleFavoriteLocal(title, coverUrl);
      await loadFavoritesAndToRead();
    } catch (err) {
      console.error('Erro ao favoritar/desfavoritar:', err);
    }
  };

  const openLocalDetails = (item: HistoryItem) => {
    setSelectedManga(item);
    setIsLocalDetailsOpen(true);
  };

  const handleOpenReaderFromDetails = (mangaItem: HistoryItem, chapterFolder: string) => {
    // Persist last read chapter
    updateLastReadChapter(mangaItem.savePath, chapterFolder);
    setSelectedManga(mangaItem);
    setInitialChapter(chapterFolder);
    setIsReaderOpen(true);
  };

  const confirmDelete = (item: HistoryItem) => {
    setMangaToDelete(item);
    setShowDeleteConfirm(true);
  };

  const handleExecuteDelete = async () => {
    if (!mangaToDelete) return;
    setShowDeleteConfirm(false);
    
    try {
      await deleteManga(mangaToDelete.mangaTitle, mangaToDelete.savePath);
      setTimeout(() => {
        setShowDeleteSuccess(true);
        setMangaToDelete(null);
      }, 300);
    } catch (err) {
      console.error(err);
    }
  };

  // Get items list for current active tab
  const getDisplayItems = () => {
    let baseList = [];
    if (activeTab === 'downloads') {
      baseList = localLibrary.map(item => ({
        id: item.id,
        title: item.mangaTitle,
        coverUrl: item.coverUrl,
        savePath: item.savePath,
        isDownloaded: true,
        originalItem: item
      }));
    } else if (activeTab === 'favorites') {
      baseList = favorites.map(item => {
        const matchingLocal = localLibrary.find(l => l.mangaTitle.toLowerCase() === item.title.toLowerCase());
        return {
          id: item.id,
          title: item.title,
          coverUrl: item.cover_url,
          savePath: matchingLocal?.savePath || '',
          isDownloaded: !!matchingLocal,
          originalItem: { ...matchingLocal, ...item }
        };
      });
    } else {
      baseList = toReadList.map(item => {
        const matchingLocal = localLibrary.find(l => l.mangaTitle.toLowerCase() === item.title.toLowerCase());
        return {
          id: item.id,
          title: item.title,
          coverUrl: item.cover_url,
          savePath: matchingLocal?.savePath || '',
          isDownloaded: !!matchingLocal,
          originalItem: { ...matchingLocal, ...item }
        };
      });
    }

    const getCustomOrderIndex = (title: string) => {
      const idx = customOrder.indexOf(title.toLowerCase());
      return idx === -1 ? 999999 : idx;
    };

    // Sort: favorites first, then by custom order index
    return baseList.sort((a, b) => {
      const isAFav = favoriteTitles.has(a.title.toLowerCase());
      const isBFav = favoriteTitles.has(b.title.toLowerCase());
      if (isAFav && !isBFav) return -1;
      if (!isAFav && isBFav) return 1;

      return getCustomOrderIndex(a.title) - getCustomOrderIndex(b.title);
    });
  };

  const displayItems = getDisplayItems();

  const isItemNovel = (item: any) => {
    const orig = item.originalItem || {};
    return orig.mangaType === 'Novel' ||
           orig.source === 'novelbuddy.com' ||
           orig.source === 'novelfull.com' ||
           (orig.manga_url && (orig.manga_url.includes('novelbuddy') || orig.manga_url.includes('novelfull')));
  };

  const filteredItems = displayItems.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(librarySearch.toLowerCase());
    if (!matchesSearch) return false;

    if (typeFilter === 'manga') {
      return !isItemNovel(item);
    } else if (typeFilter === 'novel') {
      return isItemNovel(item);
    }
    return true;
  });

  filteredItemsRef.current = filteredItems;

  // Helper: best cover URI for a display item
  const getCoverUri = (item: { title: string; coverUrl: string | null | undefined; isDownloaded: boolean; originalItem: any }) => {
    // For downloaded items the coverUrl is already a local file URI
    if (item.isDownloaded && item.coverUrl && !item.coverUrl.startsWith('http')) {
      return item.coverUrl;
    }
    // For non-downloaded items: prefer preserved local cover, then remote URL
    const key = item.title.toLowerCase();
    return resolvedCovers[key] || item.coverUrl || undefined;
  };

  return (
    <ThemedView style={sharedStyles.container}>
      <SafeAreaView style={sharedStyles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={draggedIndex === null}
          refreshControl={
            <RefreshControl
              refreshing={loadingLibrary}
              onRefresh={scanLibrary}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          }>
          
          {/* Header */}
          <ThemedView style={[styles.header, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
            <View style={{ flex: 1 }}>
              <ThemedText type="subtitle" style={styles.title}>
                Biblioteca
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Gerencie seus downloads concluídos e leia localmente offline
              </ThemedText>
            </View>
            <Pressable
              onPress={() => setIsSyncOpen(true)}
              style={({ pressed }) => [
                {
                  padding: 8,
                  borderRadius: 20,
                  backgroundColor: theme.backgroundElement,
                  borderWidth: 0.5,
                  borderColor: theme.backgroundSelected,
                  opacity: pressed ? 0.8 : 1,
                  marginLeft: Spacing.two,
                }
              ]}
            >
              <SymbolView name="arrow.triangle.2.circlepath" size={16} tintColor={theme.accent} />
            </Pressable>
          </ThemedView>

          {/* Segment Selector Tabs */}
          <View style={{
            flexDirection: 'row',
            backgroundColor: theme.backgroundElement,
            borderRadius: 8,
            padding: 4,
            marginHorizontal: Spacing.two,
            marginBottom: Spacing.three,
            borderWidth: 0.5,
            borderColor: theme.backgroundSelected,
          }}>
            {[
              { id: 'downloads', label: 'Baixados', icon: 'books.vertical.fill' },
              { id: 'favorites', label: 'Favoritos', icon: 'star.fill' },
              { id: 'to_read', label: 'A Ler', icon: 'bookmark.fill' }
            ].map((tab) => {
              const isSelected = activeTab === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => {
                    setActiveTab(tab.id as any);
                    setLibrarySearch('');
                  }}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingVertical: 8,
                      borderRadius: 6,
                      backgroundColor: isSelected ? theme.backgroundSelected : 'transparent',
                      gap: 6,
                      opacity: pressed ? 0.8 : 1,
                    }
                  ]}
                >
                  <ThemedText
                    type="smallBold"
                    style={{
                      color: isSelected ? theme.text : theme.textSecondary,
                      fontSize: 12
                    }}
                  >
                    {tab.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {/* List Content */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <ThemedText type="smallBold" style={styles.sectionTitle}>
                {
                  activeTab === 'downloads' ? `Mangás Baixados (${localLibrary.length})` :
                  activeTab === 'favorites' ? `Favoritos (${favorites.length})` :
                  `Lista A Ler (${toReadList.length})`
                }
              </ThemedText>
            </View>

            {activeTab === 'downloads' && loadingLibrary && localLibrary.length === 0 ? (
              <View style={{ padding: Spacing.four, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={theme.accent} />
                <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
                  Escaneando armazenamento local...
                </ThemedText>
              </View>
            ) : (
              <>
                {/* Search bar */}
                {displayItems.length > 0 && (
                  <View style={[styles.searchBarRow, { backgroundColor: theme.backgroundElement }]}>
                    <TextInput
                      value={librarySearch}
                      onChangeText={setLibrarySearch}
                      placeholder={
                        activeTab === 'downloads' ? "Buscar nos baixados..." :
                        activeTab === 'favorites' ? "Buscar nos favoritos..." :
                        "Buscar na lista A Ler..."
                      }
                      placeholderTextColor={theme.textSecondary}
                      style={[styles.searchBarInput, { color: theme.text, paddingLeft: 8 }]}
                    />
                    {librarySearch.length > 0 && (
                      <Pressable onPress={() => setLibrarySearch('')}>
                        <SymbolView name="xmark" size={14} tintColor={theme.textSecondary} />
                      </Pressable>
                    )}
                  </View>
                )}

                {/* Manga/Novel Filter Tags */}
                {displayItems.length > 0 && (
                  <View style={{
                    flexDirection: 'row',
                    gap: 8,
                    marginBottom: 12,
                    paddingHorizontal: 4
                  }}>
                    {[
                      { id: 'all', label: 'Todos' },
                      { id: 'manga', label: 'Mangás' },
                      { id: 'novel', label: 'Novels' }
                    ].map((filt) => {
                      const isSelected = typeFilter === filt.id;
                      return (
                        <Pressable
                          key={filt.id}
                          onPress={() => setTypeFilter(filt.id as any)}
                          style={{
                            paddingVertical: 6,
                            paddingHorizontal: 16,
                            borderRadius: 16,
                            backgroundColor: isSelected ? theme.accent : theme.backgroundElement,
                            borderWidth: 0.5,
                            borderColor: isSelected ? theme.accent : 'rgba(255,255,255,0.05)'
                          }}
                        >
                          <ThemedText
                            type="smallBold"
                            style={{
                              color: isSelected ? '#000' : theme.textSecondary,
                              fontSize: 11
                            }}
                          >
                            {filt.label}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {filteredItems.length > 0 && (
                  <View {...panResponder.panHandlers} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {filteredItems.map((item, index) => {
                      const isFav = favoriteTitles.has(item.title.toLowerCase());
                      const isDragging = draggedIndex === index;
                      
                      const animatedStyle = isDragging ? {
                        transform: [
                          { translateX: dragXY.x },
                          { translateY: dragXY.y },
                          { scale: 1.05 }
                        ],
                        zIndex: 999,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.4,
                        shadowRadius: 5,
                        elevation: 5,
                      } : {};

                      return (
                        <Animated.View
                          key={item.id}
                          onLayout={index === 0 ? (e) => {
                            const { width, height } = e.nativeEvent.layout;
                            if (width > 0 && height > 0) {
                              setCardWidth(width);
                              setCardHeight(height);
                            }
                          } : undefined}
                          style={[{
                            width: '31%',
                            aspectRatio: 2/3,
                            borderRadius: 8,
                            position: 'relative',
                            marginBottom: 6,
                            backgroundColor: theme.backgroundElement,
                            borderWidth: 0.5,
                            borderColor: 'rgba(255, 255, 255, 0.05)',
                          }, animatedStyle]}
                        >
                          <Pressable
                            delayLongPress={300}
                            onLongPress={() => {
                              setDraggedIndex(index);
                              dragXY.setValue({ x: 0, y: 0 });
                            }}
                            onPress={() => {
                              if (item.isDownloaded) {
                                openLocalDetails(item.originalItem);
                              } else {
                                const mangaUrl = item.originalItem?.manga_url;
                                const source = item.originalItem?.source;
                                if (mangaUrl) {
                                  handleOpenOnlineDetails(mangaUrl, source || activeSource);
                                } else {
                                  showStatus('Este mangá não possui URL salva. Busque-o na aba "Baixar"!', 'error');
                                }
                              }
                            }}
                            style={({ pressed }) => [
                              {
                                width: '100%',
                                height: '100%',
                                borderRadius: 8,
                                overflow: 'hidden',
                                opacity: pressed ? 0.9 : 1,
                              }
                            ]}>
                            <Image
                              source={{ uri: getCoverUri(item) }}
                              placeholder={COVER_PLACEHOLDER}
                              placeholderContentFit="contain"
                              style={{ width: '100%', height: '100%', opacity: item.isDownloaded ? 1 : 0.7 }}
                              contentFit="cover"
                              cachePolicy="memory-disk"
                              recyclingKey={item.id}
                            />
                            
                            {/* Star overlay button */}
                            <Pressable
                              onPress={(e) => {
                                e.stopPropagation();
                                handleToggleFavorite(item.title, item.coverUrl);
                              }}
                              style={{
                                position: 'absolute',
                                top: 6,
                                right: 6,
                                backgroundColor: 'rgba(0,0,0,0.6)',
                                borderRadius: 12,
                                padding: 4,
                                zIndex: 10,
                              }}>
                              <SymbolView
                                key={isFav ? 'fav-yes' : 'fav-no'}
                                name={isFav ? 'star.fill' : 'star'}
                                size={14}
                                tintColor={isFav ? '#FFD700' : '#FFF'}
                              />
                            </Pressable>
  
                            {/* Cloud/Online only indicator */}
                            {!item.isDownloaded && (
                              <View style={{
                                position: 'absolute',
                                top: 6,
                                left: 6,
                                backgroundColor: 'rgba(0,0,0,0.6)',
                                borderRadius: 12,
                                padding: 4,
                                zIndex: 10,
                              }}>
                                <SymbolView
                                  name="cloud"
                                  size={12}
                                  tintColor="#ddd"
                                />
                              </View>
                            )}
                            
                            {/* Title overlay at the bottom */}
                            <View style={{
                              position: 'absolute',
                              bottom: 0,
                              left: 0,
                              right: 0,
                              backgroundColor: 'rgba(0,0,0,0.7)',
                              padding: 4,
                            }}>
                              <ThemedText type="code" numberOfLines={1} style={{ fontSize: 9, color: '#FFF', textAlign: 'center' }}>
                                {item.title}
                              </ThemedText>
                            </View>
                          </Pressable>
                        </Animated.View>
                      );
                    })}
                  </View>
                )}

                {/* No results from search */}
                {displayItems.length > 0 && filteredItems.length === 0 && (
                  <View style={{ padding: Spacing.three, alignItems: 'center' }}>
                    <ThemedText type="small" themeColor="textSecondary">Nenhum resultado encontrado.</ThemedText>
                  </View>
                )}

                {/* Empty Tab States */}
                {displayItems.length === 0 && (
                  <ThemedView type="backgroundElement" style={styles.emptyState}>
                    <SymbolView
                      name={
                        activeTab === 'downloads' ? 'square.and.arrow.down' :
                        activeTab === 'favorites' ? 'star' : 'bookmark'
                      }
                      size={32}
                      tintColor={theme.textSecondary}
                    />
                    <ThemedText type="smallBold" themeColor="textSecondary" style={{ marginTop: Spacing.two, textAlign: 'center' }}>
                      {
                        activeTab === 'downloads' ? 'Nenhum mangá baixado no dispositivo.' :
                        activeTab === 'favorites' ? 'Nenhum mangá favoritado ainda.' :
                        'Sua lista "A Ler" está vazia.'
                      }
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={[styles.emptySubtitle, { textAlign: 'center' }]}>
                      {
                        activeTab === 'downloads' ? 'Vá para a aba "Baixar" para selecionar e salvar seus capítulos favoritos!' :
                        activeTab === 'favorites' ? 'Favorite mangás a partir da tela de detalhes para que eles apareçam aqui.' :
                        'Adicione títulos interessantes à lista "A Ler" a partir da tela de busca/detalhes!'
                      }
                    </ThemedText>
                  </ThemedView>
                )}
              </>
            )}
          </View>

          <View style={{ height: BottomTabInset + Spacing.five }} />
        </ScrollView>
      </SafeAreaView>

      {/* Reader Modal */}
      <MangaReaderModal
        isOpen={isReaderOpen}
        onClose={() => {
          setIsReaderOpen(false);
          setInitialChapter(null);
        }}
        manga={selectedManga ? localLibrary.find(l => l.savePath === selectedManga.savePath) || selectedManga : null}
        initialChapter={initialChapter}
      />

      {/* Local Manga Details Modal */}
      <LocalMangaDetailsModal
        isOpen={isLocalDetailsOpen}
        onClose={() => {
          setIsLocalDetailsOpen(false);
          scanLibrary();
        }}
        manga={selectedManga ? localLibrary.find(l => l.savePath === selectedManga.savePath) || selectedManga : null}
        onOpenReader={handleOpenReaderFromDetails}
        onDelete={confirmDelete}
      />

      {/* Custom Delete Confirmation Modal */}
      <Modal
        visible={showDeleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteConfirm(false)}>
        <View style={styles.modalOverlay}>
          <ThemedView type="backgroundElement" style={styles.confirmModalBox}>
            <SymbolView name="exclamationmark.triangle.fill" size={36} tintColor="#f44336" />
            
            <ThemedText type="subtitle" style={[styles.confirmModalTitle, { color: '#f44336' }]}>
              Excluir Mangá?
            </ThemedText>
            
            <ThemedText type="small" themeColor="textSecondary" style={styles.confirmModalText}>
              Deseja excluir permanentemente o mangá <ThemedText type="smallBold" style={{ color: theme.text }}>"{mangaToDelete?.mangaTitle}"</ThemedText> e todos os seus capítulos baixados? Esta ação não pode ser desfeita.
            </ThemedText>

            <View style={styles.confirmModalButtons}>
              <Pressable
                onPress={() => setShowDeleteConfirm(false)}
                style={({ pressed }) => [
                  styles.confirmModalBtn,
                  styles.cancelBtn,
                  pressed && { opacity: 0.8 }
                ]}>
                <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>
                  Cancelar
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={handleExecuteDelete}
                style={({ pressed }) => [
                  styles.confirmModalBtn,
                  styles.deleteConfirmBtn,
                  pressed && { opacity: 0.8 }
                ]}>
                <ThemedText type="smallBold" style={{ color: '#ffffff' }}>
                  Excluir
                </ThemedText>
              </Pressable>
            </View>
          </ThemedView>
        </View>
      </Modal>

      {/* Custom Success Modal */}
      <Modal
        visible={showDeleteSuccess}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteSuccess(false)}>
        <View style={styles.modalOverlay}>
          <ThemedView type="backgroundElement" style={styles.successModalBox}>
            <SymbolView name="checkmark.circle.fill" size={42} tintColor={theme.accent} />
            
            <ThemedText type="subtitle" style={styles.successModalTitle}>
              Sucesso!
            </ThemedText>
            
            <ThemedText type="small" themeColor="textSecondary" style={styles.successModalText}>
              O mangá foi removido do dispositivo com sucesso.
            </ThemedText>

            <Pressable
              onPress={() => setShowDeleteSuccess(false)}
              style={({ pressed }) => [
                styles.successCloseBtn,
                { backgroundColor: theme.accent },
                pressed && { opacity: 0.8 }
              ]}>
              <ThemedText type="smallBold" style={{ color: '#000000', fontWeight: 'bold' }}>
                Entendi
              </ThemedText>
            </Pressable>
          </ThemedView>
        </View>
      </Modal>
      {/* Sync Settings Modal */}
      <SyncSettingsModal
        isOpen={isSyncOpen}
        onClose={() => {
          setIsSyncOpen(false);
          scanLibrary();
          loadFavoritesAndToRead();
        }}
        onShowToast={showStatus}
      />

      {/* Online Manga Details Modal */}
      <MangaDetailsModal
        isOpen={isOnlineDetailsOpen}
        onClose={() => {
          setIsOnlineDetailsOpen(false);
          loadFavoritesAndToRead();
        }}
        onShowToast={showStatus}
        onOpenReader={handleOpenReaderFromDetails}
      />

      {/* Status Toast Banner */}
      {statusMessage.text !== '' && (
        <View
          style={[
            sharedStyles.statusBanner,
            { backgroundColor: statusMessage.type === 'success' ? '#2e7d32' : '#c62828', zIndex: 9999 },
          ]}>
          <SymbolView
            name={statusMessage.type === 'success' ? 'checkmark.circle' : 'exclamationmark.triangle'}
            size={16}
            tintColor="#fff"
          />
          <ThemedText type="smallBold" style={sharedStyles.statusText}>
            {statusMessage.text}
          </ThemedText>
        </View>
      )}
    </ThemedView>
  );
}
