import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Animated, Dimensions, Pressable, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS } from '../constants/theme';

const { height } = Dimensions.get('window');
const SHEET_HEIGHT = height * 0.5;

interface EditBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  lineNumber: number;
  lineContent: string;
  repo?: any;
  branch?: any;
  path?: any;
  fileSha?: any;
}

const EditBottomSheet = ({ isOpen, onClose, lineNumber, lineContent, repo, branch, path, fileSha }: EditBottomSheetProps) => {
  const slideAnim = useRef(new Animated.Value(height)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [visible, setVisible] = useState(isOpen);

  useEffect(() => {
    if (isOpen) setVisible(true);
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

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={isOpen ? 'auto' : 'none'}>
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.handle} />
        
        <Text style={styles.headerLabel}>Editing line {lineNumber}</Text>
        
        <View style={styles.codePreview}>
          <Text style={styles.codeText}>{lineContent}</Text>
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Tell AI what to change..."
            placeholderTextColor="#333"
            multiline
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickActions}>
          <TouchableOpacity style={styles.pill}><Text style={styles.pillText}>Add expiry</Text></TouchableOpacity>
          <TouchableOpacity style={styles.pill}><Text style={styles.pillText}>Change algorithm</Text></TouchableOpacity>
          <TouchableOpacity style={styles.pill}><Text style={styles.pillText}>Add error handling</Text></TouchableOpacity>
        </ScrollView>

        <View style={styles.bottomRow}>
          <TouchableOpacity style={styles.voiceButton}>
            <View style={styles.micIcon} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.generateButton}>
            <Text style={styles.generateText}>Generate Edit</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: '#0d0d0d',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: '#181818',
    padding: 24,
  },
  handle: {
    width: 32,
    height: 4,
    backgroundColor: '#1a1a1a',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  headerLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#333',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  codePreview: {
    backgroundColor: '#050505',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#0a0a0a',
  },
  codeText: {
    fontSize: 10,
    color: '#666',
    fontFamily: TYPOGRAPHY.fontFamily.mono,
  },
  inputContainer: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#0D0D0D',
    borderWidth: 1,
    borderColor: '#181818',
    borderRadius: 14,
    padding: 16,
    fontSize: 14,
    color: COLORS.text.primary,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  quickActions: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  pill: {
    backgroundColor: '#0D0D0D',
    borderWidth: 1,
    borderColor: '#181818',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 10,
  },
  pillText: {
    fontSize: 11,
    color: '#555',
    fontWeight: '500',
  },
  bottomRow: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 20,
  },
  voiceButton: {
    width: 52,
    height: 52,
    backgroundColor: '#0D0D0D',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#181818',
    justifyContent: 'center',
    alignItems: 'center',
  },
  micIcon: {
    width: 10,
    height: 18,
    backgroundColor: '#444',
    borderRadius: 5,
  },
  generateButton: {
    flex: 1,
    backgroundColor: COLORS.accent.blue,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.accent.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  generateText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '700',
  },
});

export default EditBottomSheet;
