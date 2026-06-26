import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Pressable,
  ScrollView,
  FlatList,
  Platform,
  View,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { SymbolView } from '@/components/ui/symbol-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { HistoryItem } from '@/context/manga-context';
import { useTheme } from '@/hooks/use-theme';
import * as FileSystem from 'expo-file-system/legacy';

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
  const [aspectRatio, setAspectRatio] = useState<number>(0.7);

  const handleLoad = (event: any) => {
    const { width, height } = event.source;
    if (width && height) {
      setAspectRatio(width / height);
    }
  };

  const isWebtoon = viewMode === 'webtoon';

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

  // Scroll to top when chapter changes
  useEffect(() => {
    if (flatListRef.current) {
      try {
        flatListRef.current.scrollToOffset({ offset: 0, animated: false });
      } catch (e) {
        console.warn('Failed to scroll FlatList to top:', e);
      }
    }
  }, [currentChapter, chapterPages]);

  // Load chapters when modal opens
  useEffect(() => {
    if (isOpen && manga) {
      const defaultMode = isManhwaHeuristic(manga.mangaTitle) ? 'webtoon' : 'manga';
      setViewMode(defaultMode);
      loadChaptersList(manga);
    } else {
      // Clear state on close
      setLocalChapters([]);
      setCurrentChapter(null);
      setChapterPages([]);
      setShowChapterSelector(false);
    }
  }, [isOpen, manga]);

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

  const loadChapterPages = async (mangaPath: string, chapterFolderName: string, displayTitle?: string) => {
    const pathSegments = mangaPath.split(/[/\\]/);
    const lastSegment = pathSegments[pathSegments.length - 1];
    const isDirect = !chapterFolderName || chapterFolderName === lastSegment;

    setCurrentChapter(displayTitle || chapterFolderName || manga?.mangaTitle || 'Capítulo Único');
    setLoadingPages(true);
    setChapterPages([]);
    setShowChapterSelector(false);

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

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      onRequestClose={onClose}>
      <ThemedView style={styles.readerContainer}>
        {/* Reader Header */}
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
                    // Subtle neon shadow if active
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

        {/* Reader Scrollable Canvas */}
        <View style={styles.readerCanvas}>
          {loadingPages ? (
            <View style={styles.readerLoading}>
              <ActivityIndicator size="large" color={theme.accent} />
              <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two, color: '#9b8db3' }}>
                Carregando páginas offline...
              </ThemedText>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={chapterPages}
              keyExtractor={(item) => item}
              showsVerticalScrollIndicator={false}
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
            />
          )}
        </View>
      </ThemedView>
    </Modal>
  );
}
