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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { SymbolView } from '@/components/ui/symbol-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { addReadingHistoryLocal, saveReadingProgressLocal } from '@/utils/database';
import { fetchChapterImagesReal } from '@/utils/scraper';
import { createReaderStyles } from '@/styles/reader.styles';
import { Dimensions } from 'react-native';

const { width: screenWidth } = Dimensions.get('window');

// ─── ReaderPage ───────────────────────────────────────────────────────────────
interface ReaderPageProps {
  uri: string;
  index: number;
  totalPages: number;
  viewMode: 'manga' | 'webtoon';
  styles: any;
}

const OnlineReaderPage = React.memo(({ uri, index, totalPages, viewMode, styles }: ReaderPageProps) => {
  const isWebtoon = viewMode === 'webtoon';
  const [aspectRatio, setAspectRatio] = useState<number>(isWebtoon ? 0.5 : 0.7);

  const handleLoad = (event: any) => {
    const { width, height } = event.source;
    if (width && height) setAspectRatio(width / height);
  };

  const containerStyle = [styles.readerPageContainer, isWebtoon && { marginVertical: 0 }];
  const imageStyle = isWebtoon
    ? { width: screenWidth, height: screenWidth / aspectRatio, backgroundColor: '#000000' }
    : styles.readerPageImage;

  return (
    <View style={containerStyle}>
      <Image
        source={{ uri }}
        style={imageStyle}
        contentFit={isWebtoon ? 'fill' : 'contain'}
        onLoad={handleLoad}
        cachePolicy="memory-disk"
      />
      <View style={[styles.pageIndicator, isWebtoon && { bottom: 8, right: 8 }]}>
        <ThemedText type="code" style={styles.pageIndicatorText}>
          Pag. {index + 1} / {totalPages}
        </ThemedText>
      </View>
    </View>
  );
});

