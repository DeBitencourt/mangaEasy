import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Pressable,
  ScrollView,
  FlatList,
  Platform,
  View,
  Modal,
  ActivityIndicator,
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { SymbolView } from '@/components/ui/symbol-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { HistoryItem } from '@/context/manga-context';
import { useTheme } from '@/hooks/use-theme';
import { useManga } from '@/context/manga-context';
import * as FileSystem from 'expo-file-system/legacy';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { addReadingHistoryLocal, saveReadingProgressLocal, getChapterProgressLocal } from '@/utils/database';



// Import separated styles
import { createSharedStyles } from '@/styles/shared.styles';
import { createReaderStyles } from '@/styles/reader.styles';
import { Dimensions } from 'react-native';

const { width: screenWidth } = Dimensions.get('window');

const isManhwaHeuristic = (title?: string) => {
  if (!title) return false;
  const lower = title.toLowerCase();
  const manhwaKeywords = [
    'solo leveling',
    'leveling',
    'manhwa',
    'webtoon',
    'regime',
    'strongest',
    'tower of god',
    'god of highschool',
    'noblesse',
    'bastard',
    'sweet home',
    'lookism',
    'mercenary',
    'suicide hunter',
    'hero',
    'villain',
    'magic',
    'player',
    'reincarnation',
    'regression',
    'ranker',
    'dungeon',
    'system'
  ];
  return manhwaKeywords.some(keyword => lower.includes(keyword));
};

interface ReaderPageProps {
  uri: string;
  index: number;
  totalPages: number;
  viewMode: 'manga' | 'webtoon';
  styles: any;
}

const ReaderPage = React.memo(({ uri, index, totalPages, viewMode, styles }: ReaderPageProps) => {
  const isWebtoon = viewMode === 'webtoon';

  // Start with a tall portrait ratio for webtoon to minimize layout shifts when image loads
  const [aspectRatio, setAspectRatio] = useState<number>(isWebtoon ? 0.5 : 0.7);

  const handleLoad = (event: any) => {
    const { width, height } = event.source;
    if (width && height) {
      setAspectRatio(width / height);
    }
  };


  const containerStyle = [
    styles.readerPageContainer,
    isWebtoon && { marginVertical: 0 }
  ];

  const imageStyle = isWebtoon
    ? {
        width: screenWidth,
        height: screenWidth / aspectRatio,
        backgroundColor: '#000000',
      }
    : styles.readerPageImage;

  return (
    <View style={containerStyle}>
      <Image
        source={{ uri }}
        style={imageStyle}
        contentFit={isWebtoon ? "fill" : "contain"}
        onLoad={handleLoad}
      />
      <View style={[
        styles.pageIndicator,
        isWebtoon && {
          bottom: 8,
          right: 8,
        }
      ]}>
        <ThemedText type="code" style={styles.pageIndicatorText}>
          Pág. {index + 1} / {totalPages}
        </ThemedText>
      </View>
    </View>
  );
});

interface MangaReaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  manga: HistoryItem | null;
  initialChapter?: string | null;
}

