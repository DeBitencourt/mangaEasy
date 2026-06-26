import React, { useState } from 'react';
import {
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { SymbolView } from '@/components/ui/symbol-view';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useManga } from '@/context/manga-context';
import { useTheme } from '@/hooks/use-theme';

export default function DownloadsScreen() {
  const theme = useTheme();
  const {
    activeDownloads,
    pauseDownload,
    resumeDownload,
    cancelDownload,
  } = useManga();

  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const toggleLogExpand = (id: string) => {
    setExpandedLogId((prev) => (prev === id ? null : id));
  };

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
                        <ThemedText type="code" style={[styles.statusText, { color: isPaused ? theme.textSecondary : '#8B5CF6' }]}>
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
                            <SymbolView name="bolt.fill" size={10} tintColor="#8B5CF6" />
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
                          { width: `${dl.totalProgress}%` },
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
                            if (log.includes('[INFO]')) logColor = '#8B5CF6';
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

          <View style={{ height: BottomTabInset + Spacing.five }} />
        </ScrollView>
      </SafeAreaView>
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
  downloadCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  downloadMeta: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  cardImage: {
    width: 60,
    height: 85,
    borderRadius: Spacing.one,
    backgroundColor: '#333',
  },
  downloadInfo: {
    flex: 1,
    gap: 2,
  },
  mangaTitle: {
    fontSize: 15,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  dotSeparator: {
    marginHorizontal: Spacing.one,
    fontSize: 11,
  },
  progressDetail: {
    fontSize: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: 2,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 10,
  },
  cardActions: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnCancel: {
    backgroundColor: 'rgba(244,67,54,0.1)',
  },
  progressSection: {
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#8B5CF6',
    borderRadius: 3,
  },
  progressPercentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logsContainer: {
    marginTop: Spacing.one,
  },
  logsToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
  logsBox: {
    borderRadius: Spacing.one,
    height: 120,
    marginTop: Spacing.one,
    padding: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  logsScroll: {
    flex: 1,
  },
  logsScrollContent: {
    gap: 2,
  },
  logLine: {
    fontSize: 10,
    lineHeight: 14,
  },
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
});
