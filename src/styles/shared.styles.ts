import { StyleSheet } from 'react-native';
import { Spacing } from '@/constants/theme';

export const createSharedStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  safeArea: {
    flex: 1,
  },
  loadingWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.background,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two,
    marginHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.two,
    // Add neon drop shadow in dark mode
    shadowColor: theme.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 12,
  },
  divider: {
    height: 1,
    backgroundColor: theme.backgroundSelected,
    opacity: 0.5,
  },
  actionPill: {
    backgroundColor: theme.backgroundSelected,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  actionPillActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
    // Neon glow
    shadowColor: theme.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  actionPillText: {
    fontSize: 11,
    color: theme.text,
  },
  actionPillTextActive: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
});