// ─── Props ────────────────────────────────────────────────────────────────────
interface OnlineReaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  mangaTitle: string;
  mangaType?: string;
  chapters: string[];
  chapterUrls: Record<string, string>;
  initialChapter?: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function OnlineReaderModal({
  isOpen,
  onClose,
  mangaTitle,
  mangaType,
  chapters,
  chapterUrls,
  initialChapter,
}: OnlineReaderModalProps) {
  const theme = useTheme();
  const styles = createReaderStyles(theme);

  const [currentChapter, setCurrentChapter] = useState<string | null>(null);
  const [chapterPages, setChapterPages] = useState<string[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showChapterSelector, setShowChapterSelector] = useState(false);

  const isManhwaType =
    mangaType?.toLowerCase() === 'manhwa' || mangaType?.toLowerCase() === 'manhua';
  const [viewMode, setViewMode] = useState<'manga' | 'webtoon'>(isManhwaType ? 'webtoon' : 'manga');

  const flatListRef = useRef<FlatList>(null);
  const webtoonScrollRef = useRef<ScrollView>(null);
  const pageHeightsRef = useRef<number[]>([]);

  const [showHeader, setShowHeader] = useState(false);
  const lastOffsetY = useRef(0);
  const headerOpacity = useRef(new Animated.Value(0)).current;

  const [currentPageIdx, setCurrentPageIdx] = useState(0);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems?.length > 0) {
      const first = viewableItems[0];
      if (first.index !== null && first.index !== undefined) {
        setCurrentPageIdx(first.index);
      }
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const handleWebtoonPageLayout = useCallback((index: number, height: number) => {
    pageHeightsRef.current[index] = height;
  }, []);

  const getWebtoonPageFromOffset = (offsetY: number): number => {
    const heights = pageHeightsRef.current;
    let accumulated = 0;
    for (let i = 0; i < heights.length; i++) {
      accumulated += heights[i] || 0;
      if (offsetY < accumulated) return i;
    }
    return heights.length - 1;
  };

  // ── Load chapter ─────────────────────────────────────────────────────────
  const loadChapter = useCallback(async (chapterName: string) => {
    setCurrentChapter(chapterName);
    setChapterPages([]);
    setLoadingPages(true);
    setLoadError(null);
    setCurrentPageIdx(0);
    setShowChapterSelector(false);
    pageHeightsRef.current = [];

    addReadingHistoryLocal(mangaTitle, chapterName).catch(console.error);

    if (Platform.OS === 'web') {
      await new Promise(r => setTimeout(r, 600));
      setChapterPages([
        'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=800&q=80',
        'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800&q=80',
        'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&q=80',
      ]);
      setLoadingPages(false);
      return;
    }

    const url = chapterUrls[chapterName];
    if (!url) {
      setLoadError('URL do capitulo nao encontrada.');
      setLoadingPages(false);
      return;
    }

    try {
      const images = await fetchChapterImagesReal(url);
      setChapterPages(images);
    } catch (err: any) {
      console.error('[OnlineReader] Erro ao carregar capitulo:', err);
      setLoadError(err.message || 'Erro desconhecido ao carregar o capitulo.');
    } finally {
      setLoadingPages(false);
    }
  }, [mangaTitle, chapterUrls]);

  // ── Lifecycle ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen && chapters.length > 0) {
      const start =
        initialChapter && chapters.includes(initialChapter)
          ? initialChapter
          : chapters[0];
      loadChapter(start);
    } else if (!isOpen) {
      setCurrentChapter(null);
      setChapterPages([]);
      setLoadError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    pageHeightsRef.current = [];
    if (viewMode === 'webtoon') {
      webtoonScrollRef.current?.scrollTo({ y: 0, animated: false });
    } else {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [currentChapter]);

  useEffect(() => {
    if (Platform.OS === 'android' && NavigationBar) {
      if (isOpen) {
        NavigationBar.setVisibilityAsync?.('hidden').catch(console.warn);
        NavigationBar.setBehaviorAsync?.('overlay-swipe').catch(console.warn);
      } else {
        NavigationBar.setVisibilityAsync?.('visible').catch(console.warn);
      }
      return () => { NavigationBar.setVisibilityAsync?.('visible').catch(console.warn); };
    }
  }, [isOpen]);

  // Hide header on open/chapter change – user reveals it by scrolling up
  useEffect(() => {
    setShowHeader(false);
    Animated.timing(headerOpacity, { toValue: 0, duration: 0, useNativeDriver: true }).start();
    lastOffsetY.current = 0;
  }, [isOpen, currentChapter]);

  useEffect(() => {
    Animated.timing(headerOpacity, {
      toValue: showHeader ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [showHeader]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const diff = offsetY - lastOffsetY.current;

    if (diff > 10 && offsetY > 80) {
      if (showHeader) setShowHeader(false);
    } else if (diff < -10 || offsetY <= 20) {
      if (!showHeader) setShowHeader(true);
    }

    if (viewMode === 'webtoon') {
      const pageIdx = getWebtoonPageFromOffset(offsetY);
      if (pageIdx !== currentPageIdx) setCurrentPageIdx(pageIdx);
    }

    lastOffsetY.current = offsetY;
  };

  useEffect(() => {
    if (mangaTitle && currentChapter && chapterPages.length > 0 && !loadingPages) {
      saveReadingProgressLocal(mangaTitle, currentChapter, currentPageIdx + 1, chapterPages.length)
        .catch(console.error);
    }
  }, [currentPageIdx, currentChapter, chapterPages, loadingPages]);

  // ── Chapter navigation ───────────────────────────────────────────────────
  const hasNextChapter = currentChapter ? chapters.indexOf(currentChapter) > 0 : false;
  const hasPrevChapter = currentChapter ? chapters.indexOf(currentChapter) < chapters.length - 1 : false;

  const handleNextChapter = () => {
    if (!currentChapter) return;
    const idx = chapters.indexOf(currentChapter);
    if (idx > 0) loadChapter(chapters[idx - 1]);
  };

  const handlePrevChapter = () => {
    if (!currentChapter) return;
    const idx = chapters.indexOf(currentChapter);
    if (idx < chapters.length - 1) loadChapter(chapters[idx + 1]);
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Modal visible={isOpen} animationType="slide" statusBarTranslucent={true} onRequestClose={onClose}>
      <StatusBar hidden={isOpen} style="light" />
      <ThemedView style={styles.readerContainer}>

        {/* Floating Header */}
        <Animated.View
          pointerEvents={showHeader ? 'auto' : 'none'}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, opacity: headerOpacity }}
        >
          <SafeAreaView style={styles.readerHeader} edges={['top', 'left', 'right']}>
            <View style={styles.readerHeaderContent}>
              <Pressable onPress={onClose} style={styles.readerBackBtn}>
                <SymbolView name="chevron.left" size={18} tintColor="#ffffff" />
                <ThemedText type="smallBold" style={{ marginLeft: 4, color: '#ffffff' }}>Voltar</ThemedText>
              </Pressable>

              <View style={styles.readerTitleBox}>
                <ThemedText type="smallBold" style={styles.readerMangaTitle} numberOfLines={1}>
                  {mangaTitle}
                </ThemedText>
                <Pressable
                  onPress={() => setShowChapterSelector(!showChapterSelector)}
                  style={styles.chapterDropdownBtn}
                >
                  <ThemedText type="code" style={{ color: theme.accent, fontWeight: 'bold' }}>
                    {currentChapter || (loadingPages ? 'Carregando...' : 'Sem Capitulos')}
                  </ThemedText>
                  <SymbolView name="chevron.down" size={10} tintColor={theme.accent} style={{ marginLeft: 4 }} />
                </Pressable>
              </View>

              <View style={styles.readerNavControls}>
                {/* Online badge */}
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 3,
                  backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 8,
                  paddingHorizontal: 6, paddingVertical: 2, marginRight: 4,
                }}>
                  <SymbolView name="wifi" size={10} tintColor="#4fc3f7" />
                  <ThemedText type="code" style={{ fontSize: 9, color: '#4fc3f7' }}>Online</ThemedText>
                </View>

                {/* View mode toggle */}
                <Pressable
                  onPress={() => setViewMode(prev => prev === 'manga' ? 'webtoon' : 'manga')}
                  style={[styles.readerNavBtn, {
                    marginRight: 4,
                    borderColor: viewMode === 'webtoon' ? theme.accent : 'transparent',
                    borderWidth: viewMode === 'webtoon' ? 1 : 0,
                  }]}
                >
                  <SymbolView
                    name={viewMode === 'webtoon' ? 'arrow.up.arrow.down.circle.fill' : 'book.fill'}
                    size={12}
                    tintColor={viewMode === 'webtoon' ? theme.accent : '#ffffff'}
                  />
                </Pressable>

                <Pressable onPress={handlePrevChapter} disabled={!hasPrevChapter}
                  style={[styles.readerNavBtn, !hasPrevChapter && styles.readerNavBtnDisabled]}>
                  <SymbolView name="arrow.left" size={12} tintColor={hasPrevChapter ? '#ffffff' : '#666666'} />
                </Pressable>
                <Pressable onPress={handleNextChapter} disabled={!hasNextChapter}
                  style={[styles.readerNavBtn, !hasNextChapter && styles.readerNavBtnDisabled]}>
                  <SymbolView name="arrow.right" size={12} tintColor={hasNextChapter ? '#ffffff' : '#666666'} />
                </Pressable>
              </View>
            </View>
          </SafeAreaView>
        </Animated.View>

        {/* Chapter Selector Dropdown */}
        {showChapterSelector && (
          <View style={[styles.chapterSelectorOverlay, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold" style={styles.selectorOverlayTitle}>Selecionar Capitulo</ThemedText>
            <ScrollView style={styles.selectorOverlayScroll}>
              {chapters.map((chapName) => {
                const isCurrent = currentChapter === chapName;
                return (
                  <Pressable
                    key={chapName}
                    onPress={() => loadChapter(chapName)}
                    style={[styles.selectorOverlayItem, isCurrent && { backgroundColor: theme.backgroundSelected }]}
                  >
                    <SymbolView
                      name={isCurrent ? 'checkmark.circle.fill' : 'circle'}
                      size={12}
                      tintColor={isCurrent ? theme.accent : theme.textSecondary}
                    />
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

        {/* Reader Canvas */}
        <View style={[styles.readerCanvas, StyleSheet.absoluteFillObject]}>
          {loadingPages ? (
            <View style={styles.readerLoading}>
              <ActivityIndicator size="large" color={theme.accent} />
              <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two, color: '#9b8db3' }}>
                Buscando paginas online...
              </ThemedText>
            </View>
          ) : loadError ? (
            <View style={styles.readerLoading}>
              <SymbolView name="wifi.slash" size={36} tintColor="#f44336" />
              <ThemedText type="smallBold" style={{ marginTop: Spacing.two, color: '#f44336', textAlign: 'center' }}>
                Erro ao carregar capitulo
              </ThemedText>
              <ThemedText type="small" style={{ marginTop: 6, color: '#888', textAlign: 'center', paddingHorizontal: 24 }}>
                {loadError}
              </ThemedText>
              <Pressable
                onPress={() => currentChapter && loadChapter(currentChapter)}
                style={{ marginTop: 16, backgroundColor: theme.accent, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 8 }}
              >
                <ThemedText type="smallBold" style={{ color: '#000' }}>Tentar Novamente</ThemedText>
              </Pressable>
            </View>
          ) : viewMode === 'webtoon' ? (
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
                    Nenhuma pagina encontrada
                  </ThemedText>
                </View>
              ) : (
                chapterPages.map((uri, index) => (
                  <View
                    key={`${uri}-${index}`}
                    onLayout={(e) => handleWebtoonPageLayout(index, e.nativeEvent.layout.height)}
                  >
                    <OnlineReaderPage
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
            <FlatList
              ref={flatListRef}
              data={chapterPages}
              keyExtractor={(item, index) => `${item}-${index}`}
              showsVerticalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              renderItem={({ item, index }) => (
                <OnlineReaderPage
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
                    Nenhuma pagina encontrada
                  </ThemedText>
                </View>
              }
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              onScrollToIndexFailed={(info) => {
                const estimatedOffset = info.averageItemLength * info.index;
                setTimeout(() => {
                  flatListRef.current?.scrollToOffset({ offset: estimatedOffset, animated: false });
                }, 150);
              }}
            />
          )}
        </View>
      </ThemedView>
    </Modal>
  );
}
