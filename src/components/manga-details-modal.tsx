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
    startDownload,
    localLibrary,
  } = useManga();

  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [searchChapter, setSearchChapter] = useState('');
  const [sortAscending, setSortAscending] = useState(false);
  const [selectedType, setSelectedType] = useState<string>(''); // Vazio por padrão
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);

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
    }
  }, [isOpen]);

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
    setSelectedChapters(mangaDetails.chapters.filter(ch => !isDownloaded(ch)));
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

    const matched = mangaDetails.chapters.filter((ch) => {
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
    startDownload(selectedChapters, selectedType || undefined);
    onClose();
    onShowToast('Download iniciado! Acompanhe na aba Downloads.', 'success');
    setSelectedChapters([]);
  };

  // Filter chapters by search input
  const filteredChapters = mangaDetails
    ? mangaDetails.chapters.filter((ch) =>
        ch.toLowerCase().includes(searchChapter.toLowerCase())
      )
    : [];

  const displayedChapters = sortAscending
    ? [...filteredChapters].reverse()
    : filteredChapters;

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

                    {/* Custom Type Override Dropdown */}
                    {!mangaDetails.source?.toLowerCase().includes('asura') && (
                      <View style={{ position: 'relative', marginTop: 6, zIndex: 10 }}>
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
                                    borderBottomWidth: typeOption === 'Manhua' ? 0 : 0.5,
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
                    Capítulos ({selectedChapters.length}/{mangaDetails.chapters.length})
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

                {/* Chapters List */}
                <ScrollView
                  style={styles.chaptersListWrapper}
                  contentContainerStyle={styles.chaptersListContent}
                  nestedScrollEnabled={true}
                  showsVerticalScrollIndicator={true}>
                  {displayedChapters.map((item, idx) => {
                    const isChecked = selectedChapters.includes(item);
                    const alreadyDownloaded = isDownloaded(item);
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
                        {mangaDetails?.chapterUrls?.[item] && (
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

    {/* Online Reader Modal – opened when user taps the eye icon on a chapter */}
    {mangaDetails && (
      <OnlineReaderModal
        isOpen={isOnlineReaderOpen}
        onClose={() => {
          setIsOnlineReaderOpen(false);
          setOnlineReaderChapter(null);
        }}
        mangaTitle={mangaDetails.title}
        mangaType={(mangaDetails as any).mangaType}
        chapters={mangaDetails.chapters}
        chapterUrls={mangaDetails.chapterUrls || {}}
        initialChapter={onlineReaderChapter}
      />
    )}
  </>
  );
}
