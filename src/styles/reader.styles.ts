import { StyleSheet, Dimensions } from 'react-native';
import { Spacing } from '@/constants/theme';

const { width } = Dimensions.get('window');

export const createReaderStyles = (theme: any) => StyleSheet.create({
  readerContainer: {
    flex: 1,
    backgroundColor: '#000000', // Reader background is always dark
  },
  readerHeader: {
    backgroundColor: 'rgba(10, 5, 18, 0.95)', // Space purple overlay
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(208, 38, 255, 0.15)', // Neon separator line
    zIndex: 10,
  },
  readerHeaderContent: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
  },
  readerBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
  readerTitleBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: Spacing.two,
  },
  readerMangaTitle: {
    fontSize: 13,
    color: '#ffffff',
    textAlign: 'center',
  },
  chapterDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  readerNavControls: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  readerNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  readerNavBtnDisabled: {
    opacity: 0.3,
  },
  chapterSelectorOverlay: {
    position: 'absolute',
    top: 100,
    left: Spacing.three,
    right: Spacing.three,
    maxHeight: '60%',
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: 'rgba(208, 38, 255, 0.3)', // Neon purple border
    padding: Spacing.three,
    shadowColor: theme.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
    zIndex: 99,
  },
  selectorOverlayTitle: {
    fontSize: 14,
    marginBottom: Spacing.two,
    fontWeight: 'bold',
  },
  selectorOverlayScroll: {
    maxHeight: 220,
  },
  selectorOverlayItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
    marginBottom: 4,
  },
  closeOverlayBtn: {
    backgroundColor: theme.accent,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    alignItems: 'center',
    marginTop: Spacing.three,
    // Neon glow
    shadowColor: theme.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  readerCanvas: {
    flex: 1,
    backgroundColor: '#000000',
  },
  readerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  readerPageContainer: {
    width: width,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing.two,
  },
  readerPageImage: {
    width: width,
    height: 600, // Fixed height for vertical scroll reading experience
    backgroundColor: '#000000',
  },
  pageIndicator: {
    position: 'absolute',
    bottom: Spacing.two,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.one,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  pageIndicatorText: {
    fontSize: 10,
    color: '#ffffff',
  },
  readerEmpty: {
    paddingTop: 150,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
  },
});
