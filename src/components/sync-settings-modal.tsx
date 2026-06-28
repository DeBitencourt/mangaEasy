import React, { useState, useEffect } from 'react';
import {
  Modal,
  StyleSheet,
  Pressable,
  View,
  TextInput,
  ActivityIndicator,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from '@/components/ui/symbol-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getDeviceId } from '@/utils/database';
import { syncLocalDataWithCloud, downloadCloudBackup } from '@/utils/supabase';

interface SyncSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (text: string, type: 'success' | 'error') => void;
}

export default function SyncSettingsModal({ isOpen, onClose, onShowToast }: SyncSettingsModalProps) {
  const theme = useTheme();
  
  const [deviceId, setDeviceId] = useState('Carregando...');
  const [backupCode, setBackupCode] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getDeviceId().then(setDeviceId).catch(console.error);
    }
  }, [isOpen]);

  const handleCopyId = () => {
    Clipboard.setString(deviceId);
    onShowToast('Código de Backup copiado!', 'success');
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const stats = await syncLocalDataWithCloud();
      const total = stats.favoritesSynced + stats.toReadSynced + stats.historySynced + stats.progressSynced;
      if (total > 0) {
        onShowToast(`Sincronizado! ${total} itens enviados.`, 'success');
      } else {
        onShowToast('Nenhum dado novo para sincronizar.', 'success');
      }
    } catch (err) {
      console.error(err);
      onShowToast('Erro ao sincronizar com a nuvem.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleRestore = async () => {
    if (!backupCode.trim()) {
      onShowToast('Digite um código de backup válido.', 'error');
      return;
    }
    setRestoring(true);
    try {
      const success = await downloadCloudBackup(backupCode.trim());
      if (success) {
        onShowToast('Backup restaurado! Reiniciando biblioteca.', 'success');
        setBackupCode('');
        onClose();
      } else {
        onShowToast('Código de backup inválido ou sem dados.', 'error');
      }
    } catch (err) {
      console.error(err);
      onShowToast('Erro ao restaurar backup.', 'error');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <ThemedView type="backgroundElement" style={[styles.modalBox, { borderColor: theme.backgroundSelected }]}>
          {/* Header */}
          <View style={styles.header}>
            <ThemedText type="smallBold" style={{ fontSize: 16 }}>Sincronização Cloud</ThemedText>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <SymbolView name="xmark" size={16} tintColor={theme.text} />
            </Pressable>
          </View>

          {/* Device ID / Backup Code Info */}
          <View style={styles.section}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
              Seu Código de Backup
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ marginBottom: Spacing.one }}>
              Guarde este código para restaurar seus dados em outro dispositivo.
            </ThemedText>
            <View style={[styles.codeContainer, { backgroundColor: theme.background }]}>
              <ThemedText type="code" numberOfLines={1} style={{ flex: 1, color: theme.text, fontSize: 11 }}>
                {deviceId}
              </ThemedText>
              <Pressable onPress={handleCopyId} style={styles.copyBtn}>
                <SymbolView name="doc.on.doc" size={14} tintColor={theme.accent} />
              </Pressable>
            </View>
          </View>

          {/* Sync Button */}
          <View style={styles.section}>
            <Pressable
              onPress={handleSync}
              disabled={syncing}
              style={({ pressed }) => [
                styles.syncBtn,
                { backgroundColor: theme.accent, opacity: (pressed || syncing) ? 0.8 : 1 }
              ]}
            >
              {syncing ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <>
                  <SymbolView name="arrow.triangle.2.circlepath" size={16} tintColor="#000" />
                  <ThemedText type="smallBold" style={{ color: '#000', marginLeft: Spacing.one }}>
                    Sincronizar Agora
                  </ThemedText>
                </>
              )}
            </Pressable>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />

          {/* Restore Backup Section */}
          <View style={styles.section}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
              Restaurar Backup
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ marginBottom: Spacing.one }}>
              Digite o Código de Backup de outro dispositivo para puxar os dados salvos.
            </ThemedText>
            <TextInput
              value={backupCode}
              onChangeText={setBackupCode}
              placeholder="Cole seu código aqui..."
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}
            />
            <Pressable
              onPress={handleRestore}
              disabled={restoring}
              style={({ pressed }) => [
                styles.restoreBtn,
                { borderColor: theme.accent, opacity: (pressed || restoring) ? 0.8 : 1 }
              ]}
            >
              {restoring ? (
                <ActivityIndicator size="small" color={theme.accent} />
              ) : (
                <ThemedText type="smallBold" style={{ color: theme.accent }}>
                  Restaurar Dados
                </ThemedText>
              )}
            </Pressable>
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  modalBox: {
    width: '100%',
    maxWidth: 340,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  closeBtn: {
    padding: 4,
  },
  section: {
    marginBottom: Spacing.three,
  },
  sectionTitle: {
    fontSize: 12,
    textTransform: 'uppercase',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  copyBtn: {
    padding: 4,
    marginLeft: 8,
  },
  syncBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.two,
  },
  input: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 0.5,
    fontSize: 12,
    marginBottom: Spacing.two,
  },
  restoreBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
