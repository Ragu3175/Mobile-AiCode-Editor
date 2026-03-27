import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS } from '../constants/theme';
import { useAppContext } from '../context/AppContext';
import { Ionicons } from '@expo/vector-icons';

const getExtensionColor = (ext: string) => {
  switch (ext.toLowerCase()) {
    case '.js': return COLORS.accent.yellow;
    case '.ts':
    case '.tsx': return '#3178c6';
    case '.json': return '#666';
    case '.env': return COLORS.accent.green;
    case '.md': return COLORS.accent.blue;
    case '.py': return '#3776ab';
    case '.css': return '#264de4';
    case '.html': return '#e34c26';
    default: return COLORS.text.muted;
  }
};

const getFileDescription = (item: any) => {
  if (item.intel) return item.intel;
  const ext = item.extension.toLowerCase();
  switch (ext) {
    case '.js': return 'JavaScript file';
    case '.ts': return 'TypeScript file';
    case '.tsx': return 'React component';
    case '.json': return 'JSON configuration';
    case '.env': return 'Environment Variables';
    case '.md': return 'Documentation';
    case '.css': return 'Style Sheet';
    case '.html': return 'HTML Document';
    case '.py': return 'Python script';
    default: return 'Source file';
  }
};

const buildTree = (flatList: any[]) => {
  const root: any[] = [];
  const map: { [key: string]: any } = {};

  // Sort: folders first (type='tree' in GitHub, 'blob' is file)
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
      isOpen: false,
      children: []
    };

    if (parentPath === '') {
      root.push(newNode);
    } else {
      if (map[parentPath]) {
        map[parentPath].children.push(newNode);
      }
    }
    map[item.path] = newNode;
  });

  return root;
};

const FileItem = ({ item, level = 0, onFileTap, repo }: { item: any, level?: number, onFileTap: (item: any) => void, repo: string }) => {
  const [isOpen, setIsOpen] = useState(item.isOpen || false);
  const { modifiedFiles } = useAppContext();
  const isFolder = item.type === 'folder';
  const fileKey = `${repo}:${item.path}`;
  const isModified = modifiedFiles[fileKey];

  return (
    <View>
      <TouchableOpacity 
        style={[
          styles.itemContainer, 
          isFolder ? styles.folderContainer : styles.fileContainer,
          { paddingLeft: level * 20 + 16 }
        ]} 
        activeOpacity={0.7}
        onPress={() => isFolder ? setIsOpen(!isOpen) : onFileTap(item)}
      >
        {isFolder ? (
          <>
            <Text style={styles.triangle}>{isOpen ? '▼' : '▶'}</Text>
            <View style={styles.folderIcon} />
            <Text style={styles.folderName}>{item.name}</Text>
          </>
        ) : (
          <View style={styles.fileRow}>
            <View style={[styles.extensionDot, { backgroundColor: getExtensionColor(item.extension) }]} />
            <View style={{ flex: 1 }}>
              <View style={styles.fileNameRow}>
                <Text style={[styles.fileName, isModified && { color: '#f59e0b' }]}>{item.name}</Text>
                {isModified && (
                  <View style={styles.modifiedDot} />
                )}
              </View>
              <Text style={styles.fileIntel}>{getFileDescription(item)}</Text>
            </View>
          </View>
        )}
      </TouchableOpacity>
      {isFolder && isOpen && item.children.map((child: any) => (
        <FileItem key={child.id} item={child} level={level + 1} onFileTap={onFileTap} repo={repo} />
      ))}
    </View>
  );
};

const FileTreeScreen = () => {
  const { repo, branch, repoName } = useLocalSearchParams();
  const router = useRouter();
  const [treeData, setTreeData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTree();
  }, [repo, branch]);

  const fetchTree = async () => {
    try {
      setLoading(true);
      const token = await SecureStore.getItemAsync('userToken');
      if (!token) {
        router.replace('/login' as any);
        return;
      }
      const response = await axios.get(`${process.env.EXPO_PUBLIC_API_URL}/github/tree`, {
        params: { repo, branch },
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Tree data:', response.data);
      const nested = buildTree(response.data);
      setTreeData(nested);
    } catch (err: any) {
      console.error('Error fetching tree:', err);
      if (err.response?.status === 401) {
        await SecureStore.deleteItemAsync('userToken');
        router.replace('/login' as any);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFileTap = (item: any) => {
    router.push({
      pathname: '/editor' as any,
      params: { 
        repo, 
        branch, 
        path: item.path,
        repoName 
      }
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Top Bar */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => router.back()}
          >
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle} numberOfLines={1}>{repoName || 'Files'}</Text>
            <Text style={styles.headerSubtitle}>{(branch as string) || 'main'} branch</Text>
          </View>
          <View style={styles.branchPill}>
            <Text style={styles.branchText}>{branch || 'main'}</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={COLORS.accent.blue} size="large" />
          <Text style={{ color: COLORS.text.secondary, marginTop: 12, fontSize: 13 }}>Fetching source tree...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {treeData.map(item => (
            <FileItem key={item.id} item={item} onFileTap={handleFileTap} repo={repo as string} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#080808',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  backButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0D0D0D',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#181818',
  },
  backIcon: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#555',
    marginTop: 2,
  },
  branchPill: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  branchText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.accent.green,
  },
  scrollContent: {
    paddingVertical: 12,
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginVertical: 1,
  },
  folderContainer: {
    backgroundColor: '#050505',
    marginBottom: 2,
  },
  fileContainer: {
    backgroundColor: 'transparent',
  },
  triangle: {
    fontSize: 8,
    color: '#444',
    width: 16,
  },
  folderIcon: {
    width: 14,
    height: 14,
    backgroundColor: COLORS.accent.blue,
    borderRadius: 4,
    marginRight: 10,
  },
  folderName: {
    fontSize: 14,
    color: '#e0e0e0',
    fontWeight: '600',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  extensionDot: {
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
  fileIntel: {
    fontSize: 11,
    color: '#3b82f6',
    opacity: 0.8,
    marginTop: 2,
  },
  fileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modifiedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f59e0b',
  },
});

export default FileTreeScreen;
