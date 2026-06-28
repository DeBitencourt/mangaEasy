import React, { useState, useCallback } from 'react';
import {
  Pressable,
  ScrollView,
  TextInput,
  View,
  ActivityIndicator,
  Platform,
  Modal,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { SymbolView } from '@/components/ui/symbol-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useManga, HistoryItem } from '@/context/manga-context';
import { useTheme } from '@/hooks/use-theme';
import { useFocusEffect } from 'expo-router';
import { toggleFavoriteLocal, getActiveFavoritesLocal } from '@/utils/database';

// Import separated components and styles
import MangaReaderModal from '@/components/manga-reader-modal';
import LocalMangaDetailsModal from '@/components/local-manga-details-modal';
import SyncSettingsModal from '@/components/sync-settings-modal';
import { createSharedStyles } from '@/styles/shared.styles';
import { createLibraryStyles } from '@/styles/library.styles';

export default function LibraryScreen() {
  const theme = useTheme();
  const sharedStyles = createSharedStyles(theme);
  const styles = createLibraryStyles(theme);

  const {
    localLibrary,
    loadingLibrary,
    scanLibrary,
    deleteManga,
    updateLastReadChapter,
  } = useManga();

  // Reader Modal State
  const [isReaderOpen, setIsReaderOpen] = useState(false);
  const [selectedManga, setSelectedManga] = useState<HistoryItem | null>(null);
  const [initialChapter, setInitialChapter] = useState<string | null>(null);

  // Local Details Modal State
  const [isLocalDetailsOpen, setIsLocalDetailsOpen] = useState(false);

  // Custom Delete Modal State
  const [mangaToDelete, setMangaToDelete] = useState<HistoryItem | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);

  // Sync Modal State
  const [isSyncOpen, setIsSyncOpen] = useState(false);

  // Status Toast State
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' }>({
    text: '',
    type: 'success',
  });

  const showStatus = (text: string, type: 'success' | 'error') => {
    setStatusMessage({ text, type });
    setTimeout(() => {
      setStatusMessage({ text: '', type: 'success' });
    }, 3000);
  };

  // Library search
  const [librarySearch, setLibrarySearch] = useState('');

  // Favorites state
  const [favoriteTitles, setFavoriteTitles] = useState<Set<string>>(new Set());

  const loadFavorites = useCallback(async () => {
    try {
      const activeFavs = await getActiveFavoritesLocal();
      setFavoriteTitles(new Set(activeFavs.map(f => f.title.toLowerCase())));
    } catch (err) {
      console.error('Erro ao buscar favoritos na biblioteca:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      scanLibrary();
      loadFavorites();
    }, [scanLibrary, loadFavorites])
  );

  const handleToggleFavorite = async (title: string, coverUrl: string | null) => {
    try {
      await toggleFavoriteLocal(title, coverUrl);
      await loadFavorites();
    } catch (err) {
      console.error('Erro ao favoritar/desfavoritar:', err);
    }
  };

  const openLocalDetails = (item: HistoryItem) => {
    setSelectedManga(item);
    setIsLocalDetailsOpen(true);
  };

  const handleOpenReaderFromDetails = (mangaItem: HistoryItem, chapterFolder: string) => {
    // Persist last read chapter
    updateLastReadChapter(mangaItem.savePath, chapterFolder);
    setIsLocalDetailsOpen(false);
    setTimeout(() => {
      setSelectedManga(mangaItem);
      setInitialChapter(chapterFolder);
      setIsReaderOpen(true);
    }, 300);
  };

  const confirmDelete = (item: HistoryItem) => {
    setMangaToDelete(item);
    setShowDeleteConfirm(true);
  };

  const handleExecuteDelete = async () => {
    if (!mangaToDelete) return;
    setShowDeleteConfirm(false);
    
    try {
      await deleteManga(mangaToDelete.mangaTitle, mangaToDelete.savePath);
      setTimeout(() => {
        setShowDeleteSuccess(true);
        setMangaToDelete(null);
      }, 300);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <ThemedView style={sharedStyles.container}>
      <SafeAreaView style={sharedStyles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loadingLibrary}
              onRefresh={scanLibrary}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          }>
          
          {/* Header */}
          <ThemedView style={[styles.header, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
            <View style={{ flex: 1 }}>
              <ThemedText type="subtitle" style={styles.title}>
                Biblioteca
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Gerencie seus downloads concluídos e leia localmente offline
              </ThemedText>
            </View>
            <Pressable
              onPress={() => setIsSyncOpen(true)}
              style={({ pressed }) => [
                {
                  padding: 8,
                  borderRadius: 20,
                  backgroundColor: theme.backgroundElement,
                  borderWidth: 0.5,
                  borderColor: theme.backgroundSelected,
                  opacity: pressed ? 0.8 : 1,
                  marginLeft: Spacing.two,
                }
              ]}
            >
              <SymbolView name="arrow.triangle.2.circlepath" size={16} tintColor={theme.accent} />
            </Pressable>
          </ThemedView>

          {/* History / Completed Downloads */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <SymbolView name="books.vertical.fill" size={16} tintColor={theme.accent} />
              <ThemedText type="smallBold" style={styles.sectionTitle}>
                Mangás Baixados ({localLibrary.length})
              </ThemedText>
            </View>

            {loadingLibrary && localLibrary.length === 0 ? (
              <View style={{ padding: Spacing.four, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={theme.accent} />
                <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
                  Escaneando armazenamento local...
                </ThemedText>
              </View>
            ) : (
              <>
                {/* Search bar */}
                {localLibrary.length > 0 && (
                  <View style={[styles.searchBarRow, { backgroundColor: theme.backgroundElement }]}>
                    <SymbolView name="magnifyingglass" size={13} tintColor={theme.textSecondary} />
                    <TextInput
                      value={librarySearch}
                      onChangeText={setLibrarySearch}
                      placeholder="Buscar na biblioteca..."
                      placeholderTextColor={theme.textSecondary}
                      style={[styles.searchBarInput, { color: theme.text }]}
                    />
                    {librarySearch.length > 0 && (
                      <Pressable onPress={() => setLibrarySearch('')}>
                        <SymbolView name="xmark.circle.fill" size={14} tintColor={theme.textSecondary} />
                      </Pressable>
                    )}
                  </View>
                )}

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  {localLibrary
                    .filter(item =>
                      item.mangaTitle.toLowerCase().includes(librarySearch.toLowerCase())
                    )
                    .map((item) => {
                      const isFav = favoriteTitles.has(item.mangaTitle.toLowerCase());
                      return (
                        <Pressable
                          key={item.id}
                          onPress={() => openLocalDetails(item)}
                          style={({ pressed }) => [
                            {
                              width: '31.3%',
                              aspectRatio: 2/3,
                              borderRadius: 8,
                              overflow: 'hidden',
                              position: 'relative',
                              marginBottom: 6,
                              backgroundColor: theme.backgroundElement,
                              borderWidth: 0.5,
                              borderColor: 'rgba(255, 255, 255, 0.05)',
                              opacity: pressed ? 0.9 : 1,
                            }
                          ]}>
                          <Image
                            source={{ uri: item.coverUrl }}
                            style={{ width: '100%', height: '100%' }}
                            contentFit="cover"
                          />
                          
                          {/* Star overlay button */}
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation();
                              handleToggleFavorite(item.mangaTitle, item.coverUrl);
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
                              name={isFav ? 'star.fill' : 'star'}
                              size={14}
                              tintColor={isFav ? '#FFD700' : '#FFF'}
                            />
                          </Pressable>

                          {/* Title overlay at the bottom */}
                          <View style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            backgroundColor: 'rgba(0,0,0,0.7)',
                            padding: 4,
                          }}>
                            <ThemedText type="code" numberOfLines={1} style={{ fontSize: 9, color: '#FFF', textAlign: 'center' }}>
                              {item.mangaTitle}
                            </ThemedText>
                          </View>
                        </Pressable>
                      );
                    })}
                </View>

                {/* No results from search */}
                {localLibrary.length > 0 &&
                  localLibrary.filter(item =>
                    item.mangaTitle.toLowerCase().includes(librarySearch.toLowerCase())
                  ).length === 0 && (
                    <View style={{ padding: Spacing.three, alignItems: 'center' }}>
                      <ThemedText type="small" themeColor="textSecondary">Nenhum resultado encontrado.</ThemedText>
                    </View>
                  )}

                {/* Empty Library State */}
                {localLibrary.length === 0 && (
                  <ThemedView type="backgroundElement" style={styles.emptyState}>
                    <SymbolView name="square.and.arrow.down" size={32} tintColor={theme.textSecondary} />
                    <ThemedText type="smallBold" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
                      Nenhum mangá baixado no dispositivo.
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.emptySubtitle}>
                      Vá para a aba "Baixar" para selecionar e salvar seus capítulos favoritos!
                    </ThemedText>
                  </ThemedView>
                )}
              </>
            )}
          </View>

          <View style={{ height: BottomTabInset + Spacing.five }} />
        </ScrollView>
      </SafeAreaView>

      {/* Reader Modal */}
      <MangaReaderModal
        isOpen={isReaderOpen}
        onClose={() => {
          setIsReaderOpen(false);
          setInitialChapter(null);
          // Return to manga details instead of the library screen
          setTimeout(() => {
            if (selectedManga) setIsLocalDetailsOpen(true);
          }, 300);
        }}
        manga={selectedManga}
        initialChapter={initialChapter}
      />

      {/* Local Manga Details Modal */}
      <LocalMangaDetailsModal
        isOpen={isLocalDetailsOpen}
        onClose={() => setIsLocalDetailsOpen(false)}
        manga={selectedManga}
        onOpenReader={handleOpenReaderFromDetails}
        onDelete={confirmDelete}
      />

      {/* Custom Delete Confirmation Modal */}
      <Modal
        visible={showDeleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteConfirm(false)}>
        <View style={styles.modalOverlay}>
          <ThemedView type="backgroundElement" style={styles.confirmModalBox}>
            <SymbolView name="exclamationmark.triangle.fill" size={36} tintColor="#f44336" />
            
            <ThemedText type="subtitle" style={[styles.confirmModalTitle, { color: '#f44336' }]}>
              Excluir Mangá?
            </ThemedText>
            
            <ThemedText type="small" themeColor="textSecondary" style={styles.confirmModalText}>
              Deseja excluir permanentemente o mangá <ThemedText type="smallBold" style={{ color: theme.text }}>"{mangaToDelete?.mangaTitle}"</ThemedText> e todos os seus capítulos baixados? Esta ação não pode ser desfeita.
            </ThemedText>

            <View style={styles.confirmModalButtons}>
              <Pressable
                onPress={() => setShowDeleteConfirm(false)}
                style={({ pressed }) => [
                  styles.confirmModalBtn,
                  styles.cancelBtn,
                  pressed && { opacity: 0.8 }
                ]}>
                <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>
                  Cancelar
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={handleExecuteDelete}
                style={({ pressed }) => [
                  styles.confirmModalBtn,
                  styles.deleteConfirmBtn,
                  pressed && { opacity: 0.8 }
                ]}>
                <ThemedText type="smallBold" style={{ color: '#ffffff' }}>
                  Excluir
                </ThemedText>
              </Pressable>
            </View>
          </ThemedView>
        </View>
      </Modal>

      {/* Custom Success Modal */}
      <Modal
        visible={showDeleteSuccess}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteSuccess(false)}>
        <View style={styles.modalOverlay}>
          <ThemedView type="backgroundElement" style={styles.successModalBox}>
            <SymbolView name="checkmark.circle.fill" size={42} tintColor={theme.accent} />
            
            <ThemedText type="subtitle" style={styles.successModalTitle}>
              Sucesso!
            </ThemedText>
            
            <ThemedText type="small" themeColor="textSecondary" style={styles.successModalText}>
              O mangá foi removido do dispositivo com sucesso.
            </ThemedText>

            <Pressable
              onPress={() => setShowDeleteSuccess(false)}
              style={({ pressed }) => [
                styles.successCloseBtn,
                { backgroundColor: theme.accent },
                pressed && { opacity: 0.8 }
              ]}>
              <ThemedText type="smallBold" style={{ color: '#000000', fontWeight: 'bold' }}>
                Entendi
              </ThemedText>
            </Pressable>
          </ThemedView>
        </View>
      </Modal>
      {/* Sync Settings Modal */}
      <SyncSettingsModal
        isOpen={isSyncOpen}
        onClose={() => {
          setIsSyncOpen(false);
          scanLibrary();
          loadFavorites();
        }}
        onShowToast={showStatus}
      />

      {/* Status Toast Banner */}
      {statusMessage.text !== '' && (
        <View
          style={[
            sharedStyles.statusBanner,
            { backgroundColor: statusMessage.type === 'success' ? '#2e7d32' : '#c62828', zIndex: 9999 },
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
    </ThemedView>
  );
}
