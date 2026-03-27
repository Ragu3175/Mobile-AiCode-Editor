import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Animated, Dimensions, Pressable, ScrollView } from 'react-native';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS } from '../constants/theme';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const { width } = Dimensions.get('window');
const DRAWER_WIDTH = width * 0.8;

// Re-using tree builder logic
const buildTree = (flatList: any[]) => {
  const root: any[] = [];
  const map: { [key: string]: any } = {};
  const sorted = [...flatList].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'tree' ? -1 : 1;
    return a.path.localeCompare(b.path);
  });
  sorted.forEach(item => {
    const parts = item.path.split('/');
    const name = parts.pop();
    const parentPath = parts.join('/');
    const newNode = {
      id: item.sha,
      name,
      path: item.path,
      type: item.type === 'tree' ? 'folder' : 'file',
      extension: name.includes('.') ? `.${name.split('.').pop()}` : '',
      children: []
    };
    if (parentPath === '') root.push(newNode);
    else if (map[parentPath]) map[parentPath].children.push(newNode);
    map[item.path] = newNode;
  });
  return root;
};

const DrawerItem = ({ 
  item, 
  level = 0, 
  currentPath, 
  onFilePress,
  expandedFolders,
  setExpandedFolders,
  modifiedFiles = {},
  savedFiles = {},
  repo
}: { 
  item: any; 
  level?: number; 
  currentPath?: string; 
  onFilePress: (file: any) => void;
  expandedFolders: Set<string>;
  setExpandedFolders: (folders: Set<string>) => void;
  modifiedFiles?: { [key: string]: string };
  savedFiles?: { [key: string]: { content: string, sha: string, savedAt: number } };
  repo?: string;
}) => {
  const isFolder = item.type === 'folder';
  const isActive = item.path === currentPath;
  const isOpen = expandedFolders.has(item.path);

  const toggleFolder = () => {
    const newExpanded = new Set(expandedFolders);
    if (isOpen) {
      newExpanded.delete(item.path);
    } else {
      newExpanded.add(item.path);
    }
    setExpandedFolders(newExpanded);
  };

  return (
    <View>
      <TouchableOpacity 
        style={[styles.itemContainer, isActive && styles.activeItem, { paddingLeft: level * 24 + 16 }]} 
        activeOpacity={0.7}
        onPress={() => isFolder ? toggleFolder() : onFilePress(item)}
      >
        {isFolder ? (
          <>
            <Text style={styles.triangle}>{isOpen ? '▼' : '▶'}</Text>
            <View style={styles.folderIcon} />
            <Text style={styles.folderName}>{item.name}</Text>
          </>
        ) : (
          <>
            <View style={[styles.dot, { backgroundColor: isActive ? '#3b82f6' : '#222' }]} />
            <Text style={[styles.fileName, isActive && styles.activeFileName]}>{item.name}</Text>
            {modifiedFiles[`${repo}:${item.path}`] && (
              <View style={styles.modifiedDot} />
            )}
            {savedFiles[`${repo}:${item.path}`] && (
              <View style={styles.savedDot} />
            )}
          </>
        )}
      </TouchableOpacity>
      {isFolder && isOpen && item.children.map((child: any) => (
        <DrawerItem 
          key={child.id} 
          item={child} 
          level={level + 1} 
          currentPath={currentPath} 
          onFilePress={onFilePress}
          expandedFolders={expandedFolders}
          setExpandedFolders={setExpandedFolders}
          modifiedFiles={modifiedFiles}
        />
      ))}
    </View>
  );
};

interface LeftDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  repoName: string;
  repo?: string;
  branch?: string;
  currentPath?: string;
  onFileSelect?: (file: any) => void;
  treeData?: any[];
  expandedFolders?: Set<string>;
  setExpandedFolders?: (folders: Set<string>) => void;
  modifiedFiles?: { [key: string]: string };
  savedFiles?: { [key: string]: { content: string, sha: string, savedAt: number } };
}

