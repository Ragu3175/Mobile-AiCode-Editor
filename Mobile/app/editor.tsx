import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar, ScrollView, ActivityIndicator, Alert, Dimensions, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS } from '../constants/theme';
import LeftDrawer from '../components/LeftDrawer';
import CombinedEditorSheet from '../components/CombinedEditorSheet';
import DiffViewer from '../components/DiffViewer';
import TutorialOverlay from '../components/TutorialOverlay';
import ImpactReviewScreen from '../components/ImpactReviewScreen';
import CommitSheet from '../components/CommitSheet';
import { MaterialIcons, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { WebView } from 'react-native-webview';
import { useAppContext } from '../context/AppContext';

const { width, height } = Dimensions.get('window');

const buildTree = (flatList: any[]) => {
  const root: any[] = [];
  const map: { [key: string]: any } = {};
  const sorted = [...flatList].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'tree' ? -1 : 1;
    return a.path.localeCompare(b.path);
  });
  sorted.forEach(item => {
    const parts = item.path.split('/');
    const name = parts.pop() || '';
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

const getParentFolders = (filePath: string) => {
  if (!filePath) return [];
  const parts = filePath.split('/');
  const folders = [];
  let current = '';
  for (let i = 0; i < parts.length - 1; i++) {
    current = current ? `${current}/${parts[i]}` : parts[i];
    folders.push(current);
  }
  return folders;
};

const flattenTree = (nodes: any[], paths: string[] = []) => {
  nodes.forEach(node => {
    if (node.type === 'file') paths.push(node.path);
    if (node.children) flattenTree(node.children, paths);
  });
  return paths;
};

const EditorScreen = () => {
  const router = useRouter();
  const { repo, branch, repoName, path } = useLocalSearchParams();
  
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [treeData, setTreeData] = useState<any[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(getParentFolders(path as string)));
  
  const [currentFilePath, setCurrentFilePath] = useState((path as string) || '');
  const [currentFileName, setCurrentFileName] = useState((path as string || '').split('/').pop() || '');
  const [codeLines, setCodeLines] = useState<string[]>([]);
  const [currentFileContent, setCurrentFileContent] = useState('');
  const [originalFileContent, setOriginalFileContent] = useState('');
  const [fileSha, setFileSha] = useState('');
  const [loading, setLoading] = useState(true);
  const [webViewReady, setWebViewReady] = useState(false);
  
  // Sheet state
  const [sheetVisible, setSheetVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'intel'>('edit');
  const [selectedLine, setSelectedLine] = useState<number | null>(null);

  // Intel state
  const [intelData, setIntelData] = useState<any>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [intelError, setIntelError] = useState<string | null>(null);
  const [intelFilePath, setIntelFilePath] = useState('');
  const [intelSourcePath, setIntelSourcePath] = useState('');
  const intelCache = useRef<{[key: string]: any}>({});
  const intelAbortRef = useRef<AbortController | null>(null);
  
  // Diff State
  const [isDiffOpen, setIsDiffOpen] = useState(false);
  const [oldCode, setOldCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [isTutorialVisible, setIsTutorialVisible] = useState(false);

  // Impact Review State
  const [isImpactReviewOpen, setIsImpactReviewOpen] = useState(false);
  const [aiChanges, setAiChanges] = useState<any[]>([]);
  const [impactedFiles, setImpactedFiles] = useState<any[]>([]);
  const [aiEditedContent, setAiEditedContent] = useState('');

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isCommitSheetOpen, setIsCommitSheetOpen] = useState(false);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [tutorialStep, setTutorialStep] = useState(0);
  const { modifiedFiles, setModifiedFiles, savedFiles, setSavedFiles } = useAppContext();

  const webViewRef = useRef<WebView>(null);
  const currentPathRef = useRef(currentFilePath);

  // Memoize flattened paths
  const allFilePathsString = useMemo(() => {
    if (!treeData || treeData.length === 0) return '';
    return flattenTree(treeData).slice(0, 50).join(', ');
  }, [treeData]);

  useEffect(() => {
    currentPathRef.current = currentFilePath;
  }, [currentFilePath]);

  const fetchFileContent = async (filePathToFetch: string, showLoader = true) => {
    const fileKey = `${repo}:${filePathToFetch}`;
    const hasUnsaved = !!modifiedFiles[fileKey];
    const hasSaved = !!savedFiles[fileKey];

    if (hasUnsaved) {
      const content = modifiedFiles[fileKey];
      setCodeLines(content.split('\n'));
      setCurrentFileContent(content);
      setHasUnsavedChanges(true);
      if (currentPathRef.current === filePathToFetch) {
        setIntelSourcePath(filePathToFetch);
        const fileKey = `${repo}:${filePathToFetch}`;
        fetchIntel(modifiedFiles[fileKey]);
      }
      return;
    }

    if (hasSaved) {
      const saved = savedFiles[fileKey];
      if (saved && saved.content !== undefined) {
        setCodeLines(saved.content?.split('\n') || []);
        setCurrentFileContent(saved.content);
        setFileSha(saved.sha);
        setHasUnsavedChanges(false);
        if (currentPathRef.current === filePathToFetch) {
          setIntelSourcePath(filePathToFetch);
          fetchIntel(saved.content);
        }
      }
    }

    try {
      if (showLoader && !hasUnsaved && !hasSaved) setLoading(true);
      const token = await SecureStore.getItemAsync('userToken');
      if (!token) {
        router.replace('/login' as any);
        return null;
      }
      
      const response = await axios.get(`${process.env.EXPO_PUBLIC_API_URL}/github/file`, {
        params: { repo, path: filePathToFetch, branch },
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const content = response.data.content;
      setOriginalFileContent(content);
      setFileSha(response.data.sha);
      
      if (!hasUnsaved && !hasSaved) {
        setCodeLines(content.split('\n'));
        setCurrentFileContent(content);
        setHasUnsavedChanges(false);
      } else if (hasUnsaved) {
        setUndoStack(prev => prev.length === 0 ? [content] : prev);
      }

      if (currentPathRef.current === filePathToFetch) {
        setIntelSourcePath(filePathToFetch);
        fetchIntel(content);
      }
      
      return response.data;
    } catch (err: any) {
      console.error('Error fetching file:', err);
      if (err.response?.status === 401) {
        await SecureStore.deleteItemAsync('userToken');
        router.replace('/login' as any);
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  const fetchTree = async () => {
    if (!repo || !branch) return;
    try {
      const token = await SecureStore.getItemAsync('userToken');
      if (!token) return;
      const response = await axios.get(`${process.env.EXPO_PUBLIC_API_URL}/github/tree`, {
        params: { repo, branch },
        headers: { Authorization: `Bearer ${token}` }
      });
      setTreeData(buildTree(response.data));
    } catch (err) {
      console.error('Error fetching tree:', err);
    }
  };

  const handleFileSelect = async (file: any) => {
    setIsDrawerOpen(false);
    
    if (webViewRef.current && webViewReady) {
      webViewRef.current.postMessage(JSON.stringify({
        type: 'SET_CONTENT',
        content: '// Loading...',
        mode: 'javascript'
      }));
    }

    if (hasUnsavedChanges && currentFilePath) {
      const fileKey = `${repo}:${currentFilePath}`;
      setModifiedFiles(prev => ({
        ...prev,
        [fileKey]: currentFileContent
      }));
    }

    setCurrentFilePath(file.path);
    currentPathRef.current = file.path; // Sync ref immediately
    setCurrentFileName(file.path.split('/').pop() || '');
    setUndoStack([]);
    
    setIntelData(null);
    setIntelFilePath('');
    setIntelError(null);
    setIntelLoading(true);
    setExpandedFolders(prev => new Set([...Array.from(prev), ...getParentFolders(file.path)]));
  };

  const getLanguageMode = (filePath: string) => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const modes: { [key: string]: string } = {
      js: 'javascript', jsx: 'javascript',
      ts: 'javascript', tsx: 'javascript',
      py: 'python', css: 'css',
      html: 'htmlmixed', json: 'javascript'
    };
    return modes[ext || ''] || 'javascript';
  };

  const fetchIntel = async (contentOverride?: string) => {
    const filePathAtStart = currentFilePath;
    const contentToUse = contentOverride || currentFileContent;
    
    if (!filePathAtStart || !contentToUse) return;
    
    // Reset error and start loading
    setIntelError(null);
    setIntelLoading(true);

    if (intelCache.current[filePathAtStart]) {
      console.log('Intel Cache Hit for:', filePathAtStart);
      if (currentPathRef.current === filePathAtStart) {
        setIntelData(intelCache.current[filePathAtStart]);
        setIntelFilePath(filePathAtStart);
        setIntelLoading(false);
      }
      return;
    }
    
    setIntelLoading(true);
    try {
      const jwt = await SecureStore.getItemAsync('userToken');
      const response = await axios.post(
        `${process.env.EXPO_PUBLIC_API_URL}/ai/analyze-file`,
        {
          filePath: filePathAtStart,
          fileContent: contentToUse.substring(0, 5000), // Increased context
          projectContext: repoName || repo,
          allFilePaths: flattenTree(treeData).slice(0, 20)
        },
        {
          headers: { Authorization: `Bearer ${jwt}` },
          timeout: 15000
        }
      );
      
      intelCache.current[filePathAtStart] = response.data;
      console.log('Intel Fetch Success for:', filePathAtStart);
      if (currentPathRef.current === filePathAtStart) {
        setIntelData(response.data);
        setIntelFilePath(filePathAtStart);
      }
    } catch(e: any) {
      console.error('Intel analysis failed:', e.message);
      if (currentPathRef.current === filePathAtStart) {
        setIntelError('Analysis failed. Tap to retry.');
      }
    } finally {
      if (currentPathRef.current === filePathAtStart) {
        setIntelLoading(false);
      }
    }
  };

  const handleIntelButtonPress = () => {
    setActiveTab('intel');
    setSheetVisible(true);
    if (intelError) fetchIntel();
  };

  const handleFloatingButtonPress = () => {
    setActiveTab('edit');
    setSelectedLine(null);
    setSheetVisible(true);
  };
  
  const handleApplyEdit = (newContent: string) => {
    if (!newContent) return;
    setUndoStack(prev => [...prev, currentFileContent].slice(-20));
    
    const fileKey = `${repo}:${currentFilePath}`;
    setModifiedFiles(prev => ({ ...prev, [fileKey]: newContent }));

    setCurrentFileContent(newContent);
    setCodeLines(newContent.split('\n'));
    setHasUnsavedChanges(true);
    
    if (webViewRef.current && webViewReady) {
      // Direct injection for immediate CodeMirror update
      const escaped = newContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
      webViewRef.current.injectJavaScript(`
        if (typeof editor !== 'undefined') {
          editor.setValue(\`${escaped}\`);
          editor.refresh();
        }
        true;
      `);
    }
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previousContent = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setCurrentFileContent(previousContent);
    setCodeLines(previousContent.split('\n'));
    
    if (webViewRef.current && webViewReady) {
      webViewRef.current.postMessage(JSON.stringify({
        type: 'SET_CONTENT',
        content: previousContent,
        mode: getLanguageMode(currentFilePath)
      }));
    }
    
    const fileKey = `${repo}:${currentFilePath}`;
    setModifiedFiles(prev => ({ ...prev, [fileKey]: previousContent }));
    setHasUnsavedChanges(undoStack.length > 1);
  };

  const handleSave = async () => {
    if (!hasUnsavedChanges || !currentFilePath) return;
    const fileKey = `${repo}:${currentFilePath}`;
    setSavedFiles(prev => ({
      ...prev,
      [fileKey]: { content: currentFileContent, sha: fileSha, savedAt: Date.now() }
    }));
    setModifiedFiles(prev => {
      const updated = { ...prev };
      delete updated[fileKey];
      return updated;
    });
    setHasUnsavedChanges(false);
    Alert.alert('Success', 'File saved locally ✓');
  };

  const handleRefresh = async () => {
    if (!currentFilePath) return;
    Alert.alert('Refresh File', 'Clear local changes and re-fetch?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Refresh', style: 'destructive', onPress: async () => {
         const fileKey = `${repo}:${currentFilePath}`;
         setModifiedFiles(prev => { const n = {...prev}; delete n[fileKey]; return n; });
         setSavedFiles(prev => { const n = {...prev}; delete n[fileKey]; return n; });
         setUndoStack([]);
         fetchFileContent(currentFilePath, true);
      }}
    ]);
  };

  const getFileState = (filePath: string) => {
    const fileKey = `${repo}:${filePath}`;
    if (modifiedFiles[fileKey]) return 'unsaved';
    if (savedFiles[fileKey]) return 'saved';
    return 'clean';
  };

  const handleCommit = async (filesToCommit: string[], message: string) => {
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync('userToken');
      for (const fileKey of filesToCommit) {
        const savedFile = savedFiles[fileKey];
        if (!savedFile) continue;
        const path = fileKey.split(':').slice(1).join(':');
        await axios.post(`${process.env.EXPO_PUBLIC_API_URL}/github/commit`, {
          repo, path, branch, content: savedFile.content, fileSha: savedFile.sha, message
        }, { headers: { Authorization: `Bearer ${token}` } });
        
        setSavedFiles(prev => { const n = {...prev}; delete n[fileKey]; return n; });
      }
      Alert.alert('Success', 'Pushed to GitHub successfully');
      fetchTree();
    } catch (err) {
      Alert.alert('Error', 'Commit failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const checkTutorial = async () => {
      if (!(await AsyncStorage.getItem('editor_tutorial_done'))) setIsTutorialVisible(true);
    };
    checkTutorial();
    if (repo && branch) {
      fetchTree();
      intelCache.current = {}; // Clear cache on repo/branch change
    }
  }, [repo, branch]);

  useEffect(() => {
    if (repo && currentFilePath && branch) {
      currentPathRef.current = currentFilePath;
      const fileKey = `${repo}:${currentFilePath}`;
      const hasLocal = !!modifiedFiles[fileKey] || !!savedFiles[fileKey];
      fetchFileContent(currentFilePath, !hasLocal);
    }
  }, [repo, currentFilePath, branch]);


  const handleTutorialNext = async () => {
    if (tutorialStep < 2) setTutorialStep(tutorialStep + 1);
    else { setIsTutorialVisible(false); await AsyncStorage.setItem('editor_tutorial_done', 'true'); }
  };

  useEffect(() => {
    if (webViewReady && webViewRef.current && currentFileContent !== undefined) {
      webViewRef.current.postMessage(JSON.stringify({
        type: 'SET_CONTENT', content: currentFileContent, mode: getLanguageMode(currentFilePath)
      }));
    }
  }, [webViewReady, currentFileContent, currentFilePath]);

  const htmlContent = useMemo(() => `
    <!DOCTYPE html><html><head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js"><\/script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/javascript/javascript.min.js"><\/script>
    <style>
      body { margin:0; background:#000; }
      .CodeMirror { height:100vh; font-size:12px; background:#000 !important; color:#d4d4d4 !important; font-family: monospace; }
      .CodeMirror-gutters { background:#000 !important; border-right:1px solid #111 !important; }
      .CodeMirror-linenumber { color:#333 !important; }
      .cm-keyword { color: #c678dd !important; }
      .cm-def { color: #61afef !important; }
      .cm-variable { color: #e06c75 !important; }
      .cm-variable-2 { color: #e06c75 !important; }
      .cm-string { color: #98c379 !important; }
      .cm-comment { color: #5c6370 !important; font-style: italic !important; }
      .cm-number { color: #d19a66 !important; }
      .cm-operator { color: #56b6c2 !important; }
    </style></head>
    <body><textarea id="code"></textarea><script>
      var editor = CodeMirror.fromTextArea(document.getElementById('code'), { lineNumbers: true, readOnly: 'nocursor', theme: 'default' });
      document.addEventListener('message', function(e) {
        var data = JSON.parse(e.data);
        if (data.type === 'SET_CONTENT') { editor.setOption('mode', data.mode); editor.setValue(data.content); editor.refresh(); }
      });
      editor.on('mousedown', function(cm, e) {
        var line = cm.lineAtHeight(e.clientY, 'window');
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'LINE_SELECTED', line: line }));
      });
    <\/script></body></html>
  `, []);

  const normalizePath = (p: string | undefined | null) => (p || '').replace(/\\/g, '/').replace(/^\//, '');
  const intelReadyForCurrent = !!(currentFilePath && normalizePath(intelFilePath) === normalizePath(currentFilePath) && intelData != null);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.hamburger} onPress={() => setIsDrawerOpen(true)}>
            <Ionicons name="menu" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.headerCenter}>
          <View style={styles.fileNameRow}>
            {hasUnsavedChanges && <View style={styles.unsavedDot} />}
            <Text style={styles.headerFileName} numberOfLines={1}>
              {currentFileName || 'Editor'}
            </Text>
          </View>
          {currentFilePath ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>{currentFilePath}</Text>
          ) : null}
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity 
            style={styles.iconBtn} 
            onPress={handleUndo} 
            disabled={undoStack.length === 0}
          >
            <MaterialIcons name="undo" size={18} color={undoStack.length === 0 ? "#333" : "#fff"} />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.iconBtn} 
            onPress={() => { setSheetVisible(true); setActiveTab('intel'); if (!intelData || intelFilePath !== currentFilePath) fetchIntel(); }}
          >
            {intelLoading ? (
              <ActivityIndicator size="small" color="#888" />
            ) : (
              <MaterialCommunityIcons 
                name="brain" 
                size={20} 
                color={intelReadyForCurrent ? COLORS.accent.green : "#888"} 
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.iconBtn} 
            onPress={handleSave} 
            disabled={!hasUnsavedChanges}
          >
            <Ionicons name="save-outline" size={18} color={hasUnsavedChanges ? COLORS.accent.green : "#333"} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.iconBtn} 
            onPress={() => setIsCommitSheetOpen(true)}
          >
            <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.iconBtn} 
            onPress={() => Alert.alert('Run', 'Running code...')}
          >
            <Ionicons name="play-outline" size={18} color={COLORS.accent.blue} />
          </TouchableOpacity>
        </View>
      </View>

      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        onLoad={() => setWebViewReady(true)}
        onMessage={(e) => {
          const data = JSON.parse(e.nativeEvent.data);
          if (data.type === 'LINE_SELECTED') { setSelectedLine(data.line); setSheetVisible(true); setActiveTab('edit'); }
        }}
        style={{ flex: 1 }}
      />

      {currentFilePath && !sheetVisible && (
        <TouchableOpacity style={styles.floatingAiButton} onPress={handleFloatingButtonPress}>
          <MaterialCommunityIcons name="robot" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      <LeftDrawer 
        isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} 
        repoName={repoName as string} repo={repo as string} branch={branch as string}
        currentPath={currentFilePath} treeData={treeData} expandedFolders={expandedFolders} 
        setExpandedFolders={setExpandedFolders} onFileSelect={handleFileSelect}
        modifiedFiles={modifiedFiles} savedFiles={savedFiles}
      />

      <CombinedEditorSheet 
        visible={sheetVisible} onClose={() => setSheetVisible(false)}
        activeTab={activeTab} setActiveTab={setActiveTab}
        fileName={currentFileName} filePath={currentFilePath} fileContent={currentFileContent}
        intelLoading={intelLoading} intelData={intelData} intelError={intelError} 
        intelFilePath={intelFilePath} onFetchIntel={fetchIntel}
        onEditComplete={(c, changes, impacted) => {
           setSheetVisible(false); setAiEditedContent(c); setAiChanges(changes); setImpactedFiles(impacted); setIsImpactReviewOpen(true);
        }}
      />

      <DiffViewer 
        isOpen={isDiffOpen} onClose={() => setIsDiffOpen(false)}
        fileName={currentFileName}
        changes={aiChanges}
        onApply={() => { handleApplyEdit(aiEditedContent); setIsDiffOpen(false); }}
      />

      <ImpactReviewScreen
        isVisible={isImpactReviewOpen}
        onClose={() => setIsImpactReviewOpen(false)}
        fileName={currentFileName}
        changes={aiChanges}
        impactedFiles={impactedFiles}
        onApplyCurrentOnly={() => {
           setIsImpactReviewOpen(false);
           setIsDiffOpen(true);
        }}
        onApplyAll={() => {
           setIsImpactReviewOpen(false);
           // Multi-file apply not yet implemented in handleApplyEdit, but opening diff for now
           setIsDiffOpen(true);
        }}
        onViewAndEdit={(file) => {
           setIsImpactReviewOpen(false);
           handleFileSelect({ path: file.path });
           setTimeout(() => {
              setSheetVisible(true);
              setActiveTab('edit');
           }, 1000);
        }}
      />

      <CommitSheet 
        isOpen={isCommitSheetOpen} onClose={() => setIsCommitSheetOpen(false)}
        onCommit={handleCommit} repo={repo as string}
      />

      <TutorialOverlay 
        isVisible={isTutorialVisible}
        onClose={() => setIsTutorialVisible(false)}
        currentStep={tutorialStep}
        onNext={handleTutorialNext}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#111' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { padding: 4 },
  backIcon: { color: '#fff', fontSize: 20 },
  hamburger: { gap: 4 },
  hamburgerLine: { width: 18, height: 1.5, backgroundColor: '#fff' },
  headerCenter: { flex: 1, alignItems: 'center' },
  fileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  unsavedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f59e0b' },
  headerFileName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  headerSubtitle: { color: '#555', fontSize: 10 },
  headerRight: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 8, borderRadius: 8, backgroundColor: '#111' },
  floatingAiButton: { position: 'absolute', bottom: 30, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.accent.blue, justifyContent: 'center', alignItems: 'center' },
  aiSquare: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: '#fff' },
});

export default EditorScreen;
