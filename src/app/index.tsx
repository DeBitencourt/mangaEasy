import React, { useState, useRef, useCallback } from 'react';
import {
  TextInput,
  Pressable,
  ActivityIndicator,
  FlatList,
  Animated,
  View,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { SymbolView } from '@/components/ui/symbol-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useManga } from '@/context/manga-context';
import { useTheme } from '@/hooks/use-theme';
import { useFocusEffect } from 'expo-router';
import { toggleFavoriteLocal, getActiveFavoritesLocal } from '@/utils/database';

// Import separated components and styles
import MangaDetailsModal from '@/components/manga-details-modal';
import MangaReaderModal from '@/components/manga-reader-modal';
import { createSharedStyles } from '@/styles/shared.styles';
import { createHomeStyles } from '@/styles/home.styles';

export default function HomeScreen() {
  const theme = useTheme();
  const sharedStyles = createSharedStyles(theme);
  const styles = createHomeStyles(theme);

  const {
    activeSource,
    setActiveSource,
    fetchMangaDetails,
    clearDetails,
    searchResults,
    searching,
    searchManga,
    clearSearchResults,
    latestUpdates,
    loadingLatest,
    loadingMore,
    hasMorePages,
    fetchLatestUpdates,
    fetchMoreLatestUpdates,
    localLibrary,
    updateLastReadChapter,
    scanLibrary,
    trendingNovels,
    loadingTrending,
  } = useManga();

  const [searchInput, setSearchInput] = useState('');
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [showSourceSelector, setShowSourceSelector] = useState(false);

  // Reader Modal State
  const [isReaderOpen, setIsReaderOpen] = useState(false);
  const [selectedReaderManga, setSelectedReaderManga] = useState<any | null>(null);
  const [initialChapter, setInitialChapter] = useState<string | null>(null);

  const handleOpenReaderFromDetails = (mangaItem: any, chapterFolder: string) => {
    updateLastReadChapter(mangaItem.savePath, chapterFolder);
    setSelectedReaderManga(mangaItem);
    setInitialChapter(chapterFolder);
    setIsReaderOpen(true);
  };

  // Favorites state
  const [favoriteTitles, setFavoriteTitles] = useState<Set<string>>(new Set());

  const loadFavorites = useCallback(async () => {
    try {
      const activeFavs = await getActiveFavoritesLocal();
      setFavoriteTitles(new Set(activeFavs.map(f => f.title.toLowerCase())));
    } catch (err) {
      console.error('Erro ao buscar favoritos:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      scanLibrary();
      loadFavorites();
    }, [scanLibrary, loadFavorites])
  );

  const handleToggleFavorite = async (title: string, coverUrl: string | null, mangaUrl: string) => {
    try {
      await toggleFavoriteLocal(title, coverUrl, mangaUrl, activeSource);
      await loadFavorites();
    } catch (err) {
      console.error('Erro ao favoritar:', err);
    }
  };

  // Scroll-to-top button
  const flatListRef = useRef<FlatList>(null);
  const scrollTopOpacity = useRef(new Animated.Value(0)).current;
  const scrollTopScale = useRef(new Animated.Value(0.8)).current;
  const [showScrollTop, setShowScrollTop] = useState(false);

  const handleScroll = (event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    const shouldShow = y > 300;
    if (shouldShow && !showScrollTop) {
      setShowScrollTop(true);
      Animated.parallel([
        Animated.timing(scrollTopOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(scrollTopScale, { toValue: 1, useNativeDriver: true }),
      ]).start();
    } else if (!shouldShow && showScrollTop) {
      Animated.parallel([
        Animated.timing(scrollTopOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(scrollTopScale, { toValue: 0.8, duration: 150, useNativeDriver: true }),
      ]).start(() => setShowScrollTop(false));
    }
  };

  const scrollToTop = () => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

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
      setIsDetailsModalOpen(true);
      await fetchMangaDetails(mangaUrl);
    } catch (e) {
      showStatus('Erro ao carregar detalhes do mangá.', 'error');
      setIsDetailsModalOpen(false);
    }
  };

  return (
    <ThemedView style={sharedStyles.container}>
      <SafeAreaView style={sharedStyles.safeArea} edges={['top', 'left', 'right']}>
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
                {['mangaread.org', 'asuracomics.net', 'mangadex.org', 'novelbuddy.com'].map((src) => {
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
                        tintColor={isSelected ? theme.accent : theme.textSecondary}
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
              sharedStyles.statusBanner,
              { backgroundColor: statusMessage.type === 'success' ? '#2e7d32' : '#c62828' },
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

        {/* Main Grid View */}
        <View style={styles.contentCanvas}>
          {searching || (loadingLatest && latestUpdates.length === 0) ? (
            <View style={sharedStyles.loadingWrapper}>
              <ActivityIndicator size="large" color={theme.accent} />
              <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
                {searching ? 'Buscando títulos no site...' : 'Carregando últimos lançamentos...'}
              </ThemedText>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={searchInput.trim().length > 0 ? searchResults : latestUpdates}
              keyExtractor={(item) => item.url}
              numColumns={1}
              showsVerticalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              onEndReached={() => {
                console.log('[DEBUG] FlatList onEndReached triggered. searchInput:', searchInput, 'loadingMore:', loadingMore, 'loadingLatest:', loadingLatest);
                // Only paginate latest updates, not search results
                if (searchInput.trim().length === 0 && !loadingMore && !loadingLatest && hasMorePages) {
                  fetchMoreLatestUpdates();
                }
              }}
              onEndReachedThreshold={0.4}
              ListFooterComponent={
                loadingMore ? (
                  <View style={{ paddingVertical: 20, alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color={theme.accent} />
                    <ThemedText type="code" themeColor="textSecondary">Carregando mais...</ThemedText>
                  </View>
                ) : null
              }
              ListHeaderComponent={
                <View>
                  {/* Trending Novels – only shown for NovelBuddy when not searching */}
                  {activeSource === 'novelbuddy.com' && searchInput.trim().length === 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <View style={[styles.headerContainer, { borderBottomColor: theme.backgroundSelected, marginBottom: 10 }]}>
                        <View style={[styles.headerMarker, { backgroundColor: '#f59e0b' }]} />
                        <ThemedText type="smallBold" themeColor="text" style={styles.gridHeaderTitle}>
                          🔥 TRENDING NOVELS
                        </ThemedText>
                      </View>
                      {loadingTrending ? (
                        <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                          <ActivityIndicator size="small" color={theme.accent} />
                        </View>
                      ) : (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ paddingHorizontal: 12, gap: 10 }}
                        >
                          {trendingNovels.map((novel, idx) => (
                            <Pressable
                              key={novel.url}
                              onPress={() => handleSelectManga(novel.url)}
                              style={({ pressed }) => ({
                                width: 90,
                                opacity: pressed ? 0.75 : 1,
                              })}
                            >
                              <View style={{
                                width: 90,
                                height: 130,
                                borderRadius: 8,
                                overflow: 'hidden',
                                backgroundColor: theme.backgroundElement,
                                borderWidth: 1,
                                borderColor: theme.backgroundSelected,
                              }}>
                                <Image
                                  source={{ uri: novel.coverUrl }}
                                  style={{ width: '100%', height: '100%' }}
                                  contentFit="cover"
                                />
                                {/* Rank badge */}
                                <View style={{
                                  position: 'absolute',
                                  top: 4,
                                  left: 4,
                                  width: 22,
                                  height: 22,
                                  borderRadius: 4,
                                  backgroundColor: idx === 0 ? '#f59e0b' : idx === 1 ? '#94a3b8' : idx === 2 ? '#f97316' : 'rgba(0,0,0,0.6)',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}>
                                  <ThemedText style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>
                                    {idx + 1}
                                  </ThemedText>
                                </View>
                                {/* Gradient overlay at bottom */}
                                <View style={{
                                  position: 'absolute',
                                  bottom: 0,
                                  left: 0,
                                  right: 0,
                                  height: 40,
                                  backgroundColor: 'rgba(0,0,0,0.55)',
                                }} />
                              </View>
                              <ThemedText
                                type="small"
                                themeColor="text"
                                numberOfLines={2}
                                style={{ marginTop: 5, fontSize: 11, lineHeight: 14 }}
                              >
                                {novel.title}
                              </ThemedText>
                            </Pressable>
                          ))}
                        </ScrollView>
                      )}
                    </View>
                  )}

                  {/* Latest Updates header */}
                  <View style={[styles.headerContainer, { borderBottomColor: theme.backgroundSelected }]}>
                    <View style={[styles.headerMarker, { backgroundColor: theme.accent }]} />
                    <ThemedText type="smallBold" themeColor="text" style={styles.gridHeaderTitle}>
                      {searchInput.trim().length > 0 ? 'RESULTADOS DA BUSCA' : 'ÚLTIMOS LANÇAMENTOS'}
                    </ThemedText>
                  </View>
                </View>
              }
              renderItem={({ item }) => {
                const ratingVal = item.rating ? parseFloat(item.rating) : (item.title && item.title.length > 0 ? (3.5 + (item.title.charCodeAt(0) % 15) / 10) : 4.0);
                const filledStars = Math.round(ratingVal);
                
                const isFav = favoriteTitles.has(item.title ? item.title.toLowerCase() : '');

                return (
                  <Pressable
                    onPress={() => handleSelectManga(item.url)}
                    style={({ pressed }) => [
                      styles.mangaCard,
                      {
                        backgroundColor: theme.backgroundElement,
                        opacity: pressed ? 0.9 : 1,
                      },
                    ]}>
                    <View style={{ position: 'relative' }}>
                      <Image
                        source={{ uri: item.coverUrl }}
                        style={styles.mangaCardImage}
                        contentFit="cover"
                      />
                      {/* Star overlay button */}
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          handleToggleFavorite(item.title, item.coverUrl, item.url);
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
                          size={12}
                          tintColor={isFav ? '#FFD700' : '#FFF'}
                        />
                      </Pressable>
                    </View>
                    <View style={styles.mangaCardInfo}>
                      <ThemedText type="defaultSemiBold" numberOfLines={2} style={styles.mangaCardTitle}>
                        {item.title}
                      </ThemedText>

                      {/* Rating Row */}
                      <View style={styles.ratingRow}>
                        {Array.from({ length: 5 }).map((_, index) => {
                          const isFilled = index < filledStars;
                          return (
                            <SymbolView
                              key={index}
                              name={isFilled ? 'star.fill' : 'star'}
                              size={14}
                              tintColor={isFilled ? '#FFC107' : theme.textSecondary}
                              style={styles.starIcon}
                            />
                          );
                        })}
                        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.ratingText}>
                          {ratingVal.toFixed(1)}
                        </ThemedText>
                      </View>

                      {/* Chapters Row */}
                      {item.chapters && item.chapters.length > 0 ? (
                        <View style={styles.chaptersList}>
                          {item.chapters.slice(0, 2).map((chap, idx) => (
                            <View key={idx} style={styles.chapterRow}>
                              <View style={[styles.chapterPill, { backgroundColor: theme.backgroundSelected }]}>
                                <ThemedText type="smallBold" themeColor="text" style={styles.chapterPillText}>
                                  {chap.name}
                                </ThemedText>
                              </View>
                              <ThemedText type="small" themeColor="textSecondary" style={styles.chapterDate}>
                                {chap.date}
                              </ThemedText>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <View style={styles.chaptersList}>
                          <View style={styles.chapterRow}>
                            <View style={[styles.chapterPill, { backgroundColor: theme.backgroundSelected }]}>
                              <ThemedText type="smallBold" themeColor="text" style={styles.chapterPillText}>
                                Ver Capítulos
                              </ThemedText>
                            </View>
                          </View>
                        </View>
                      )}
                    </View>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyGridState}>
                  <SymbolView name="questionmark.circle" size={32} tintColor={theme.textSecondary} />
                  <ThemedText type="smallBold" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
                    Nenhum resultado encontrado
                  </ThemedText>
                </View>
              }
              contentContainerStyle={{ paddingBottom: BottomTabInset + Spacing.five }}
              refreshing={loadingLatest}
              onRefresh={fetchLatestUpdates}
            />
          )}
        </View>
      </SafeAreaView>

      {/* Manga Details Overlay Modal */}
      <MangaDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        onShowToast={showStatus}
        onOpenReader={handleOpenReaderFromDetails}
      />

      {/* Reader Modal */}
      <MangaReaderModal
        isOpen={isReaderOpen}
        onClose={() => {
          setIsReaderOpen(false);
          setInitialChapter(null);
        }}
        manga={selectedReaderManga ? localLibrary.find(l => l.savePath === selectedReaderManga.savePath) || selectedReaderManga : null}
        initialChapter={initialChapter}
      />

      {/* Floating Scroll-to-Top Button */}
      {showScrollTop && (
        <Animated.View
          style={{
            position: 'absolute',
            bottom: BottomTabInset + 20,
            right: 20,
            opacity: scrollTopOpacity,
            transform: [{ scale: scrollTopScale }],
            zIndex: 100,
          }}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={scrollToTop}
            style={({ pressed }) => ({
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: theme.accent,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
              shadowColor: theme.accent,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.5,
              shadowRadius: 8,
              elevation: 8,
            })}
          >
            <SymbolView name="arrow.up" size={18} tintColor="#000000" />
          </Pressable>
        </Animated.View>
      )}
    </ThemedView>
  );
}
