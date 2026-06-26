import React, { useState } from 'react';
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
import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import * as FileSystem from 'expo-file-system/legacy';
import { useManga, HistoryItem } from '@/context/manga-context';
import { useTheme } from '@/hooks/use-theme';

export default function LibraryScreen() {
  const theme = useTheme();
  const {
    downloadHistory,
    clearHistory,
  } = useManga();

  // Reader Modal State
  const [isReaderOpen, setIsReaderOpen] = useState(false);
  const [selectedManga, setSelectedManga] = useState<HistoryItem | null>(null);
  const [localChapters, setLocalChapters] = useState<string[]>([]);
  const [currentChapter, setCurrentChapter] = useState<string | null>(null);
  const [chapterPages, setChapterPages] = useState<string[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [loadingPages, setLoadingPages] = useState(false);
  const [showChapterSelector, setShowChapterSelector] = useState(false);

  const openReader = async (item: HistoryItem) => {
    setSelectedManga(item);
    setIsReaderOpen(true);
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
        loadChapterPages(item.savePath, mockChaps[0]);
      }
      return;
    }

    try {
      const exists = await FileSystem.getInfoAsync(item.savePath);
      if (!exists.exists) {
        throw new Error('Diretório do mangá não encontrado localmente.');
      }
      
      const contents = await FileSystem.readDirectoryAsync(item.savePath);
      // Filter out system files
      const chapters = contents.filter(name => !name.startsWith('.'));
      
      // Sort chapters descending (highest number first)
      chapters.sort((a, b) => {
        const numA = parseFloat(a.match(/\d+(\.\d+)?/)?.[0] || '0') || 0;
        const numB = parseFloat(b.match(/\d+(\.\d+)?/)?.[0] || '0') || 0;
        return numB - numA;
      });

      setLocalChapters(chapters);
      if (chapters.length > 0) {
        loadChapterPages(item.savePath, chapters[0]);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao listar capítulos locais: ${err.message}`);
    } finally {
      setLoadingChapters(false);
    }
  };

  const loadChapterPages = async (mangaPath: string, chapterFolderName: string) => {
    setCurrentChapter(chapterFolderName);
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
      const chapterPath = `${mangaPath}/${chapterFolderName}`;
      const contents = await FileSystem.readDirectoryAsync(chapterPath);
      
      // Filter out files that are not images
      const imageFiles = contents.filter(name => 
        name.endsWith('.jpg') || 
        name.endsWith('.jpeg') || 
        name.endsWith('.png') || 
        name.endsWith('.webp')
      );

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
    if (!currentChapter || localChapters.length === 0 || !selectedManga) return;
    const currentIndex = localChapters.indexOf(currentChapter);
    if (currentIndex > 0) { // list is descending, index - 1 is next chapter
      loadChapterPages(selectedManga.savePath, localChapters[currentIndex - 1]);
    }
  };

  const handlePrevChapter = () => {
    if (!currentChapter || localChapters.length === 0 || !selectedManga) return;
    const currentIndex = localChapters.indexOf(currentChapter);
    if (currentIndex < localChapters.length - 1) { // list is descending, index + 1 is previous chapter
      loadChapterPages(selectedManga.savePath, localChapters[currentIndex + 1]);
    }
  };

  const hasNextChapter = currentChapter ? localChapters.indexOf(currentChapter) > 0 : false;
  const hasPrevChapter = currentChapter ? localChapters.indexOf(currentChapter) < localChapters.length - 1 : false;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          
          {/* Header */}
          <ThemedView style={styles.header}>
            <ThemedText type="subtitle" style={styles.title}>
              Biblioteca
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Gerencie seus downloads concluídos e leia localmente offline
            </ThemedText>
          </ThemedView>

          {/* History / Completed Downloads */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <SymbolView name="checkmark.circle.fill" size={16} tintColor="#8B5CF6" />
              <ThemedText type="smallBold" style={styles.sectionTitle}>
                Histórico de Downloads ({downloadHistory.length})
              </ThemedText>
            </View>

            {downloadHistory.map((item) => (
              <ThemedView key={item.id} type="backgroundElement" style={styles.historyCard}>
                <Image
                  source={{ uri: item.coverUrl }}
                  style={styles.historyImage}
                  contentFit="cover"
                />
                <View style={styles.historyInfo}>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {item.mangaTitle}
                  </ThemedText>
                  
                  <View style={styles.historyMetaRow}>
                    <SymbolView name="folder.fill" size={10} tintColor="#FFA000" />
                    <ThemedText type="code" themeColor="textSecondary" style={styles.historyPath} numberOfLines={1}>
                      {item.savePath}
                    </ThemedText>
                  </View>

                  <View style={styles.historyFooter}>
                    <ThemedText type="code" themeColor="textSecondary">
                      {item.chaptersCount} cap. • {item.source}
                    </ThemedText>
                  </View>
                </View>

                <Pressable
                  onPress={() => openReader(item)}
                  style={({ pressed }) => [
                    styles.historyReadBtn,
                    { borderColor: '#8B5CF6', opacity: pressed ? 0.8 : 1 },
                  ]}>
                  <SymbolView name="book.fill" size={12} tintColor="#8B5CF6" />
                  <ThemedText type="smallBold" style={styles.historyReadBtnText}>
                    Ler
                  </ThemedText>
                </Pressable>
              </ThemedView>
            ))}

            {/* Empty History State */}
            {downloadHistory.length === 0 && (
              <ThemedView type="backgroundElement" style={styles.emptyState}>
                <SymbolView name="square.and.arrow.down" size={32} tintColor={theme.textSecondary} />
                <ThemedText type="smallBold" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
                  Nenhum download concluído ainda.
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.emptySubtitle}>
                  Vá para a aba "Baixar" para selecionar e salvar seus capítulos favoritos!
                </ThemedText>
              </ThemedView>
            )}

            {/* Clear History Button */}
            {downloadHistory.length > 0 && (
              <Pressable
                onPress={clearHistory}
                style={({ pressed }) => [
                  styles.clearBtn,
                  { borderColor: theme.backgroundSelected, opacity: pressed ? 0.7 : 1 },
                ]}>
                <SymbolView name="trash" size={14} tintColor="#f44336" />
                <ThemedText type="smallBold" style={styles.clearBtnText}>
                  Limpar Histórico
                </ThemedText>
              </Pressable>
            )}
          </View>

          <View style={{ height: BottomTabInset + Spacing.five }} />
        </ScrollView>
      </SafeAreaView>

      {/* Reader Modal */}
      <Modal
        visible={isReaderOpen}
        animationType="slide"
        onRequestClose={() => setIsReaderOpen(false)}>
        <ThemedView style={styles.readerContainer}>
          {/* Reader Header */}
          <SafeAreaView style={styles.readerHeader} edges={['top', 'left', 'right']}>
            <View style={styles.readerHeaderContent}>
              <Pressable onPress={() => setIsReaderOpen(false)} style={styles.readerBackBtn}>
                <SymbolView name="chevron.left" size={18} tintColor={theme.text} />
                <ThemedText type="smallBold" style={{ marginLeft: 4 }}>Voltar</ThemedText>
              </Pressable>

              <View style={styles.readerTitleBox}>
                <ThemedText type="smallBold" style={styles.readerMangaTitle} numberOfLines={1}>
                  {selectedManga?.mangaTitle}
                </ThemedText>
                <Pressable 
                  onPress={() => setShowChapterSelector(!showChapterSelector)}
                  style={styles.chapterDropdownBtn}>
                  <ThemedText type="code" style={{ color: '#8B5CF6', fontWeight: 'bold' }}>
                    {currentChapter || 'Carregando...'}
                  </ThemedText>
                  <SymbolView name="chevron.down" size={10} tintColor="#8B5CF6" style={{ marginLeft: 4 }} />
                </Pressable>
              </View>

              {/* Navigation Controls */}
              <View style={styles.readerNavControls}>
                <Pressable 
                  onPress={handlePrevChapter} 
                  disabled={!hasPrevChapter}
                  style={[styles.readerNavBtn, !hasPrevChapter && styles.readerNavBtnDisabled]}>
                  <SymbolView name="arrow.left" size={12} tintColor={hasPrevChapter ? theme.text : theme.textSecondary} />
                </Pressable>
                <Pressable 
                  onPress={handleNextChapter} 
                  disabled={!hasNextChapter}
                  style={[styles.readerNavBtn, !hasNextChapter && styles.readerNavBtnDisabled]}>
                  <SymbolView name="arrow.right" size={12} tintColor={hasNextChapter ? theme.text : theme.textSecondary} />
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
                      onPress={() => selectedManga && loadChapterPages(selectedManga.savePath, chapName)}
                      style={[
                        styles.selectorOverlayItem,
                        isCurrent && { backgroundColor: theme.backgroundSelected }
                      ]}>
                      <SymbolView name={isCurrent ? "checkmark.circle.fill" : "circle"} size={12} tintColor={isCurrent ? "#8B5CF6" : theme.textSecondary} />
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
                <ActivityIndicator size="large" color="#8B5CF6" />
                <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
                  Carregando páginas offline...
                </ThemedText>
              </View>
            ) : (
              <FlatList
                data={chapterPages}
                keyExtractor={(item) => item}
                showsVerticalScrollIndicator={false}
                renderItem={({ item, index }) => (
                  <View style={styles.readerPageContainer}>
                    <Image
                      source={{ uri: item }}
                      style={styles.readerPageImage}
                      contentFit="contain"
                    />
                    <View style={styles.pageIndicator}>
                      <ThemedText type="code" style={styles.pageIndicatorText}>
                        Pág. {index + 1} / {chapterPages.length}
                      </ThemedText>
                    </View>
                  </View>
                )}
                ListEmptyComponent={
                  <View style={styles.readerEmpty}>
                    <SymbolView name="doc.text.fill" size={32} tintColor={theme.textSecondary} />
                    <ThemedText type="smallBold" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
                      Nenhuma página encontrada
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', marginTop: 4 }}>
                      Não foi possível encontrar imagens neste capítulo local.
                    </ThemedText>
                  </View>
                }
              />
            )}
          </View>
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    gap: Spacing.four,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    paddingVertical: Spacing.two,
    gap: Spacing.half,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  sectionContainer: {
    gap: Spacing.two,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.one,
  },
  sectionTitle: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // History Items
  historyCard: {
    flexDirection: 'row',
    padding: Spacing.two,
    borderRadius: Spacing.two,
    gap: Spacing.two,
    alignItems: 'center',
  },
  historyImage: {
    width: 48,
    height: 68,
    borderRadius: 4,
    backgroundColor: '#333',
  },
  historyInfo: {
    flex: 1,
    gap: 2,
  },
  historyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  historyPath: {
    fontSize: 10,
    flex: 1,
  },
  historyFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  // Empty State
  emptyState: {
    padding: Spacing.five,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
  },
  emptySubtitle: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: Spacing.one,
    maxWidth: 280,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.two,
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  clearBtnText: {
    color: '#f44336',
    fontSize: 13,
  },
  // History Item Read Button
  historyReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
    borderWidth: 1,
    gap: 4,
  },
  historyReadBtnText: {
    color: '#8B5CF6',
    fontSize: 11,
  },
  // Reader Modal Styles
  readerContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  readerHeader: {
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  readerHeaderContent: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
  },
  readerBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
  readerTitleBox: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: Spacing.two,
  },
  readerMangaTitle: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  chapterDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  readerNavControls: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  readerNavBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  readerNavBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    opacity: 0.5,
  },
  chapterSelectorOverlay: {
    position: 'absolute',
    top: 96,
    left: Spacing.four,
    right: Spacing.four,
    bottom: Spacing.four,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    zIndex: 99,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  selectorOverlayTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: Spacing.two,
    textAlign: 'center',
  },
  selectorOverlayScroll: {
    flex: 1,
  },
  selectorOverlayItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  closeOverlayBtn: {
    backgroundColor: '#8B5CF6',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  readerCanvas: {
    flex: 1,
    backgroundColor: '#050505',
  },
  readerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  readerEmpty: {
    flex: 1,
    paddingTop: 100,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.five,
  },
  readerPageContainer: {
    position: 'relative',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  readerPageImage: {
    width: '100%',
    height: 650,
    backgroundColor: '#000000',
  },
  pageIndicator: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  pageIndicatorText: {
    fontSize: 10,
    color: '#ffffff',
  },
});
