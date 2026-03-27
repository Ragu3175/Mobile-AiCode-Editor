import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Animated, Dimensions, Pressable, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS } from '../constants/theme';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';

const { height } = Dimensions.get('window');
const SHEET_HEIGHT = height * 0.6;

interface CommitSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCommit: (filesToCommit: string[], message: string) => void;
  repo: string;
}

const CommitSheet = ({ isOpen, onClose, onCommit, repo }: CommitSheetProps) => {
  const slideAnim = useRef(new Animated.Value(height)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(isOpen);
  const { savedFiles } = useAppContext();
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  
  // Filter saved files for this specific repo
  const repoSavedFiles = Object.keys(savedFiles).filter(key => key.startsWith(`${repo}:`));

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      // Default select all when opened
      setSelectedFiles(new Set(repoSavedFiles));
    }
  }, [isOpen]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: isOpen ? height - SHEET_HEIGHT : height,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: isOpen ? 1 : 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (!isOpen) setVisible(false);
    });
  }, [isOpen]);

  const toggleFile = (key: string) => {
    const next = new Set(selectedFiles);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedFiles(next);
  };

  const handleCommitSelected = () => {
    if (message.trim() && selectedFiles.size > 0) {
      onCommit(Array.from(selectedFiles), message);
      onClose();
      setMessage('');
    }
  };

  const handleCommitAll = () => {
    if (message.trim() && repoSavedFiles.length > 0) {
      onCommit(repoSavedFiles, message);
      onClose();
      setMessage('');
    }
  };

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={isOpen ? 'auto' : 'none'}>
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={80}
          style={{ flex: 1 }}
        >
          <View style={styles.handle} />
          
          <Text style={styles.title}>Files ready to commit</Text>
          
          <ScrollView style={styles.filesList} showsVerticalScrollIndicator={false}>
            {repoSavedFiles.length === 0 ? (
              <View style={styles.fileRow}>
                <View style={[styles.dot, { backgroundColor: '#666' }]} />
                <Text style={styles.fileText}>No saved files ready to commit</Text>
              </View>
            ) : (
              repoSavedFiles.map((key) => {
                const fileName = key.split(':').pop()?.split('/').pop() || 'file';
                const isSelected = selectedFiles.has(key);
                const savedAt = savedFiles[key]?.savedAt;
                const timeStr = savedAt ? `${Math.floor((Date.now() - savedAt) / 60000)} mins ago` : '';
                
                return (
                  <TouchableOpacity 
                    key={key} 
                    style={styles.fileRow}
                    onPress={() => toggleFile(key)}
                  >
                    <Ionicons 
                      name={isSelected ? "checkbox" : "square-outline"} 
                      size={20} 
                      color={isSelected ? "#3b82f6" : "#444"} 
                    />
                    <View style={[styles.dot, { backgroundColor: '#4ade80' }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fileText}>{fileName}</Text>
                      {timeStr ? <Text style={styles.timeText}>Saved {timeStr}</Text> : null}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Commit message (required)..."
              placeholderTextColor="#666"
              multiline
              value={message}
              onChangeText={setMessage}
            />
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.commitButton, { backgroundColor: '#333' }, (!message.trim() || selectedFiles.size === 0) && { opacity: 0.5 }]} 
              onPress={handleCommitSelected}
              disabled={!message.trim() || selectedFiles.size === 0}
            >
              <Text style={styles.commitText}>Commit Selected ({selectedFiles.size})</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.commitButton, (!message.trim() || repoSavedFiles.length === 0) && { opacity: 0.5 }]} 
              onPress={handleCommitAll}
              disabled={!message.trim() || repoSavedFiles.length === 0}
            >
              <Text style={styles.commitText}>Commit All</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: '#0d0d0d',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderTopWidth: 0.5,
    borderTopColor: '#252525',
    padding: SPACING.md,
  },
  handle: {
    width: 28,
    height: 3,
    backgroundColor: '#2a2a2a',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e0e0e0',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filesList: {
    maxHeight: 120,
    marginBottom: 15,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  fileText: {
    color: '#e0e0e0',
    fontSize: 14,
  },
  inputContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    padding: 14,
    marginBottom: 20,
    minHeight: 120,
  },
  input: {
    fontSize: 15,
    color: '#e0e0e0',
    fontFamily: TYPOGRAPHY.fontFamily.mono,
    textAlignVertical: 'top',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 24,
  },
  cancelButton: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#333',
  },
  commitButton: {
    flex: 2,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: COLORS.accent.blueDark,
  },
  cancelText: {
    color: '#aaa',
    fontSize: 15,
  },
  commitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  timeText: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
});

export default CommitSheet;
