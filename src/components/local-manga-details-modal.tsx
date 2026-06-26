import React, { useState, useEffect } from 'react';
import {
  TextInput,
  Pressable,
  ScrollView,
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
import { HistoryItem } from '@/context/manga-context';
import { useTheme } from '@/hooks/use-theme';
import * as FileSystem from 'expo-file-system/legacy';

// Import separated styles
import { createSharedStyles } from '@/styles/shared.styles';
import { createDetailsStyles } from '@/styles/details.styles';

interface LocalMangaDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  manga: HistoryItem | null;
  onOpenReader: (manga: HistoryItem, chapterFolderName: string) => void;
}

export default function LocalMangaDetailsModal({ isOpen, onClose, manga, onOpenReader }: LocalMangaDetailsModalProps) {
  const theme = useTheme();
  const sharedStyles = createSharedStyles(theme);
  const styles = createDetailsStyles(theme);

  const [localChapters, setLocalChapters] = useState<string[]>([]);
  const [searchChapter, setSearchChapter] = useState('');
  const [sortAscending, setSortAscending] = useState(false);

  // Clear selections/search when modal opens/closes
  useEffect(() => {
    if (isOpen && manga) {
      loadLocalChapters(manga);
      setSearchChapter('');
    } else {
      setLocalChapters([]);
    }
  }, [isOpen, manga]);

  const loadLocalChapters = async (item: HistoryItem) => {
    if (Platform.OS === 'web') {
      const mockChaps = Array.from({ length: item.chaptersCount }, (_, i) => `Capítulo ${item.chaptersCount - i}`);
      setLocalChapters(mockChaps);
      return;
    }

    try {
      const exists = await FileSystem.getInfoAsync(item.savePath);
      if (!exists.exists) return;

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
        const segments = item.savePath.split(/[/\\]/);
        const chapterName = segments[segments.length - 1] || item.mangaTitle || 'Capítulo Único';
        setLocalChapters([chapterName]);
      } else {
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

        // Sort descending (highest number first)
        chapters.sort((a, b) => {
          const numA = parseFloat(a.match(/\d+(\.\d+)?/)?.[0] || '0') || 0;
          const numB = parseFloat(b.match(/\d+(\.\d+)?/)?.[0] || '0') || 0;
          return numB - numA;
        });

        setLocalChapters(chapters);
      }
    } catch (err) {
      console.error('Erro ao ler capítulos locais no detalhes modal:', err);
    }
  };

  const formatChapterNameForDisplay = (folderName: string) => {
    if (folderName.startsWith('cap-')) {
      const num = folderName.replace('cap-', '');
      return `Capítulo ${num}`;
    }
    return folderName;
  };

  // Filter chapters by search input
  const filteredChapters = localChapters.filter((ch) =>
    formatChapterNameForDisplay(ch).toLowerCase().includes(searchChapter.toLowerCase())
  );

  const displayedChapters = sortAscending
    ? [...filteredChapters].reverse()
    : filteredChapters;

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      onRequestClose={onClose}>
      <ThemedView style={styles.modalOverlay}>
        {manga && (
          <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Pressable onPress={onClose} style={styles.modalBackBtn}>
                <SymbolView name="chevron.left" size={18} tintColor={theme.text} />
                <ThemedText type="smallBold" style={{ marginLeft: 4 }}>Voltar</ThemedText>
              </Pressable>
              <ThemedText type="smallBold" style={styles.modalHeaderTitle} numberOfLines={1}>
                Biblioteca Local
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
                  source={{ uri: manga.coverUrl }}
                  style={styles.detailCoverImage}
                  contentFit="cover"
                />
                <View style={styles.detailMetaInfo}>
                  <ThemedText type="default" style={styles.detailTitle}>
                    {manga.mangaTitle}
                  </ThemedText>
                  
                  {/* Type Badge */}
                  <View style={{
                    alignSelf: 'flex-start',
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 4,
                    backgroundColor: 'rgba(208, 38, 255, 0.12)',
                    borderColor: 'rgba(208, 38, 255, 0.3)',
                    borderWidth: 1,
                    marginVertical: 6,
                    shadowColor: theme.accent,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.3,
                    shadowRadius: 2,
                  }}>
                    <ThemedText type="code" style={{ fontSize: 9, color: theme.accent, fontWeight: 'bold' }}>
                      {manga.mangaType || 'Manga'}
                    </ThemedText>
                  </View>

                  <View style={styles.detailSourceRow}>
                    <SymbolView name="folder.fill" size={12} tintColor="#FFA000" />
                    <ThemedText type="code" themeColor="textSecondary" style={{ marginLeft: 4, fontSize: 10 }}>
                      {manga.savePath}
                    </ThemedText>
                  </View>
                </View>
              </View>

              {/* Synopsis / Offline block */}
              <ThemedView type="backgroundElement" style={styles.synopsisCard}>
                <ThemedText type="smallBold" style={{ marginBottom: 6, color: theme.accent }}>
                  {manga.synopsis ? "Sinopse" : "Leitura Offline Disponível"}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.synopsisText}>
                  {manga.synopsis || `Este mangá está salvo localmente no dispositivo. Você possui ${localChapters.length} ${localChapters.length === 1 ? 'capítulo baixado' : 'capítulos baixados'} para leitura offline sem consumo de dados. Clique em um capítulo para iniciar a leitura.`}
                </ThemedText>
              </ThemedView>

              {/* Continue Reading Button */}
              {manga.lastReadChapter && (
                <Pressable
                  onPress={() => onOpenReader(manga, manga.lastReadChapter!)}
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
                    {formatChapterNameForDisplay(manga.lastReadChapter)}
                  </ThemedText>
                </Pressable>
              )}

              <View style={sharedStyles.divider} />

              {/* Selection Header */}
              <View style={styles.selectionControls}>
                <ThemedText type="smallBold">
                  Capítulos Baixados ({localChapters.length})
                </ThemedText>
              </View>

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

              {/* Chapters List */}
              <ScrollView
                style={[styles.chaptersListWrapper, { maxHeight: 380 }]}
                contentContainerStyle={styles.chaptersListContent}
                nestedScrollEnabled={true}
                showsVerticalScrollIndicator={true}>
                {displayedChapters.map((item, idx) => (
                  <Pressable
                    key={`${item}-${idx}`}
                    onPress={() => onOpenReader(manga, item)}
                    style={({ pressed }) => [
                      styles.chapterRow,
                      {
                        backgroundColor: theme.backgroundElement,
                        borderColor: theme.backgroundSelected,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}>
                    <ThemedText type="smallBold" style={{ color: theme.text }}>
                      {formatChapterNameForDisplay(item)}
                    </ThemedText>
                    <SymbolView
                      name="play.fill"
                      size={12}
                      tintColor={theme.accent}
                    />
                  </Pressable>
                ))}
                {displayedChapters.length === 0 && (
                  <View style={styles.emptyChapters}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Nenhum capítulo baixado encontrado.
                    </ThemedText>
                  </View>
                )}
              </ScrollView>
            </ScrollView>
          </SafeAreaView>
        )}
      </ThemedView>
    </Modal>
  );
}
