import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  SafeAreaView,
} from 'react-native';

interface Change {
  lineNumber: number;
  before: string;
  after: string;
  description: string;
}

interface ImpactedFile {
  path: string;
  reason: string;
  requiresChange: boolean;
  suggestedChange?: string;
}

interface ImpactReviewScreenProps {
  isVisible: boolean;
  onClose: () => void;
  fileName: string;
  changes: Change[];
  impactedFiles: ImpactedFile[];
  onApplyCurrentOnly: () => void;
  onApplyAll: () => void;
  onViewAndEdit: (file: ImpactedFile) => void;
}

const ImpactReviewScreen = ({
  isVisible,
  onClose,
  fileName,
  changes,
  impactedFiles,
  onApplyCurrentOnly,
  onApplyAll,
  onViewAndEdit,
}: ImpactReviewScreenProps) => {
  if (!isVisible) return null;

  return (
    <Modal visible={isVisible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Review Changes</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeIcon}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {/* Section 1: Current File Changes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Changes in {fileName}</Text>
            {changes?.map((change, index) => (
              <View key={index} style={styles.changeCard}>
                <Text style={styles.changeDescription}>{change.description}</Text>
                <View style={styles.diffContainer}>
                  <View style={styles.diffBefore}>
                    <Text style={styles.diffLineNumber}>{change.lineNumber}</Text>
                    <Text style={styles.diffTextBefore}>{change.before}</Text>
                  </View>
                  <View style={styles.diffAfter}>
                    <Text style={styles.diffLineNumber}>{change.lineNumber}</Text>
                    <Text style={styles.diffTextAfter}>{change.after}</Text>
                  </View>
                </View>
              </View>
            ))}
            {(!changes || changes.length === 0) && (
              <Text style={styles.emptyText}>No specific changes identified.</Text>
            )}
          </View>

          {/* Section 2: Impact Analysis */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Impact on other files</Text>
            {impactedFiles?.map((file, index) => (
              <View
                key={index}
                style={[
                  styles.impactCard,
                  file.requiresChange ? styles.warningCard : styles.safeCard,
                ]}
              >
                <Text style={styles.impactPath}>
                  {file.requiresChange ? '⚠️ ' : '✅ '}
                  {file.path}
                </Text>
                <Text style={styles.impactReason}>
                  {file.reason} {!file.requiresChange && '— no change needed'}
                </Text>
                
                {file.requiresChange && file.suggestedChange && (
                  <View style={styles.suggestedChangeContainer}>
                     <Text style={styles.suggestedChangeLabel}>Suggested Edit:</Text>
                     <Text style={styles.suggestedChangeText} numberOfLines={3}>
                        {file.suggestedChange}
                     </Text>
                  </View>
                )}

                {file.requiresChange && (
                  <View style={styles.impactActions}>
                    <TouchableOpacity
                      style={styles.viewEditButton}
                      onPress={() => onViewAndEdit(file)}
                    >
                      <Text style={styles.viewEditText}>View & Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.skipButton} onPress={() => {}}>
                      <Text style={styles.skipText}>Skip for now</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
            {(!impactedFiles || impactedFiles.length === 0) && (
              <Text style={styles.emptyText}>No connected files impacted.</Text>
            )}
          </View>
        </ScrollView>

        {/* Section 3: Action Buttons */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.applyCurrentButton}
            onPress={onApplyCurrentOnly}
          >
            <Text style={styles.applyCurrentText}>Apply Current File Only</Text>
          </TouchableOpacity>
          
          {impactedFiles?.some(f => f.requiresChange) && (
            <TouchableOpacity
              style={styles.applyAllButton}
              onPress={onApplyAll}
            >
              <Text style={styles.applyAllText}>Apply All Changes</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    position: 'relative',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    position: 'absolute',
    right: 20,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  closeIcon: {
    color: '#888',
    fontSize: 18,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  changeCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222',
    padding: 16,
    marginBottom: 12,
  },
  changeDescription: {
    color: '#e0e0e0',
    fontSize: 14,
    marginBottom: 12,
  },
  diffContainer: {
    backgroundColor: '#050505',
    borderRadius: 8,
    overflow: 'hidden',
  },
  diffBefore: {
    flexDirection: 'row',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  diffAfter: {
    flexDirection: 'row',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  diffLineNumber: {
    color: '#666',
    width: 30,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  diffTextBefore: {
    color: '#fca5a5',
    flex: 1,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  diffTextAfter: {
    color: '#86efac',
    flex: 1,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    fontStyle: 'italic',
  },
  impactCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  warningCard: {
    backgroundColor: '#1f1500',
    borderColor: '#f59e0b',
  },
  safeCard: {
    backgroundColor: '#0a1f0a',
    borderColor: '#166534',
  },
  impactPath: {
    color: '#60a5fa',
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  impactReason: {
    color: '#aaa',
    fontSize: 13,
    lineHeight: 18,
  },
  suggestedChangeContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(245, 158, 11, 0.2)',
  },
  suggestedChangeLabel: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  suggestedChangeText: {
    color: '#cbd5e1',
    fontFamily: 'monospace',
    fontSize: 11,
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 8,
    borderRadius: 6,
  },
  impactActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  viewEditButton: {
    flex: 1,
    backgroundColor: '#f59e0b',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  viewEditText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 13,
  },
  skipButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#f59e0b',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  skipText: {
    color: '#fbbf24',
    fontWeight: '600',
    fontSize: 13,
  },
  footer: {
    padding: 20,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    backgroundColor: '#0a0a0a',
    gap: 12,
  },
  applyCurrentButton: {
    backgroundColor: '#1d4ed8',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  applyCurrentText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  applyAllButton: {
    backgroundColor: '#166534',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  applyAllText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});

export default ImpactReviewScreen;
