import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { SymbolView } from '@/components/ui/symbol-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useManga } from '@/context/manga-context';
import { useTheme } from '@/hooks/use-theme';

// Import separated styles
import { createSharedStyles } from '@/styles/shared.styles';
import { createDownloadsStyles } from '@/styles/downloads.styles';
import { createLibraryStyles } from '@/styles/library.styles';

export default function DownloadsScreen() {
  const theme = useTheme();
  const sharedStyles = createSharedStyles(theme);
  const styles = createDownloadsStyles(theme);
  const libStyles = createLibraryStyles(theme);

  const {
    activeDownloads,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    downloadHistory,
    clearHistory,
  } = useManga();

  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const toggleLogExpand = (id: string) => {
    setExpandedLogId((prev) => (prev === id ? null : id));
  };

  return (
    <ThemedView style={sharedStyles.container}>
      <SafeAreaView style={sharedStyles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          
          {/* Header */}
          <ThemedView style={styles.header}>
            <ThemedText type="subtitle" style={styles.title}>
              Downloads
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Acompanhe o progresso dos seus downloads de mangá em tempo real
            </ThemedText>
          </ThemedView>

          {/* Active Downloads List */}
          <View style={styles.sectionContainer}>
            {activeDownloads.map((dl) => {
              const isPaused = dl.status === 'paused';
              const showLogs = expandedLogId === dl.id;
              
              return (
                <ThemedView key={dl.id} type="backgroundElement" style={styles.downloadCard}>
                  <View style={styles.downloadMeta}>
                    <Image
                      source={{ uri: dl.coverUrl }}
                      style={styles.cardImage}
                      contentFit="cover"
                    />
                    <View style={styles.downloadInfo}>
                      <ThemedText type="smallBold" style={styles.mangaTitle} numberOfLines={1}>
                        {dl.mangaTitle}
                      </ThemedText>

                      {/* Status Label */}
                      <View style={styles.statusRow}>
                        <ThemedText type="code" style={[styles.statusText, { color: isPaused ? theme.textSecondary : theme.accent }]}>
                          {isPaused ? 'PAUSADO' : 'BAIXANDO...'}
                        </ThemedText>
                        <ThemedText type="code" themeColor="textSecondary" style={styles.dotSeparator}>
                          •
                        </ThemedText>
                        <ThemedText type="code" themeColor="textSecondary">
                          Cap. {dl.currentChapterIndex + 1}/{dl.chaptersCount}
                        </ThemedText>
                      </View>

                      {/* Detailed Description */}
                      <ThemedText type="small" themeColor="textSecondary" style={styles.progressDetail} numberOfLines={1}>
                        {dl.currentChapterTitle} (Pág. {dl.currentPage}/{dl.totalPages})
                      </ThemedText>

                      {/* Speed and ETA */}
                      {!isPaused && (
                        <View style={styles.statsRow}>
                          <View style={styles.statItem}>
                            <SymbolView name="bolt.fill" size={10} tintColor={theme.accent} />
                            <ThemedText type="code" style={styles.statValue}>
                              {dl.speed}
                            </ThemedText>
                          </View>
                          <View style={styles.statItem}>
                            <SymbolView name="clock.fill" size={10} tintColor="#FFA000" />
                            <ThemedText type="code" style={styles.statValue}>
                              ETA: {dl.eta}
                            </ThemedText>
                          </View>
                        </View>
                      )}
                    </View>

                    {/* Control Actions */}
                    <View style={styles.cardActions}>
                      <Pressable
                        onPress={() => (isPaused ? resumeDownload(dl.id) : pauseDownload(dl.id))}
                        style={styles.actionBtn}>
                        <SymbolView
                          name={isPaused ? 'play.fill' : 'pause.fill'}
                          size={16}
                          tintColor={theme.text}
                        />
                      </Pressable>
                      <Pressable
                        onPress={() => cancelDownload(dl.id)}
                        style={[styles.actionBtn, styles.actionBtnCancel]}>
                        <SymbolView name="xmark.circle.fill" size={16} tintColor="#f44336" />
                      </Pressable>
                    </View>
                  </View>

                  {/* Progress Bar Container */}
                  <View style={styles.progressSection}>
                    <View style={styles.progressBarBg}>
                      <View
                        style={[
                          styles.progressBarFill,
                          { width: `${dl.totalProgress}%`, backgroundColor: theme.accent },
                        ]}
                      />
                    </View>
                    <View style={styles.progressPercentRow}>
                      <ThemedText type="code" themeColor="textSecondary">
                        Progresso Total
                      </ThemedText>
                      <ThemedText type="code" style={{ fontWeight: 'bold' }}>
                        {dl.totalProgress}%
                      </ThemedText>
                    </View>
                  </View>

                  {/* Collapsible Console Logs */}
                  <View style={styles.logsContainer}>
                    <Pressable
                      onPress={() => toggleLogExpand(dl.id)}
                      style={styles.logsToggle}>
                      <ThemedText type="code" themeColor="textSecondary">
                        {showLogs ? 'Ocultar Console de Logs' : 'Mostrar Console de Logs'}
                      </ThemedText>
                      <SymbolView
                        name="chevron.down"
                        size={10}
                        tintColor={theme.textSecondary}
                        style={{ transform: [{ rotate: showLogs ? '180deg' : '0deg' }] }}
                      />
                    </Pressable>

                    {showLogs && (
                      <View style={[styles.logsBox, { backgroundColor: theme.background }]}>
                        <ScrollView
                          nestedScrollEnabled
                          style={styles.logsScroll}
                          contentContainerStyle={styles.logsScrollContent}>
                          {dl.logs.map((log, idx) => {
                            let logColor = theme.textSecondary;
                            if (log.includes('[SUCESSO]')) logColor = '#4CAF50';
                            if (log.includes('[INFO]')) logColor = theme.accent;
                            return (
                              <ThemedText
                                key={idx}
                                type="code"
                                style={[styles.logLine, { color: logColor }]}>
                                {log}
                              </ThemedText>
                            );
                          })}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                </ThemedView>
              );
            })}

            {/* Empty State */}
            {activeDownloads.length === 0 && (
              <ThemedView type="backgroundElement" style={styles.emptyState}>
                <SymbolView name="arrow.down.circle" size={32} tintColor={theme.textSecondary} />
                <ThemedText type="smallBold" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
                  Nenhum download em andamento.
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.emptySubtitle}>
                  Vá para a aba "Baixar" para selecionar e salvar capítulos.
                </ThemedText>
              </ThemedView>
            )}
          </View>

          {/* History / Completed Downloads Section */}
          <View style={[styles.sectionContainer, { marginTop: Spacing.four }]}>
            <View style={libStyles.sectionHeader}>
              <SymbolView name="clock.arrow.2.circlepath" size={16} tintColor={theme.accent} />
              <ThemedText type="smallBold" style={libStyles.sectionTitle}>
                Histórico de Downloads ({downloadHistory.length})
              </ThemedText>
            </View>

            {downloadHistory.map((item) => (
              <ThemedView key={item.id} type="backgroundElement" style={libStyles.historyCard}>
                <Image
                  source={{ uri: item.coverUrl }}
                  style={libStyles.historyImage}
                  contentFit="cover"
                />
                <View style={libStyles.historyInfo}>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {item.mangaTitle}
                  </ThemedText>
                  
                  <View style={libStyles.historyMetaRow}>
                    <SymbolView name="folder.fill" size={10} tintColor="#FFA000" />
                    <ThemedText type="code" themeColor="textSecondary" style={libStyles.historyPath} numberOfLines={1}>
                      {item.savePath}
                    </ThemedText>
                  </View>

                  <View style={libStyles.historyFooter}>
                    <ThemedText type="code" themeColor="textSecondary">
                      {item.chaptersCount} cap. • {item.source}
                    </ThemedText>
                    <ThemedText type="code" themeColor="textSecondary">
                      {item.downloadDate.split(',')[0]}
                    </ThemedText>
                  </View>
                </View>
              </ThemedView>
            ))}

            {downloadHistory.length === 0 && (
              <ThemedView type="backgroundElement" style={libStyles.emptyState}>
                <SymbolView name="clock" size={24} tintColor={theme.textSecondary} />
                <ThemedText type="smallBold" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
                  Nenhum histórico disponível.
                </ThemedText>
              </ThemedView>
            )}

            {/* Clear History Button */}
            {downloadHistory.length > 0 && (
              <Pressable
                onPress={clearHistory}
                style={({ pressed }) => [
                  libStyles.clearBtn,
                  { borderColor: theme.backgroundSelected, opacity: pressed ? 0.7 : 1 },
                ]}>
                <SymbolView name="trash" size={14} tintColor="#f44336" />
                <ThemedText type="smallBold" style={libStyles.clearBtnText}>
                  Limpar Histórico
                </ThemedText>
              </Pressable>
            )}
          </View>

          <View style={{ height: BottomTabInset + Spacing.five }} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}
