import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SymbolView } from '@/components/ui/symbol-view';
import { useTheme } from '@/hooks/use-theme';
import { PopularMangaItem } from '@/utils/scraper';

interface PopularCarouselProps {
  items: PopularMangaItem[];
  loading?: boolean;
  onSelectManga: (url: string) => void;
}

function getLanguageFlag(lang?: string): string {
  if (!lang) return '';
  switch (lang.toLowerCase()) {
    case 'ja':
      return '🇯🇵';
    case 'ko':
      return '🇰🇷';
    case 'zh':
    case 'zh-hk':
      return '🇨🇳';
    case 'en':
      return '🇺🇸';
    case 'pt-br':
    case 'pt':
      return '🇧🇷';
    case 'es':
    case 'es-la':
      return '🇪🇸';
    case 'fr':
      return '🇫🇷';
    default:
      return '🌐';
  }
}


export function PopularCarousel({ items, loading, onSelectManga }: PopularCarouselProps) {
  const theme = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);

  // Fade transition animation
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Prefetch all images immediately when items arrive
  useEffect(() => {
    if (items && items.length > 0) {
      items.forEach((item) => {
        if (item.coverUrl) {
          Image.prefetch(item.coverUrl);
        }
      });
    }
  }, [items]);

  // Preload adjacent images when slide index changes
  useEffect(() => {
    if (!items || items.length <= 1) return;
    const nextIdx = (currentIndex + 1) % items.length;
    const prevIdx = (currentIndex - 1 + items.length) % items.length;
    if (items[nextIdx]?.coverUrl) Image.prefetch(items[nextIdx].coverUrl);
    if (items[prevIdx]?.coverUrl) Image.prefetch(items[prevIdx].coverUrl);
  }, [currentIndex, items]);

  // Auto-slide effect
  useEffect(() => {
    if (!items || items.length <= 1) return;

    const timer = setInterval(() => {
      handleNext();
    }, 6000);

    return () => clearInterval(timer);
  }, [items, currentIndex]);

  const animateTransition = (callback: () => void) => {
    Animated.timing(fadeAnim, {
      toValue: 0.3,
      duration: 120,
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => {
      callback();
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    });
  };

  const handlePrev = () => {
    if (!items.length) return;
    animateTransition(() => {
      setCurrentIndex((prev) => (prev === 0 ? items.length - 1 : prev - 1));
    });
  };

  const handleNext = () => {
    if (!items.length) return;
    animateTransition(() => {
      setCurrentIndex((prev) => (prev === items.length - 1 ? 0 : prev + 1));
    });
  };

  if (loading && (!items || items.length === 0)) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <View style={[styles.headerMarker, { backgroundColor: '#ea580c' }]} />
          <ThemedText type="smallBold" style={styles.headerTitle}>
            NOVIDADES POPULARES
          </ThemedText>
        </View>
        <View style={[styles.loadingBox, { backgroundColor: theme.backgroundElement }]}>
          <ActivityIndicator size="small" color={theme.accent} />
          <ThemedText type="code" themeColor="textSecondary" style={{ marginTop: 8 }}>
            Carregando populares do MangaDex...
          </ThemedText>
        </View>
      </View>
    );
  }

  if (!items || items.length === 0) {
    return null;
  }

  const currentItem = items[currentIndex] || items[0];
  const flag = getLanguageFlag(currentItem.originalLanguage);

  return (
    <View style={styles.container}>
      {/* Header section */}
      <View style={styles.headerRow}>
        <View style={[styles.headerMarker, { backgroundColor: '#8b5cf6' }]} />
        <ThemedText type="smallBold" style={styles.headerTitle}>
          NOVIDADES POPULARES
        </ThemedText>
      </View>

      {/* Main card */}
      <View style={[styles.cardContainer, { borderColor: theme.backgroundSelected }]}>
        {/* Blurred background cover backdrop */}
        <Image
          source={{ uri: currentItem.coverUrl }}
          style={StyleSheet.absoluteFill}
          blurRadius={30}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority="low"
          transition={120}
        />
        {/* Dark overlay for optimal contrast */}
        <View style={styles.cardOverlay} />

        {/* Card Content */}
        <Animated.View style={[styles.cardContent, { opacity: fadeAnim }]}>
          <Pressable
            style={({ pressed }) => [styles.mangaInfoRow, { opacity: pressed ? 0.85 : 1 }]}
            onPress={() => onSelectManga(currentItem.url)}
          >
            {/* Cover Image */}
            <View style={styles.coverWrapper}>
              <Image
                source={{ uri: currentItem.coverUrl }}
                style={styles.coverImage}
                contentFit="cover"
                cachePolicy="memory-disk"
                priority="high"
                transition={120}
              />
              {/* Flag Badge on Cover */}
              {flag ? (
                <View style={styles.flagBadge}>
                  <ThemedText style={styles.flagText}>{flag}</ThemedText>
                </View>
              ) : null}
            </View>

            {/* Title & Metadata */}
            <View style={styles.metaColumn}>
              <ThemedText
                type="smallBold"
                style={styles.mangaTitle}
                numberOfLines={2}
              >
                {currentItem.title}
              </ThemedText>

              {currentItem.author ? (
                <ThemedText style={styles.authorText} numberOfLines={1}>
                  {currentItem.author}
                </ThemedText>
              ) : null}

              {/* Tags */}
              <View style={styles.badgesContainer}>
                {currentItem.tags && currentItem.tags.length > 0
                  ? currentItem.tags.slice(0, 3).map((tag, idx) => (
                    <View key={idx} style={styles.tagBadge}>
                      <ThemedText style={styles.badgeText}>{tag.toUpperCase()}</ThemedText>
                    </View>
                  ))
                  : null}
              </View>
            </View>
          </Pressable>

          {/* Navigation Bar inside Card */}
          <View style={styles.navRow}>
            <Pressable
              onPress={handlePrev}
              style={({ pressed }) => [
                styles.navBtn,
                { opacity: pressed ? 0.6 : 1 },
              ]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <SymbolView name="chevron.left" size={12} tintColor="#ffffff" />
            </Pressable>

            <View style={styles.counterBadge}>
              <ThemedText style={styles.counterText}>
                {currentIndex + 1}/{items.length}
              </ThemedText>
            </View>

            <Pressable
              onPress={handleNext}
              style={({ pressed }) => [
                styles.navBtn,
                { opacity: pressed ? 0.6 : 1 },
              ]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <SymbolView name="chevron.right" size={12} tintColor="#ffffff" />
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  headerMarker: {
    width: 4,
    height: 14,
    borderRadius: 2,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  loadingBox: {
    height: 170,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContainer: {
    height: 205,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
  },
  cardOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 6, 18, 0.84)',
  },
  cardContent: {
    flex: 1,
    padding: 14,
    justifyContent: 'space-between',
  },
  mangaInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  coverWrapper: {
    width: 95,
    height: 135,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1f1530',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 5,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  flagBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  flagText: {
    fontSize: 12,
  },
  metaColumn: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  mangaTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 20,
    marginBottom: 4,
  },
  authorText: {
    color: '#d4d4d8',
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 2,
  },
  tagBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.4,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingTop: 8,
  },
  navBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  counterText: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
