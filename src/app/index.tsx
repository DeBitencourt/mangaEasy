import React, { useState, useRef } from 'react';
import {
  TextInput,
  Pressable,
  ActivityIndicator,
  FlatList,
  Animated,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { SymbolView } from '@/components/ui/symbol-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useManga } from '@/context/manga-context';
import { useTheme } from '@/hooks/use-theme';

// Import separated components and styles
import MangaDetailsModal from '@/components/manga-details-modal';
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
    fetchLatestUpdates,
    fetchMoreLatestUpdates,
  } = useManga();

  const [searchInput, setSearchInput] = useState('');
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [showSourceSelector, setShowSourceSelector] = useState(false);

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
                {['mangaread.org', 'asuracomics.net'].map((src) => {
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
                if (searchInput.trim().length === 0 && !loadingMore && !loadingLatest) {
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
                <View style={[styles.headerContainer, { borderBottomColor: theme.backgroundSelected }]}>
                  <View style={[styles.headerMarker, { backgroundColor: theme.accent }]} />
                  <ThemedText type="smallBold" themeColor="text" style={styles.gridHeaderTitle}>
                    {searchInput.trim().length > 0 ? 'RESULTADOS DA BUSCA' : 'ÚLTIMOS LANÇAMENTOS'}
                  </ThemedText>
                </View>
              }
              renderItem={({ item }) => {
                const ratingVal = item.rating ? parseFloat(item.rating) : (3.5 + (item.title.charCodeAt(0) % 15) / 10);
                const filledStars = Math.round(ratingVal);
                
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
                    <Image
                      source={{ uri: item.coverUrl }}
                      style={styles.mangaCardImage}
                      contentFit="cover"
                    />
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
