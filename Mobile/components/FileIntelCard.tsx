import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Animated, Dimensions, Pressable, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS } from '../constants/theme';

const { height } = Dimensions.get('window');
const SHEET_HEIGHT = height * 0.6;

interface FileIntelCardProps {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  data: any | null;
  error: string | null;
  onRetry: () => void;
}

const FileIntelCard = ({ isOpen, onClose, loading, data, error, onRetry }: FileIntelCardProps) => {
  const slideAnim = useRef(new Animated.Value(height)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [visible, setVisible] = useState(isOpen);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

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
        
        {loading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={COLORS.accent.blue} />
            <Text style={styles.loadingText}>Analyzing file...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerContent}>
            <Text style={styles.errorText}>Could not analyze file.</Text>
            <TouchableOpacity onPress={onRetry} style={styles.retryButton}>
              <Text style={styles.retryText}>Tap to retry</Text>
            </TouchableOpacity>
          </View>
        ) : data ? (
          <ScrollView style={styles.content}>
            <View style={styles.section}>
              <Text style={styles.label}>ROLE IN PROJECT</Text>
              <Text style={styles.value}>{data.role}</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>FILE CONTENTS</Text>
              {data.contents?.map((item: any, index: number) => (
                <View key={index} style={styles.bulletItem}>
                  <View style={styles.bullet} />
                  <Text style={styles.bulletText}>
                    <Text style={styles.functionName}>{item.name}</Text>
                    <Text style={styles.descriptionText}> — {item.description}</Text>
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>CONNECTED FILES</Text>
              <View style={styles.tagContainer}>
                {data.connectedFiles?.map((file: any, index: number) => (
                  <Pressable 
                    key={index} 
                    style={styles.tag}
                    onPress={() => setActiveTooltip(activeTooltip === file.path ? null : file.path)}
                  >
                    <Text style={styles.tagText}>{file.path}</Text>
                    {activeTooltip === file.path && (
                      <View style={styles.tooltip}>
                        <Text style={styles.tooltipText}>{file.reason}</Text>
                      </View>
                    )}
                  </Pressable>
                ))}
              </View>
            </View>
          </ScrollView>
        ) : null}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: '#111',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderTopWidth: 0.5,
    borderTopColor: '#252525',
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  handle: {
    width: 28,
    height: 3,
    backgroundColor: '#2a2a2a',
    borderRadius: 1.5,
    alignSelf: 'center',
    marginBottom: 24,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    fontSize: 13,
    marginTop: 12,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  retryText: {
    color: '#e0e0e0',
    fontSize: 13,
  },
  content: {
    flex: 1,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 9,
    fontWeight: '700',
    color: '#888',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  value: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e0e0e0',
    lineHeight: 20,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#60a5fa',
    marginRight: 10,
  },
  bulletText: {
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
  functionName: {
    color: '#60a5fa',
    fontWeight: 'bold',
  },
  descriptionText: {
    color: '#aaa',
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  tag: {
    backgroundColor: '#0f1f2f',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.1)',
    position: 'relative',
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#60a5fa',
  },
  tooltip: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    backgroundColor: '#222',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#333',
    width: 200,
    marginBottom: 5,
    zIndex: 100,
  },
  tooltipText: {
    color: '#e0e0e0',
    fontSize: 11,
    lineHeight: 16,
  },
});

export default FileIntelCard;
