import { StyleSheet } from 'react-native';
import { Spacing, MaxContentWidth } from '@/constants/theme';

export const createDownloadsStyles = (theme: any) => StyleSheet.create({
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
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.03)',
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
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  downloadInfo: {
    flex: 1,
    gap: 2,
  },
  mangaTitle: {
    fontSize: 15,
    fontWeight: '600',
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
    backgroundColor: theme.backgroundSelected,
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
    backgroundColor: theme.backgroundSelected,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
    // Glowing neon progress bar
    shadowColor: theme.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
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
    borderColor: 'rgba(255, 255, 255, 0.05)',
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
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  emptySubtitle: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: Spacing.one,
    maxWidth: 280,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  clearBtnText: {
    color: '#f44336',
  },
});
