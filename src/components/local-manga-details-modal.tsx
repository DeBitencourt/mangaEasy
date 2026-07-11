import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SymbolView } from '@/components/ui/symbol-view';
import { Spacing } from '@/constants/theme';
import { HistoryItem } from '@/context/manga-context';
import { useTheme } from '@/hooks/use-theme';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Import separated styles
import { createDetailsStyles } from '@/styles/details.styles';
import { createSharedStyles } from '@/styles/shared.styles';
import { getMangaLastReadChapterLocal } from '@/utils/database';

interface LocalMangaDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  manga: HistoryItem | null;
  onOpenReader: (manga: HistoryItem, chapterFolderName: string) => void;
  onDelete?: (manga: HistoryItem) => void;
}

export default function LocalMangaDetailsModal({ isOpen, onClose, manga, onOpenReader, onDelete }: LocalMangaDetailsModalProps) {
  const theme = useTheme();
  const sharedStyles = createSharedStyles(theme);
  const styles = createDetailsStyles(theme);

  const [localChapters, setLocalChapters] = useState<string[]>([]);
  const [searchChapter, setSearchChapter] = useState('');
  const [sortAscending, setSortAscending] = useState(false);
  const [lastReadChapter, setLastReadChapter] = useState<string | null>(null);

  // Clear selections/search when modal opens/closes
  useEffect(() => {
    if (isOpen && manga) {
      loadLocalChapters(manga);
      setSearchChapter('');
      getMangaLastReadChapterLocal(manga.mangaTitle)
        .then(setLastReadChapter)
        .catch(console.error);
    } else {
      setLocalChapters([]);
      setLastReadChapter(null);
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

  const handleDeleteChapter = async (chapterFolder: string) => {
    if (!manga) return;
    try {
      const chapterPath = `${manga.savePath}/${chapterFolder}`;
      const exists = await FileSystem.getInfoAsync(chapterPath);
      if (exists.exists) {
        await FileSystem.deleteAsync(chapterPath, { idempotent: true });
      }

      // Reload the chapter list
      await loadLocalChapters(manga);

      // Check if there are any chapters left. If not, delete the whole manga from library!
      const contents = await FileSystem.readDirectoryAsync(manga.savePath);
      const remainingChaps = contents.filter(name => {
        if (name.startsWith('.')) return false;
        const lower = name.toLowerCase();
        return (
          !lower.startsWith('cover.') &&
          !lower.endsWith('.json') &&
          !lower.endsWith('.jpg') &&
          !lower.endsWith('.jpeg') &&
          !lower.endsWith('.png') &&
          !lower.endsWith('.webp')
        );
      });

      if (remainingChaps.length === 0) {
        // No chapters left, delete the manga folder and close details
        if (onDelete) {
          onClose();
          onDelete(manga);
        }
      }
    } catch (err) {
      console.error('Erro ao excluir capítulo local:', err);
      alert('Erro ao excluir o capítulo.');
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
          <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right', 'bottom']}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Pressable onPress={onClose} style={styles.modalBackBtn}>
                <SymbolView name="chevron.left" size={18} tintColor={theme.text} />
                <ThemedText type="smallBold" style={{ marginLeft: 4 }}>Voltar</ThemedText>
              </Pressable>
              <ThemedText type="smallBold" style={styles.modalHeaderTitle} numberOfLines={1}>
                Biblioteca Local
              </ThemedText>
              {onDelete ? (
                <Pressable
                  onPress={() => {
                    onClose();
                    onDelete(manga);
                  }}
                  style={({ pressed }) => [
                    {
                      padding: 6,
                      borderRadius: 6,
                      backgroundColor: 'rgba(244, 67, 54, 0.08)',
                      opacity: pressed ? 0.7 : 1,
                    }
                  ]}
                >
                  <SymbolView name="xmark" size={16} tintColor="#f44336" />
                </Pressable>
              ) : (
                <View style={{ width: 32 }} />
              )}
            </View>

            <View style={{ flex: 1, paddingHorizontal: Spacing.three, paddingBottom: 0 }}>

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
                    <ThemedText type="code" themeColor="textSecondary" style={{ fontSize: 10 }}>
                      {manga.savePath}
                    </ThemedText>
                  </View>

                  {lastReadChapter && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                      <ThemedText type="smallBold" style={{ color: theme.accent, fontSize: 10 }}>
                        Último lido: {formatChapterNameForDisplay(lastReadChapter)}
                      </ThemedText>
                    </View>
                  )}
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
              {lastReadChapter && (
                <Pressable
                  onPress={() => onOpenReader(manga, lastReadChapter)}
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
                    {formatChapterNameForDisplay(lastReadChapter)}
                  </ThemedText>
                </Pressable>
              )}

              <View style={sharedStyles.divider} />

              {/* Selection Header */}
              <View style={styles.selectionControls}>
                <ThemedText type="smallBold" style={{ marginBottom: 10, marginTop: 10 }}>
                  Capítulos Baixados ({localChapters.length})
                </ThemedText>
              </View>

              {/* Search and Sort row */}
              <View style={styles.searchSortRow}>
                <View style={[styles.modalSearchWrapper, { backgroundColor: theme.backgroundElement }]}>
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

              {/* Chapters List (Overflow Y) */}
              <ScrollView
                style={{ flex: 1, marginTop: Spacing.two }}
                contentContainerStyle={{ gap: Spacing.one, paddingBottom: Spacing.four }}
                showsVerticalScrollIndicator={true}>
                {displayedChapters.map((item, idx) => (
                  <View
                    key={`${item}-${idx}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.backgroundSelected,
                      borderWidth: 1,
                      borderRadius: 6,
                      paddingLeft: Spacing.two,
                      marginBottom: Spacing.one,
                      height: 40,
                    }}>
                    <Pressable
                      onPress={() => onOpenReader(manga, item)}
                      style={({ pressed }) => [
                        {
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          height: '100%',
                          paddingRight: Spacing.two,
                          opacity: pressed ? 0.7 : 1,
                        }
                      ]}>
                      <ThemedText type="smallBold" style={{ color: theme.text, flex: 1, fontSize: 13 }} numberOfLines={1}>
                        {formatChapterNameForDisplay(item)}
                      </ThemedText>
                      <SymbolView
                        name="play.fill"
                        size={10}
                        tintColor={theme.accent}
                      />
                    </Pressable>

                    {/* Vertical Divider */}
                    <View style={{ width: 1, height: 20, backgroundColor: theme.backgroundSelected }} />

                    {/* Delete Chapter Button */}
                    <Pressable
                      onPress={() => handleDeleteChapter(item)}
                      style={({ pressed }) => [
                        {
                          paddingHorizontal: Spacing.three,
                          justifyContent: 'center',
                          height: '100%',
                          opacity: pressed ? 0.5 : 1,
                        }
                      ]}>
                      <SymbolView
                        name="xmark"
                        size={12}
                        tintColor="#f44336"
                      />
                    </Pressable>
                  </View>
                ))}
                {displayedChapters.length === 0 && (
                  <View style={styles.emptyChapters}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Nenhum capítulo baixado encontrado.
                    </ThemedText>
                  </View>
                )}
              </ScrollView>
            </View>
          </SafeAreaView>
        )}
      </ThemedView>
    </Modal>
  );
}