export default function MangaReaderModal({ isOpen, onClose, manga, initialChapter = null }: MangaReaderModalProps) {
  const theme = useTheme();
  const { updateLastReadChapter } = useManga();
  const sharedStyles = createSharedStyles(theme);
  const styles = createReaderStyles(theme);

  const [localChapters, setLocalChapters] = useState<string[]>([]);
  const [currentChapter, setCurrentChapter] = useState<string | null>(null);
  const [chapterPages, setChapterPages] = useState<string[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [loadingPages, setLoadingPages] = useState(false);
  const [showChapterSelector, setShowChapterSelector] = useState(false);
  const [viewMode, setViewMode] = useState<'manga' | 'webtoon'>('manga');
  const flatListRef = React.useRef<FlatList>(null);
  const webtoonScrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const [showHeader, setShowHeader] = useState(false);
  const lastOffsetY = useRef(0);
  const headerOpacity = useRef(new Animated.Value(0)).current;

  // Reading progress state
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  // Accumulated page heights for webtoon mode (to estimate current page from scroll offset)
  const pageHeightsRef = useRef<number[]>([]);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems && viewableItems.length > 0) {
      const firstVisibleItem = viewableItems[0];
      if (firstVisibleItem.index !== null && firstVisibleItem.index !== undefined) {
        setCurrentPageIdx(firstVisibleItem.index);
      }
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  // Webtoon page height tracking
  const handleWebtoonPageLayout = useCallback((index: number, height: number) => {
    pageHeightsRef.current[index] = height;
  }, []);

  // Calculate current page index from scroll offset in webtoon mode
  const getWebtoonPageFromOffset = (offsetY: number): number => {
    const heights = pageHeightsRef.current;
    let accumulated = 0;
    for (let i = 0; i < heights.length; i++) {
      accumulated += heights[i] || 0;
      if (offsetY < accumulated) return i;
    }
    return heights.length - 1;
  };

  // Scroll to top when chapter changes (do NOT depend on chapterPages — its reference
  // changes on every load, which would cause spurious scroll-to-top jumps mid-reading)
  useEffect(() => {
    pageHeightsRef.current = [];
    if (viewMode === 'webtoon') {
      if (webtoonScrollRef.current) {
        try {
          webtoonScrollRef.current.scrollTo({ y: 0, animated: false });
        } catch (e) {
          console.warn('Failed to scroll webtoon ScrollView to top:', e);
        }
      }
    } else {
      if (flatListRef.current) {
        try {
          flatListRef.current.scrollToOffset({ offset: 0, animated: false });
        } catch (e) {
          console.warn('Failed to scroll FlatList to top:', e);
        }
      }
    }
  }, [currentChapter]);

  // Load chapters when modal opens
  useEffect(() => {
    if (isOpen && manga) {
      const isManhwaType = manga.mangaType && (
        manga.mangaType.toLowerCase() === 'manhwa' || 
        manga.mangaType.toLowerCase() === 'manhua'
      );
      const defaultMode = (isManhwaType || isManhwaHeuristic(manga.mangaTitle)) ? 'webtoon' : 'manga';
      setViewMode(defaultMode);
      loadChaptersList(manga);
    } else {
      // Clear state on close
      setLocalChapters([]);
      setCurrentChapter(null);
      setChapterPages([]);
      setShowChapterSelector(false);
    }
  }, [isOpen, manga?.savePath]);

  // Toggle Android system navigation bar when reader is open
  useEffect(() => {
    if (Platform.OS === 'android' && NavigationBar) {
      const hasSetVisibility = typeof NavigationBar.setVisibilityAsync === 'function';
      const hasSetBehavior = typeof NavigationBar.setBehaviorAsync === 'function';

      if (isOpen) {
        if (hasSetVisibility) {
          NavigationBar.setVisibilityAsync('hidden').catch((err: any) => console.warn(err));
        }
        if (hasSetBehavior) {
          NavigationBar.setBehaviorAsync('overlay-swipe').catch((err: any) => console.warn(err));
        }
      } else {
        if (hasSetVisibility) {
          NavigationBar.setVisibilityAsync('visible').catch((err: any) => console.warn(err));
        }
      }

      return () => {
        if (hasSetVisibility) {
          NavigationBar.setVisibilityAsync('visible').catch((err: any) => console.warn(err));
        }
      };
    }
  }, [isOpen]);

  const loadChaptersList = async (item: HistoryItem) => {
    setLoadingChapters(true);
    setCurrentChapter(null);
    setChapterPages([]);
    setLocalChapters([]);

    if (Platform.OS === 'web') {
      // Mock chapters on web
      const mockChaps = Array.from({ length: item.chaptersCount }, (_, i) => `Capítulo ${item.chaptersCount - i}`);
      setLocalChapters(mockChaps);
      setLoadingChapters(false);
      if (mockChaps.length > 0) {
        const startChapter = (initialChapter && mockChaps.includes(initialChapter)) 
          ? initialChapter 
          : mockChaps[0];
        loadChapterPages(item.savePath, startChapter);
      }
      return;
    }

    try {
      const exists = await FileSystem.getInfoAsync(item.savePath);
      if (!exists.exists) {
        throw new Error('Diretório do mangá não encontrado localmente.');
      }
      
      const contents = await FileSystem.readDirectoryAsync(item.savePath);
      
      const hasDirectImages = contents.some(name => {
        const lower = name.toLowerCase();
        if (lower.startsWith('cover.')) return false;
        return (
          lower.endsWith('.jpg') || 
          lower.endsWith('.jpeg') || 
          lower.endsWith('.png') || 
          lower.endsWith('.webp')
        );
      });

      if (hasDirectImages) {
        // Old structure: direct images inside the savePath
        const segments = item.savePath.split(/[/\\]/);
        const chapterName = segments[segments.length - 1] || item.mangaTitle || 'Capítulo Único';
        setLocalChapters([chapterName]);
        loadChapterPages(item.savePath, '', chapterName);
      } else {
        // New structure: chapters are in subfolders
        // Filter out system files and files (like cover.jpg, metadata files)
        const chapters = contents.filter(name => {
          if (name.startsWith('.')) return false;
          const lower = name.toLowerCase();
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
        
        // Sort chapters descending (highest number first)
        chapters.sort((a, b) => {
          const numA = parseFloat(a.match(/\d+(\.\d+)?/)?.[0] || '0') || 0;
          const numB = parseFloat(b.match(/\d+(\.\d+)?/)?.[0] || '0') || 0;
          return numB - numA;
        });

        setLocalChapters(chapters);
        if (chapters.length > 0) {
          const startChapter = (initialChapter && chapters.includes(initialChapter)) 
            ? initialChapter 
            : chapters[0];
          loadChapterPages(item.savePath, startChapter);
        }
      }
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao listar capítulos locais: ${err.message}`);
    } finally {
      setLoadingChapters(false);
    }
  };
  const loadChapterPages = async (
    mangaPath: string,
    chapterFolderName: string,
    displayTitle: string = ''
  ) => {
    const isDirect = !chapterFolderName;
    const chapTitle = displayTitle || chapterFolderName || manga?.mangaTitle || 'Capítulo Único';
    setCurrentChapter(chapTitle);
    setLoadingPages(true);
    setChapterPages([]);
    setShowChapterSelector(false);
    setCurrentPageIdx(0);

    if (manga) {
      addReadingHistoryLocal(manga.mangaTitle, chapTitle).catch(console.error);
    }

    if (Platform.OS === 'web') {
      // Mock pages on web
      await new Promise(resolve => setTimeout(resolve, 800));
      const mockImages = [
        'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=800&q=80',
        'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800&q=80',
        'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&q=80',
        'https://images.unsplash.com/photo-1560169897-fc0cdbdfa4d5?w=800&q=80',
        'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&q=80'
      ];
      setChapterPages(mockImages);
      setLoadingPages(false);

      if (manga) {
        getChapterProgressLocal(manga.mangaTitle, chapTitle).then((progress) => {
          if (progress && progress.last_page_read > 1 && progress.last_page_read <= mockImages.length) {
            setTimeout(() => {
              if (flatListRef.current) {
                try {
                  flatListRef.current.scrollToIndex({
                    index: progress.last_page_read - 1,
                    animated: false
                  });
                } catch (e) {
                  console.warn(e);
                }
              }
            }, 150);
          }
        }).catch(console.error);
      }
      return;
    }

    try {
      const chapterPath = isDirect ? mangaPath : `${mangaPath}/${chapterFolderName}`;
      const contents = await FileSystem.readDirectoryAsync(chapterPath);
      
      // Filter out files that are not images, ignoring cover image
      const imageFiles = contents.filter(name => {
        const lower = name.toLowerCase();
        if (lower.startsWith('cover.')) return false;
        return (
          lower.endsWith('.jpg') || 
          lower.endsWith('.jpeg') || 
          lower.endsWith('.png') || 
          lower.endsWith('.webp')
        );
      });

      // Sort files numerically (1.jpg, 2.jpg, 10.jpg ...)
      imageFiles.sort((a, b) => {
        const numA = parseInt(a.split('.')[0]) || 0;
        const numB = parseInt(b.split('.')[0]) || 0;
        return numA - numB;
      });

      // Build absolute URIs for local files
      const fullUris = imageFiles.map(filename => `${chapterPath}/${filename}`);
      setChapterPages(fullUris);

      if (manga) {
        getChapterProgressLocal(manga.mangaTitle, chapTitle).then((progress) => {
          if (progress && progress.last_page_read > 1 && progress.last_page_read <= fullUris.length) {
            // Use scrollToOffset instead of scrollToIndex: without getItemLayout the FlatList
            // doesn't know item heights up front and will guess wrong, causing teleport jumps.
            // We wait a bit more (300ms) so at least the first few items have rendered.
            setTimeout(() => {
              if (flatListRef.current) {
                try {
                  flatListRef.current.scrollToIndex({
                    index: progress.last_page_read - 1,
                    animated: false,
                    viewPosition: 0,
                  });
                } catch (e) {
                  console.warn('scrollToIndex failed, ignored:', e);
                }
              }
            }, 300);
          }
        }).catch(console.error);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao carregar páginas: ${err.message}`);
    } finally {
      setLoadingPages(false);
    }
  };

  const handleNextChapter = () => {
    if (!currentChapter || localChapters.length === 0 || !manga) return;
    const currentIndex = localChapters.indexOf(currentChapter);
    if (currentIndex > 0) { // list is descending, index - 1 is next chapter
      loadChapterPages(manga.savePath, localChapters[currentIndex - 1]);
    }
  };

  const handlePrevChapter = () => {
    if (!currentChapter || localChapters.length === 0 || !manga) return;
    const currentIndex = localChapters.indexOf(currentChapter);
    if (currentIndex < localChapters.length - 1) { // list is descending, index + 1 is previous chapter
      loadChapterPages(manga.savePath, localChapters[currentIndex + 1]);
    }
  };

  const hasNextChapter = currentChapter ? localChapters.indexOf(currentChapter) > 0 : false;
  const hasPrevChapter = currentChapter ? localChapters.indexOf(currentChapter) < localChapters.length - 1 : false;

  // Hide header whenever opening or changing chapter – user reveals it by scrolling up
  useEffect(() => {
    setShowHeader(false);
    Animated.timing(headerOpacity, {
      toValue: 0,
      duration: 0,
      useNativeDriver: true,
    }).start();
    lastOffsetY.current = 0;
  }, [isOpen, currentChapter]);

  // Persist last read chapter and current page progress
  useEffect(() => {
    if (manga && currentChapter && !loadingPages) {
      updateLastReadChapter(manga.savePath, currentChapter);
    }
  }, [currentChapter, loadingPages]);

  useEffect(() => {
    if (manga && currentChapter && chapterPages.length > 0 && !loadingPages) {
      saveReadingProgressLocal(manga.mangaTitle, currentChapter, currentPageIdx + 1, chapterPages.length)
        .catch(console.error);
    }
  }, [currentPageIdx, currentChapter, chapterPages, loadingPages]);

  // Animate header opacity in/out when showHeader state changes
  useEffect(() => {
    Animated.timing(headerOpacity, {
      toValue: showHeader ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [showHeader]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const currentOffsetY = event.nativeEvent.contentOffset.y;
    const diff = currentOffsetY - lastOffsetY.current;

    // Scroll down threshold of 10px and absolute Y offset > 80px to hide
    if (diff > 10 && currentOffsetY > 80) {
      if (showHeader) {
        setShowHeader(false);
      }
    }
    // Scroll up threshold of -10px or back at the very top to show
    else if (diff < -10 || currentOffsetY <= 20) {
      if (!showHeader) {
        setShowHeader(true);
      }
    }

    // Update current page index in webtoon mode based on scroll position
    if (viewMode === 'webtoon') {
      const pageIdx = getWebtoonPageFromOffset(currentOffsetY);
      if (pageIdx !== currentPageIdx) {
        setCurrentPageIdx(pageIdx);
      }
    }

    lastOffsetY.current = currentOffsetY;
  };

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      statusBarTranslucent={true}
      onRequestClose={onClose}>
      <StatusBar hidden={isOpen} style="light" />
      <ThemedView style={styles.readerContainer}>
        {/* Reader Header - fades out when scrolling down */}
        <Animated.View
          pointerEvents={showHeader ? 'auto' : 'none'}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            opacity: headerOpacity,
          }}
        >
          <SafeAreaView style={styles.readerHeader} edges={['top', 'left', 'right']}>
            <View style={styles.readerHeaderContent}>
              <Pressable onPress={onClose} style={styles.readerBackBtn}>
                <SymbolView name="chevron.left" size={18} tintColor="#ffffff" />
                <ThemedText type="smallBold" style={{ marginLeft: 4, color: '#ffffff' }}>Voltar</ThemedText>
              </Pressable>

              <View style={styles.readerTitleBox}>
                <ThemedText type="smallBold" style={styles.readerMangaTitle} numberOfLines={1}>
                  {manga?.mangaTitle}
                </ThemedText>
                <Pressable 
                  onPress={() => setShowChapterSelector(!showChapterSelector)}
                  style={styles.chapterDropdownBtn}>
                  <ThemedText type="code" style={{ color: theme.accent, fontWeight: 'bold' }}>
                    {currentChapter || (loadingChapters ? 'Carregando lista...' : 'Sem Capítulos')}
                  </ThemedText>
                  <SymbolView name="chevron.down" size={10} tintColor={theme.accent} style={{ marginLeft: 4 }} />
                </Pressable>
              </View>

              {/* Navigation Controls */}
              <View style={styles.readerNavControls}>
                {/* View Mode Toggle */}
                <Pressable 
                  onPress={() => setViewMode(prev => prev === 'manga' ? 'webtoon' : 'manga')}
                  style={[
                    styles.readerNavBtn,
                    {
                      marginRight: 4,
                      borderColor: viewMode === 'webtoon' ? theme.accent : 'transparent',
                      borderWidth: viewMode === 'webtoon' ? 1 : 0,
                      shadowColor: viewMode === 'webtoon' ? theme.accent : 'transparent',
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.5,
                      shadowRadius: 4,
                    }
                  ]}>
                  <SymbolView 
                    name={viewMode === 'webtoon' ? 'arrow.up.arrow.down.circle.fill' : 'book.fill'} 
                    size={12} 
                    tintColor={viewMode === 'webtoon' ? theme.accent : '#ffffff'} 
                  />
                </Pressable>
                <Pressable 
                  onPress={handlePrevChapter} 
                  disabled={!hasPrevChapter}
                  style={[styles.readerNavBtn, !hasPrevChapter && styles.readerNavBtnDisabled]}>
                  <SymbolView name="arrow.left" size={12} tintColor={hasPrevChapter ? '#ffffff' : '#666666'} />
                </Pressable>
                <Pressable 
                  onPress={handleNextChapter} 
                  disabled={!hasNextChapter}
                  style={[styles.readerNavBtn, !hasNextChapter && styles.readerNavBtnDisabled]}>
                  <SymbolView name="arrow.right" size={12} tintColor={hasNextChapter ? '#ffffff' : '#666666'} />
                </Pressable>
              </View>
            </View>
          </SafeAreaView>
        </Animated.View>

        {/* Chapter Selector Dropdown Overlay */}
        {showChapterSelector && (
          <View style={[styles.chapterSelectorOverlay, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold" style={styles.selectorOverlayTitle}>Selecionar Capítulo</ThemedText>
            <ScrollView style={styles.selectorOverlayScroll}>
              {localChapters.map((chapName) => {
                const isCurrent = currentChapter === chapName;
                return (
                  <Pressable
                    key={chapName}
                    onPress={() => manga && loadChapterPages(manga.savePath, chapName)}
                    style={[
                      styles.selectorOverlayItem,
                      isCurrent && { backgroundColor: theme.backgroundSelected }
                    ]}>
                    <SymbolView name={isCurrent ? "checkmark.circle.fill" : "circle"} size={12} tintColor={isCurrent ? theme.accent : theme.textSecondary} />
                    <ThemedText type="small" style={{ marginLeft: 8, color: isCurrent ? theme.text : theme.textSecondary }}>
                      {chapName}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable onPress={() => setShowChapterSelector(false)} style={styles.closeOverlayBtn}>
              <ThemedText type="smallBold" style={{ color: '#fff' }}>Fechar</ThemedText>
            </Pressable>
          </View>
        )}

        {/* Reader Scrollable Canvas - fills entire screen beneath translucent header */}
        <View style={[styles.readerCanvas, StyleSheet.absoluteFillObject]}>
          {loadingPages ? (
            <View style={styles.readerLoading}>
              <ActivityIndicator size="large" color={theme.accent} />
              <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two, color: '#9b8db3' }}>
                Carregando páginas...
              </ThemedText>
            </View>
          ) : viewMode === 'webtoon' ? (
            // Webtoon mode: plain ScrollView avoids FlatList layout-recalc scroll jumps
            <ScrollView
              ref={webtoonScrollRef}
              showsVerticalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
            >
              {chapterPages.length === 0 ? (
                <View style={styles.readerEmpty}>
                  <SymbolView name="doc.text.fill" size={32} tintColor="#666" />
                  <ThemedText type="smallBold" style={{ marginTop: Spacing.two, color: '#888' }}>
                    Nenhuma página encontrada
                  </ThemedText>
                  <ThemedText type="small" style={{ textAlign: 'center', marginTop: 4, color: '#666' }}>
                    Não foi possível encontrar imagens neste capítulo.
                  </ThemedText>
                </View>
              ) : (
                chapterPages.map((uri, index) => (
                  <View
                    key={uri}
                    onLayout={(e) => handleWebtoonPageLayout(index, e.nativeEvent.layout.height)}
                  >
                    <ReaderPage
                      uri={uri}
                      index={index}
                      totalPages={chapterPages.length}
                      viewMode={viewMode}
                      styles={styles}
                    />
                  </View>
                ))
              )}
            </ScrollView>
          ) : (
            // Manga mode: FlatList for virtualised paged reading
            <FlatList
              ref={flatListRef}
              data={chapterPages}
              keyExtractor={(item) => item}
              showsVerticalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              renderItem={({ item, index }) => (
                <ReaderPage
                  uri={item}
                  index={index}
                  totalPages={chapterPages.length}
                  viewMode={viewMode}
                  styles={styles}
                />
              )}
              ListEmptyComponent={
                <View style={styles.readerEmpty}>
                  <SymbolView name="doc.text.fill" size={32} tintColor="#666" />
                  <ThemedText type="smallBold" style={{ marginTop: Spacing.two, color: '#888' }}>
                    Nenhuma página encontrada
                  </ThemedText>
                  <ThemedText type="small" style={{ textAlign: 'center', marginTop: 4, color: '#666' }}>
                    Não foi possível encontrar imagens neste capítulo local.
                  </ThemedText>
                </View>
              }
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              onScrollToIndexFailed={(info) => {
                // Fallback: scroll by estimated offset when index layout isn't known yet
                const estimatedOffset = info.averageItemLength * info.index;
                setTimeout(() => {
                  if (flatListRef.current) {
                    try {
                      flatListRef.current.scrollToOffset({ offset: estimatedOffset, animated: false });
                    } catch (e) {
                      console.warn('onScrollToIndexFailed fallback error:', e);
                    }
                  }
                }, 150);
              }}
            />
          )}
        </View>
      </ThemedView>
    </Modal>
  );
}
