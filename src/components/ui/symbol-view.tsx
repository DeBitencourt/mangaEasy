import React from 'react';
import { Platform, Text, StyleSheet } from 'react-native';

export interface SymbolViewProps {
  name: string | { ios?: string; android?: string; web?: string };
  size?: number;
  tintColor?: string;
  weight?: 'ultraLight' | 'thin' | 'light' | 'regular' | 'medium' | 'semibold' | 'bold' | 'heavy' | 'black';
  style?: any;
}

let NativeSymbolView: any = null;
if (Platform.OS === 'ios') {
  try {
    NativeSymbolView = require('expo-symbols').SymbolView;
  } catch (e) {
    console.warn('Failed to load expo-symbols on iOS:', e);
  }
}

const SYMBOL_MAP: Record<string, string> = {
  'magnifyingglass': '🔍',
  'xmark.circle.fill': '❌',
  'xmark.circle': '❌',
  'chevron.down': '▼',
  'chevron.left': '◀',
  'chevron.right': '▶',
  'globe': '🌐',
  'arrow.up.arrow.down.circle': '⇅',
  'arrow.up.arrow.down.circle.fill': '⇅',
  'checkmark.square.fill': '☑',
  'square': '☐',
  'arrow.down.circle': '⬇',
  'arrow.down.circle.fill': '⬇',
  'checkmark.circle.fill': '✅',
  'folder.fill': '📁',
  'book.fill': '📖',
  'square.and.arrow.down': '📥',
  'trash': '🗑',
  'bolt.fill': '⚡',
  'clock.fill': '🕒',
  'play.fill': '▶',
  'pause.fill': '⏸',
  'arrow.left': '◀',
  'arrow.right': '▶',
  'arrow.up': '↑',
  'arrow.down': '↓',
  'arrow.up.circle': '⬆',
  'arrow.up.circle.fill': '⬆',
  'doc.text.fill': '📄',
  'questionmark.circle': '❓',
  'star.fill': '★',
  'star': '☆',
  'circle': '○',
  'chevron_right': '▶',
  'clock': '🕐',
  'clock.arrow.2.circlepath': '🔄',
  'books.vertical.fill': '📚',
  'checkmark.circle': '✓',
  'lock.fill': '🔒',
  'xmark': '✕',
  'plus': '+',
  'minus': '−',
  'exclamationmark.triangle': '⚠',
  'checkmark': '✓',
  'info.circle': 'ℹ',
  'play.circle.fill': '▶',
  'stop.circle.fill': '⏹',
  'arrow.clockwise': '↻',
  'arrow.counterclockwise': '↺',
  'gear': '⚙',
  'bell.fill': '🔔',
  'bell': '🔔',
  'heart.fill': '❤',
  'heart': '♡',
  'hand.thumbsup.fill': '👍',
  'list.bullet': '≡',
};

export function SymbolView({ name, size = 16, tintColor, weight, style }: SymbolViewProps) {
  if (Platform.OS === 'ios' && NativeSymbolView) {
    return (
      <NativeSymbolView
        name={name}
        size={size}
        tintColor={tintColor}
        weight={weight}
        style={style}
      />
    );
  }

  // Fallback for Android and Web
  let symbolKey = '';
  if (typeof name === 'string') {
    symbolKey = name;
  } else if (name && typeof name === 'object') {
    symbolKey = name[Platform.OS] || name.ios || '';
  }

  const unicodeChar = SYMBOL_MAP[symbolKey] || SYMBOL_MAP[symbolKey.toLowerCase()] || '•';

  return (
    <Text
      style={[
        styles.fallbackText,
        {
          fontSize: size,
          color: tintColor,
          fontWeight: weight === 'bold' || weight === 'semibold' || weight === 'heavy' ? 'bold' : 'normal',
        },
        style,
      ]}>
      {unicodeChar}
    </Text>
  );
}

const styles = StyleSheet.create({
  fallbackText: {
    textAlign: 'center',
    includeFontPadding: false,
  },
});
