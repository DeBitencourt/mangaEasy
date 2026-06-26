import React, { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Modal,
  FlatList,
  Platform,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useManga } from '@/context/manga-context';
import { useTheme } from '@/hooks/use-theme';

export default function HomeScreen() {
  const theme = useTheme();
  const {
    activeSource,
    setActiveSource,
    mangaDetails,
    loadingDetails,
    fetchMangaDetails,
    clearDetails,
    startDownload,
    searchResults,
    searching,
    searchManga,
    clearSearchResults,
  } = useManga();

  const [searchInput, setSearchInput] = useState('');
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [searchChapter, setSearchChapter] = useState('');
  const [sortAscending, setSortAscending] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [showSourceSelector, setShowSourceSelector] = useState(false);

  // Range selector state
  const [isRangeActive, setIsRangeActive] = useState(false);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  // Info message state
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | null }>({
    text: '',
    type: null,
  });

  const showStatus = (text: string, type: 'success' | 'error') => {
    setStatusMessage({ text, type });
    setTimeout(() => {
      setStatusMessage({ text: '', type: null });
    }, 4000);
  };

  const handleSearch = async () => {
    if (!searchInput.trim()) {
      showStatus('Por favor, insira um termo para busca.', 'error');
      return;
    }
    try {
      await searchManga(searchInput);
      showStatus('Busca concluída!', 'success');
    } catch (e) {
      showStatus('Erro ao realizar busca.', 'error');
    }
  };

  const handleSelectManga = async (mangaUrl: string) => {
    try {
      setSelectedChapters([]);
      setIsRangeActive(false);
      setSearchChapter('');
      setIsDetailsModalOpen(true);
      await fetchMangaDetails(mangaUrl);
    } catch (e) {
      showStatus('Erro ao carregar detalhes do mangá.', 'error');
      setIsDetailsModalOpen(false);
    }
  };

  const toggleChapter = (chapter: string) => {
    setSelectedChapters((prev) =>
      prev.includes(chapter) ? prev.filter((c) => c !== chapter) : [...prev, chapter]
    );
  };

  const handleSelectAll = () => {
    if (!mangaDetails) return;
    setSelectedChapters(mangaDetails.chapters);
  };

  const handleSelectNone = () => {
    setSelectedChapters([]);
  };

  const applyRangeSelection = () => {
    if (!mangaDetails) return;
    const startNum = parseInt(rangeStart);
    const endNum = parseInt(rangeEnd);

    if (isNaN(startNum) || isNaN(endNum)) {
      showStatus('Por favor, insira números válidos para o intervalo.', 'error');
      return;
    }

    const min = Math.min(startNum, endNum);
    const max = Math.max(startNum, endNum);

    const matched = mangaDetails.chapters.filter((ch) => {
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

    showStatus(`${matched.length} capítulos selecionados pelo intervalo.`, 'success');
    setIsRangeActive(false);
    setRangeStart('');
    setRangeEnd('');
  };

  const handleStartDownload = () => {
    if (selectedChapters.length === 0) {
      showStatus('Selecione pelo menos um capítulo para baixar.', 'error');
      return;
    }
    startDownload(selectedChapters);
    setIsDetailsModalOpen(false);
    showStatus('Download iniciado! Acompanhe na aba Downloads.', 'success');
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

  // Mock initial presets
  const PRESET_MANGAS = [
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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {/* Top Control Bar with Search and Source Dropdown */}
        <View style={styles.topBar}>
          <View style={[styles.searchBarWrapper, { backgroundColor: theme.backgroundElement }]}>
            <SymbolView name="magnifyingglass" size={14} tintColor={theme.textSecondary} />
            <TextInput
              value={searchInput}
              onChangeText={setSearchInput}
              onSubmitEditing={handleSearch}
              placeholder="Buscar mangá por título..."
              placeholderTextColor={theme.textSecondary}
              style={[styles.searchBarInput, { color: theme.text }]}
            />
            {searchInput.length > 0 && (
              <Pressable
                onPress={() => {
                  setSearchInput('');
                  clearSearchResults();
                }}
                style={styles.clearSearchInputBtn}>
                <SymbolView name="xmark.circle.fill" size={14} tintColor={theme.textSecondary} />
              </Pressable>
            )}
          </View>

          {/* Source Dropdown Trigger */}
          <View style={styles.dropdownContainer}>
            <Pressable
              onPress={() => setShowSourceSelector(!showSourceSelector)}
              style={({ pressed }) => [
                styles.dropdownTrigger,
                {
                  backgroundColor: theme.backgroundElement,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}>
              <ThemedText type="code" style={styles.dropdownLabel} numberOfLines={1}>
                {activeSource}
              </ThemedText>
              <SymbolView name="chevron.down" size={10} tintColor={theme.text} style={{ marginLeft: 4 }} />
            </Pressable>

            {/* Dropdown Menu Overlay */}
            {showSourceSelector && (
              <ThemedView type="backgroundElement" style={styles.dropdownMenu}>
                {['mangaread.org', 'asuracomics.net', 'manganelo.com'].map((src) => {
                  const isSelected = activeSource === src;
                  return (
                    <Pressable
                      key={src}
                      onPress={() => {
                        setActiveSource(src);
                        setShowSourceSelector(false);
                        clearSearchResults();
                        clearDetails();
                      }}
                      style={[
                        styles.dropdownItem,
                        isSelected && { backgroundColor: theme.backgroundSelected },
                      ]}>
                      <SymbolView
                        name={isSelected ? 'checkmark.circle.fill' : 'circle'}
                        size={12}
                        tintColor={isSelected ? '#8B5CF6' : theme.textSecondary}
                      />
                      <ThemedText
                        type="small"
                        themeColor={isSelected ? 'text' : 'textSecondary'}
                        style={styles.dropdownItemText}>
                        {src}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </ThemedView>
            )}
          </View>
        </View>

        {/* Status Toast Banner */}
        {statusMessage.text !== '' && (
          <View
            style={[
              styles.statusBanner,
              { backgroundColor: statusMessage.type === 'success' ? '#2e7d32' : '#c62828' },
            ]}>
            <SymbolView
              name={statusMessage.type === 'success' ? 'checkmark.circle' : 'exclamationmark.triangle'}
              size={16}
              tintColor="#fff"
            />
            <ThemedText type="smallBold" style={styles.statusText}>
              {statusMessage.text}
            </ThemedText>
          </View>
        )}

        {/* Main Grid View */}
        <View style={styles.contentCanvas}>
          {searching ? (
            <View style={styles.loadingWrapper}>
              <ActivityIndicator size="large" color="#8B5CF6" />
              <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
                Buscando títulos no site...
              </ThemedText>
            </View>
          ) : (
            <FlatList
              data={searchResults.length > 0 ? searchResults : PRESET_MANGAS}
              keyExtractor={(item) => item.url}
              numColumns={2}
              columnWrapperStyle={styles.gridRow}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.gridHeaderTitle}>
                  {searchResults.length > 0 ? 'Resultados da Busca' : 'Mangás Recomendados'}
                </ThemedText>
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => handleSelectManga(item.url)}
                  style={({ pressed }) => [
                    styles.mangaCard,
                    {
                      backgroundColor: theme.backgroundElement,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}>
                  <Image
                    source={{ uri: item.coverUrl }}
                    style={styles.mangaCardImage}
                    contentFit="cover"
                  />
                  <View style={styles.mangaCardInfo}>
                    <ThemedText type="smallBold" numberOfLines={2} style={styles.mangaCardTitle}>
                      {item.title}
                    </ThemedText>
                  </View>
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={styles.emptyGridState}>
                  <SymbolView name="questionmark.circle" size={32} tintColor={theme.textSecondary} />
                  <ThemedText type="smallBold" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
                    Nenhum resultado encontrado
                  </ThemedText>
                </ThemedText>
              }
              contentContainerStyle={{ paddingBottom: BottomTabInset + Spacing.five }}
            />
          )}
        </View>
      </SafeAreaView>

      {/* Manga Details Overlay Modal */}
      <Modal
        visible={isDetailsModalOpen}
        animationType="slide"
        onRequestClose={() => setIsDetailsModalOpen(false)}>
        <ThemedView style={styles.modalOverlay}>
          {loadingDetails ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator size="large" color="#8B5CF6" />
              <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
                Carregando detalhes do mangá...
              </ThemedText>
              <Pressable
                onPress={() => setIsDetailsModalOpen(false)}
                style={[styles.cancelFetchBtn, { borderColor: theme.backgroundSelected }]}>
                <ThemedText type="smallBold" themeColor="textSecondary">Cancelar</ThemedText>
              </Pressable>
            </View>
          ) : (
            mangaDetails && (
              <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <Pressable onPress={() => setIsDetailsModalOpen(false)} style={styles.modalBackBtn}>
                    <SymbolView name="chevron.left" size={18} tintColor={theme.text} />
                    <ThemedText type="smallBold" style={{ marginLeft: 4 }}>Voltar</ThemedText>
                  </Pressable>
                  <ThemedText type="smallBold" style={styles.modalHeaderTitle} numberOfLines={1}>
                    Detalhes do Mangá
                  </ThemedText>
                  <View style={{ width: 60 }} />
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
                    </View>
                  </View>

                  {/* Synopsis */}
                  <ThemedView type="backgroundElement" style={styles.synopsisCard}>
                    <ThemedText type="smallBold" style={{ marginBottom: 4 }}>Sinopse</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.synopsisText}>
                      {mangaDetails.synopsis}
                    </ThemedText>
                  </ThemedView>

                  <View style={styles.divider} />

                  {/* Selection Header */}
                  <View style={styles.selectionControls}>
                    <ThemedText type="smallBold">
                      Capítulos ({selectedChapters.length}/{mangaDetails.chapters.length})
                    </ThemedText>
                    <View style={styles.bulkButtons}>
                      <Pressable onPress={handleSelectAll} style={styles.actionPill}>
                        <ThemedText type="code" style={styles.actionPillText}>Todos</ThemedText>
                      </Pressable>
                      <Pressable onPress={handleSelectNone} style={styles.actionPill}>
                        <ThemedText type="code" style={styles.actionPillText}>Nenhum</ThemedText>
                      </Pressable>
                      <Pressable
                        onPress={() => setIsRangeActive(!isRangeActive)}
                        style={[styles.actionPill, isRangeActive && styles.actionPillActive]}>
                        <ThemedText type="code" style={[styles.actionPillText, isRangeActive && styles.actionPillTextActive]}>
                          Intervalo
                        </ThemedText>
                      </Pressable>
                    </View>
                  </View>

                  {/* Range selection panel */}
                  {isRangeActive && (
                    <View style={styles.rangeBox}>
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
                          style={[styles.rangeInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
                        />
                        <ThemedText type="small" style={{ marginHorizontal: Spacing.two }}>até</ThemedText>
                        <TextInput
                          value={rangeEnd}
                          onChangeText={setRangeEnd}
                          keyboardType="numeric"
                          placeholder="Ex: 20"
                          placeholderTextColor={theme.textSecondary}
                          style={[styles.rangeInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
                        />
                        <Pressable onPress={applyRangeSelection} style={styles.rangeApplyBtn}>
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
                        tintColor={sortAscending ? '#8B5CF6' : theme.text}
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
                      return (
                        <Pressable
                          key={`${item}-${idx}`}
                          onPress={() => toggleChapter(item)}
                          style={({ pressed }) => [
                            styles.chapterRow,
                            {
                              backgroundColor: isChecked ? theme.backgroundSelected : theme.background,
                              borderColor: isChecked ? '#8B5CF6' : theme.backgroundElement,
                              opacity: pressed ? 0.8 : 1,
                            },
                          ]}>
                          <ThemedText type="small" themeColor={isChecked ? 'text' : 'textSecondary'}>
                            {item}
                          </ThemedText>
                          <SymbolView
                            name={isChecked ? 'checkmark.square.fill' : 'square'}
                            size={16}
                            tintColor={isChecked ? '#8B5CF6' : theme.textSecondary}
                          />
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
                        { opacity: pressed ? 0.9 : 1 },
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
    zIndex: 10,
  },
  searchBarWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  searchBarInput: {
    flex: 1,
    height: '100%',
    marginLeft: Spacing.one,
    fontSize: 14,
  },
  clearSearchInputBtn: {
    padding: Spacing.one,
  },
  dropdownContainer: {
    position: 'relative',
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    justifyContent: 'center',
    maxWidth: 140,
  },
  dropdownLabel: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  dropdownMenu: {
    position: 'absolute',
    top: 48,
    right: 0,
    width: 160,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: Spacing.one,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 99,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: Spacing.one,
  },
  dropdownItemText: {
    fontSize: 12,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two,
    marginHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.two,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 12,
  },
  contentCanvas: {
    flex: 1,
    paddingHorizontal: Spacing.three,
  },
  loadingWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridHeaderTitle: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.two,
    marginTop: Spacing.one,
  },
  gridRow: {
    justifyContent: 'space-between',
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  mangaCard: {
    flex: 1,
    borderRadius: Spacing.three,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  mangaCardImage: {
    width: '100%',
    aspectRatio: 0.72,
    backgroundColor: '#333',
  },
  mangaCardInfo: {
    padding: Spacing.two,
    minHeight: 52,
    justifyContent: 'center',
  },
  mangaCardTitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  emptyGridState: {
    paddingTop: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Details Modal styles
  modalOverlay: {
    flex: 1,
  },
  modalLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelFetchBtn: {
    marginTop: Spacing.four,
    borderWidth: 1,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
  },
  modalHeader: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  modalBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.one,
    width: 60,
  },
  modalHeaderTitle: {
    fontSize: 15,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  mangaMetaBlock: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
  },
  detailCoverImage: {
    width: 90,
    height: 125,
    borderRadius: Spacing.two,
    backgroundColor: '#333',
  },
  detailMetaInfo: {
    flex: 1,
    gap: 4,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  detailSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  synopsisCard: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  synopsisText: {
    fontSize: 12,
    lineHeight: 16,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  selectionControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bulkButtons: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  actionPill: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
  },
  actionPillActive: {
    backgroundColor: '#8B5CF6',
  },
  actionPillText: {
    fontSize: 11,
  },
  actionPillTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  rangeBox: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    padding: Spacing.two,
    borderRadius: Spacing.two,
    gap: Spacing.two,
  },
  rangeText: {
    fontSize: 12,
  },
  rangeInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  rangeInput: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderRadius: Spacing.one,
    paddingHorizontal: Spacing.two,
    fontSize: 12,
    textAlign: 'center',
  },
  rangeApplyBtn: {
    backgroundColor: '#8B5CF6',
    height: 36,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.one,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchSortRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  modalSearchWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    height: 38,
  },
  modalSearchInput: {
    flex: 1,
    height: '100%',
    marginLeft: Spacing.one,
    fontSize: 12,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    height: 38,
    borderRadius: Spacing.two,
    borderWidth: 0.5,
  },
  sortButtonText: {
    fontSize: 12,
    marginLeft: Spacing.one,
  },
  chaptersListWrapper: {
    maxHeight: 280,
  },
  chaptersListContent: {
    gap: Spacing.one,
  },
  chapterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 0.5,
  },
  emptyChapters: {
    padding: Spacing.three,
    alignItems: 'center',
  },
  downloadBtn: {
    backgroundColor: '#8B5CF6',
    height: 48,
    borderRadius: Spacing.two,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
    marginBottom: Spacing.three,
  },
  downloadBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
});
