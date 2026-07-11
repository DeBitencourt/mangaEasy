import { StyleSheet } from 'react-native';
import { Spacing } from '@/constants/theme';

export const createDetailsStyles = (theme: any) => StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.background,
  },
  modalLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelFetchBtn: {
    marginTop: Spacing.four,
    borderWidth: 1,
    borderColor: theme.backgroundSelected,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
  },
  modalHeader: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: theme.backgroundSelected,
  },
  modalBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.one,
    width: 70,
  },
  modalHeaderTitle: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six + Spacing.three, // Clear Android navigation buttons (64 + 16 = 80px)
    gap: Spacing.three,
  },
  mangaMetaBlock: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
  },
  detailCoverImage: {
    width: 90,
    height: 125,
    borderRadius: Spacing.two,
    backgroundColor: '#333',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  detailMetaInfo: {
    flex: 1,
    gap: 4,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  detailSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  synopsisCard: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  synopsisText: {
    fontSize: 12,
    lineHeight: 16,
  },
  selectionControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bulkButtons: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  rangeBox: {
    padding: Spacing.two,
    borderRadius: Spacing.two,
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: theme.backgroundSelected,
  },
  rangeText: {
    fontSize: 12,
  },
  rangeInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  rangeInput: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderRadius: Spacing.one,
    paddingHorizontal: Spacing.two,
    fontSize: 12,
    textAlign: 'center',
  },
  rangeApplyBtn: {
    height: 36,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.one,
    justifyContent: 'center',
    alignItems: 'center',
    // Glowing active state
    shadowColor: theme.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  searchSortRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  modalSearchWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    height: 38,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  modalSearchInput: {
    flex: 1,
    height: '100%',
    marginLeft: Spacing.one,
    fontSize: 12,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    height: 38,
    borderRadius: Spacing.two,
    borderWidth: 0.5,
  },
  sortButtonText: {
    fontSize: 12,
    marginLeft: Spacing.one,
  },
  chaptersListWrapper: {
    maxHeight: 280,
  },
  chaptersListContent: {
    gap: Spacing.one,
  },
  chapterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 0.5,
  },
  emptyChapters: {
    padding: Spacing.three,
    alignItems: 'center',
  },
  downloadBtn: {
    height: 48,
    borderRadius: Spacing.two,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
    marginBottom: Spacing.three,
    // Neon glow
    shadowColor: theme.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 6,
  },
  downloadBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },

  // styles teste dropdown detalhes ------------------------
  container: {
    padding: 20,
    zIndex: 1, // Importante para o dropdown ficar por cima de outros itens
  },

  label: {
    fontSize: 16,
    marginBottom: 8,
    color: '#333',
  },

  dropdownContainer: {
    position: 'relative' // Mantém o menu ancorado a este container
  },

  botaoPrincipal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fff'
  },

  textoBotao: {
    fontSize: 16,
    color: '#333'
  },

  menuSuspanso: {
    position: 'absolute',
    top: 55, // Distância do topo para não cobrir o botão principal
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    elevation: 5, // Sombra no Android
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    zIndex: 1000 // Garante que o menu fique por cima de tudo
  },

  itemMenu: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },

  textoItem: {
    fontSize: 16,
    color: '#555'
  },

  textoItemSelecionado: {
    color: '#007AFF', // Cor azul para mostrar qual está ativo
    fontWeight: 'bold'
  }

});