const LeftDrawer = ({ 
  isOpen, 
  onClose, 
  repoName, 
  repo, 
  branch, 
  currentPath, 
  onFileSelect,
  treeData = [],
  expandedFolders = new Set(),
  setExpandedFolders = () => {},
  modifiedFiles = {},
  savedFiles = {}
}: LeftDrawerProps) => {
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [visible, setVisible] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
    }
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: isOpen ? 0 : -DRAWER_WIDTH,
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
      {/* Overlay */}
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Drawer */}
      <Animated.View style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}>
        <View style={styles.header}>
          <View>
            <Text style={styles.label}>PROJECT</Text>
            <Text style={styles.repoName}>{repoName}</Text>
          </View>
          <TouchableOpacity 
            style={styles.closeButton}
            onPress={onClose}
          >
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.branchRow}>
          <View style={styles.branchIndicator} />
          <Text style={styles.branchName}>{branch || 'main'}</Text>
          <Text style={styles.chevron}>⌄</Text>
        </View>

        {(() => {
          const repoModifiedCount = Object.keys(modifiedFiles).filter(k => k.startsWith(`${repo}:`)).length;
          const repoSavedCount = Object.keys(savedFiles).filter(k => k.startsWith(`${repo}:`)).length;
          
          if (repoModifiedCount > 0 || repoSavedCount > 0) {
            return (
              <View style={styles.summaryRow}>
                {repoModifiedCount > 0 && (
                  <Text style={styles.summaryUnsaved}>
                    ● {repoModifiedCount} unsaved
                  </Text>
                )}
                {repoSavedCount > 0 && (
                  <Text style={styles.summarySaved}>
                    ✓ {repoSavedCount} ready to commit
                  </Text>
                )}
              </View>
            );
          }
          return null;
        })()}

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {treeData.length > 0 ? (
            treeData.map(item => (
              <DrawerItem 
                key={item.id} 
                item={item} 
                currentPath={currentPath}
                expandedFolders={expandedFolders}
                setExpandedFolders={setExpandedFolders}
                modifiedFiles={modifiedFiles}
                savedFiles={savedFiles}
                repo={repo}
                onFilePress={(file) => {
                  onFileSelect?.(file);
                }}
              />
            ))
          ) : (
            <Text style={styles.placeholder}>Loading project files...</Text>
          )}
        </ScrollView>

        {/* Removed Terminal button */}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    zIndex: 10,
  },
  drawer: {
    width: DRAWER_WIDTH,
    height: '100%',
    backgroundColor: '#050505',
    borderRightWidth: 1,
    borderRightColor: '#0A0A0A',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
    zIndex: 20,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 24,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 1,
    marginBottom: 6,
  },
  repoName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e0e0e0',
    letterSpacing: -0.2,
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 24,
    width: 28,
    height: 28,
    backgroundColor: '#0D0D0D',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#181818',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 10,
    color: '#888',
  },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0A0A0A',
    marginBottom: 10,
  },
  branchIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: COLORS.accent.green,
    marginRight: 10,
  },
  branchName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4ade80',
    flex: 1,
  },
  chevron: {
    fontSize: 12,
    color: '#888',
  },
  content: {
    flex: 1,
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginVertical: 0,
  },
  activeItem: {
    backgroundColor: '#111d2e',
    borderRightWidth: 2,
    borderRightColor: '#3b82f6',
  },
  folderIcon: {
    width: 14,
    height: 14,
    backgroundColor: COLORS.accent.blue,
    borderRadius: 3.5,
    marginRight: 10,
  },
  folderName: {
    fontSize: 13,
    color: '#e0e0e0',
    fontWeight: '700',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 2.5,
    marginRight: 12,
  },
  fileName: {
    fontSize: 13,
    color: '#ccc',
    fontWeight: '600',
  },
  activeFileName: {
    color: '#60a5fa',
    fontWeight: '700',
  },
  triangle: {
    fontSize: 8,
    color: '#888',
    width: 14,
    marginRight: 4,
  },
  fileIntel: {
    fontSize: 9,
    color: COLORS.accent.blue,
    opacity: 0.8,
    marginTop: 2,
  },
  placeholder: {
    fontSize: 12,
    color: '#222',
    fontStyle: 'italic',
    marginTop: 20,
    textAlign: 'center',
  },
  bottomBar: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#0A0A0A',
    paddingBottom: 32,
  },
  bottomButton: {
    flex: 1,
    height: 48,
    backgroundColor: '#0D0D0D',
    borderWidth: 1,
    borderColor: '#181818',
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  bottomButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#AAA',
  },
  commitBtn: {
    backgroundColor: '#080808',
  },
  commitIcon: {
    width: 12,
    height: 12,
    backgroundColor: COLORS.accent.green,
    opacity: 0.5,
    borderRadius: 3,
  },
  terminalIcon: {
    width: 12,
    height: 10,
    borderWidth: 1,
    borderColor: '#888',
    borderRadius: 2,
  },
  modifiedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f59e0b',
    marginLeft: 'auto',
  },
  savedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ade80',
    marginLeft: 'auto',
  },
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 12,
    flexWrap: 'wrap',
  },
  summaryUnsaved: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '600',
  },
  summarySaved: {
    color: '#4ade80',
    fontSize: 11,
    fontWeight: '600',
  },
  modifiedBadge: {
    backgroundColor: '#1f1200',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
  },
  modifiedCountText: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '600',
  },
});

export default LeftDrawer;
