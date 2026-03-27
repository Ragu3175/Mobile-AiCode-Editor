import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { MaterialIcons, Ionicons, MaterialCommunityIcons, FontAwesome } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import {
  StyleSheet,
  View,
  Text,
  Animated,
  Dimensions,
  Pressable,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  Keyboard,
  Platform
} from 'react-native';
import { COLORS, TYPOGRAPHY } from '../constants/theme';

const { height } = Dimensions.get('window');
const SHEET_HEIGHT = height * 0.7;

interface CombinedEditorSheetProps {
  visible: boolean;
  onClose: () => void;
  activeTab: 'intel' | 'edit' | 'terminal';
  setActiveTab: (tab: 'intel' | 'edit' | 'terminal') => void;
  fileName: string;
  fileRole?: string;
  // Intel Props
  intelLoading: boolean;
  intelData: any | null;
  intelError: string | null;
  /** Path the current intelData belongs to (must match filePath to show intel) */
  intelFilePath?: string;
  /** Path that editor buffer / currentFileContent belongs to (must match before calling analyze API) */
  intelSourcePath?: string;
  onRetryIntel?: () => void;
  /** Parent refetches intel for the open file (stable ref recommended) */
  onFetchIntel?: () => void;
  // Edit Props
  lineNumber?: number | null;
  lineContent?: string;
  repoName?: string;
  repo?: string;
  branch?: string;
  filePath?: string;
  fileContent?: string;
  onEditComplete?: (editedContent: string, changes: any[], impactedFiles: any[]) => void;
}

const CombinedEditorSheet = ({
  visible: isOpen,
  onClose,
  activeTab,
  setActiveTab,
  fileName,
  fileRole,
  intelLoading,
  intelData,
  intelError,
  intelFilePath = '',
  intelSourcePath = '',
  onRetryIntel,
  onFetchIntel,
  lineNumber,
  lineContent,
  repoName,
  repo,
  branch,
  filePath,
  fileContent,
  onEditComplete,
}: CombinedEditorSheetProps) => {
  const slideAnim = useRef(new Animated.Value(height)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [visible, setVisible] = useState(isOpen);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['role', 'contents', 'connected']));
  const normalizePath = (p: string | undefined | null) => (p || '').replace(/\\/g, '/').replace(/^\//, '');
  const isCorrectIntel = !!(intelData && normalizePath(intelFilePath) === normalizePath(filePath));
  
  const [instruction, setInstruction] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingTime, setLoadingTime] = useState(0);
  // Voice Recording State & Refs
  const recordingRef = useRef<Audio.Recording | null>(null);
  const isActionInProgress = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [terminalMessages, setTerminalMessages] = useState<{ id: string, type: 'user' | 'ai', text: string }[]>([
    { id: 'welcome', type: 'ai', text: 'CodePilot Terminal v1.0 — type /help for commands' }
  ]);
  const [terminalInput, setTerminalInput] = useState('');
  const [isTerminalTyping, setIsTerminalTyping] = useState(false);
  const terminalScrollRef = useRef<ScrollView>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const recordingIntervalRef = useRef<any>(null);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      // Clear terminal session when modal closes
      setTerminalMessages([{ id: 'welcome', type: 'ai', text: 'CodePilot Terminal v1.0 — type /help for commands' }]);
      setTerminalInput('');
      setIsTerminalTyping(false);
    }
    return () => {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  const startRecording = async () => {
    if (isActionInProgress.current || isRecording) return;
    isActionInProgress.current = true;

    try {
      // 1. Defensively cleanup any existing recording object
      if (recordingRef.current) {
        try {
          await recordingRef.current.stopAndUnloadAsync();
        } catch (e) {}
        recordingRef.current = null;
      }

      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission denied', 'Microphone permission is required.');
        isActionInProgress.current = false;
        return;
      }

      // Set audio mode consistently
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      // 2. Manual instantiation for better lifecycle control
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

    } catch (err: any) {
      console.error('Failed to start recording:', err);
      // Special check for expo-av common stuck state
      if (err.message?.includes('Only one Recording object')) {
        Alert.alert('Recording Busy', 'The microphone is still cleaning up from the last use. Please wait 2 seconds and try again.');
      }
    } finally {
      isActionInProgress.current = false;
    }
  };

  const stopRecording = async () => {
    if (isActionInProgress.current || !recordingRef.current) {
      // If we think we are recording but lost the ref, reset state
      if (isRecording) setIsRecording(false);
      return;
    }
    isActionInProgress.current = true;

    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    try {
      const currentRecording = recordingRef.current;
      setIsRecording(false);
      
      await currentRecording.stopAndUnloadAsync();
      const uri = currentRecording.getURI();
      recordingRef.current = null; // Important: Clear AFTER successful unload

      if (uri) {
        handleTranscription(uri);
      }
    } catch (err) {
      console.error('Failed to stop recording:', err);
      recordingRef.current = null; // Clear anyway
      setIsRecording(false);
    } finally {
      isActionInProgress.current = false;
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleTranscription = async (uri: string) => {
    setIsTranscribing(true);
    try {
      const token = await SecureStore.getItemAsync('userToken');
      
      const formData = new FormData();
      // @ts-ignore
      formData.append('audio', {
        uri,
        name: 'recording.m4a',
        type: 'audio/m4a',
      });

      const response = await axios.post(`${process.env.EXPO_PUBLIC_API_URL}/api/transcribe`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.data.transcript) {
        setInstruction(prev => prev ? `${prev} ${response.data.transcript}` : response.data.transcript);
      }
    } catch (err: any) {
      console.error('Transcription failed', err.response?.data || err.message);
      Alert.alert('Transcription Failed', 'Could not convert voice to text. Please try again.');
    } finally {
      setIsTranscribing(false);
    }
  };


  useEffect(() => {
    let interval: any;
    if (intelLoading) {
      setLoadingTime(0);
      interval = setInterval(() => {
        setLoadingTime(prev => prev + 1);
      }, 1000);
    } else {
      setLoadingTime(0);
    }
    return () => clearInterval(interval);
  }, [intelLoading]);

  const getLoadingMessage = () => {
    if (loadingTime < 5) return 'Reading file...';
    if (loadingTime < 10) return 'Analyzing functions...';
    if (loadingTime < 15) return 'Almost done...';
    return 'Still working...';
  };

  const isIntelValid =
    !!filePath &&
    intelFilePath === filePath &&
    intelData != null;

  const contentReadyForIntel = !!filePath && intelSourcePath === filePath;

  useEffect(() => {
    if (!isOpen || activeTab !== 'intel' || !filePath || !onFetchIntel) return;
    if (!contentReadyForIntel) return;
    if (intelError) return;
    if (isIntelValid || intelLoading) return;
    onFetchIntel();
  }, [
    isOpen,
    activeTab,
    filePath,
    intelFilePath,
    intelData,
    intelLoading,
    intelError,
    isIntelValid,
    contentReadyForIntel,
    onFetchIntel,
  ]);

  useEffect(() => {
    if (activeTab === 'intel' && filePath) {
      console.log('Intel tab — current file:', filePath, 'intel for:', intelFilePath, 'match:', intelFilePath === filePath);
    }
  }, [activeTab, filePath, intelFilePath]);

  useEffect(() => {
    console.log('[Sheet] prop visible changed:', isOpen);
    console.log('[Sheet] current local visible state:', visible);
  }, [isOpen, visible]);

  useEffect(() => {
    if (isOpen) setVisible(true);
    
    // Calculate new translateY position
    // Default open: height - SHEET_HEIGHT
    // With Keyboard: height - SHEET_HEIGHT - keyboardHeight
    const targetY = isOpen 
      ? height - SHEET_HEIGHT - (activeTab === 'terminal' ? keyboardHeight : 0) 
      : height;

    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: targetY,
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
    console.log('[CombinedEditorSheet] isOpen:', isOpen, 'file:', filePath, 'intelFile:', intelFilePath);
  }, [isOpen, keyboardHeight, activeTab]);

  if (!visible) return null;

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const renderIntelTab = () => {
    console.log('[CombinedEditorSheet] renderIntelTab | file:', filePath, 'intelFile:', intelFilePath, 'match:', isCorrectIntel, 'loading:', intelLoading);

    if (intelLoading) {
      return (
        <View style={styles.tabContent}>
          <View style={styles.centerContent}>
            <ActivityIndicator color="#3b82f6" size="large" />
            <Text style={styles.loadingText}>Analyzing {fileName}...</Text>
          </View>
        </View>
      );
    }

    if (isCorrectIntel) {
      return (
        <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
          {/* Section 1: Role */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ROLE IN PROJECT</Text>
            <Text style={styles.roleValue}>{intelData.role}</Text>
          </View>

          {/* Section 2: Contents */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>FILE CONTENTS</Text>
            {intelData.contents?.map((item: any, idx: number) => (
              <View key={idx} style={styles.contentRow}>
                <View style={styles.blueDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.contentName}>{item.name}</Text>
                  <Text style={styles.contentDesc}>{item.description}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Section 3: Connections */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>CONNECTED FILES</Text>
            <View style={styles.pillsContainer}>
              {intelData.connectedFiles?.map((file: any, idx: number) => (
                <TouchableOpacity 
                  key={idx} 
                  style={styles.pill}
                  onPress={() => Alert.alert('Connection Info', `${file.path}\n\n${file.reason}`)}
                >
                  <Text style={styles.pillText}>{file.path.split('/').pop()}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity 
            style={styles.fullWidthButton}
            onPress={() => setActiveTab('edit')}
          >
            <Text style={styles.fullWidthButtonText}>Edit File</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }

    if (intelError) {
      return (
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>{intelError}</Text>
          <TouchableOpacity 
            onPress={() => onFetchIntel ? onFetchIntel() : null} 
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>Tap to Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.tabContent}>
        <View style={styles.centerContent}>
          <Text style={styles.loadingText}>No intelligence available.</Text>
          <TouchableOpacity 
            onPress={() => onFetchIntel ? onFetchIntel() : null} 
            style={styles.analyzeButton}
          >
             <Text style={styles.analyzeButtonText}>Analyze File</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };
  
  const handleGenerateEdit = async () => {
    // FIX 3 - Add guard before calling API
    if (!fileContent || fileContent.trim() === '') {
      Alert.alert('Error', 'File content is empty. Please reload the file.');
      return;
    }

    if (!instruction.trim()) {
      Alert.alert('Error', 'Please describe what to change.');
      return;
    }

    if (!filePath) {
      Alert.alert('Error', 'File path is missing.');
      return;
    }
    
    setIsGenerating(true);
    try {
      const token = await SecureStore.getItemAsync('userToken');
      // FIX 4 - Make sure token exists
      if (!token) {
        Alert.alert('Error', 'Session expired. Please login again.');
        setIsGenerating(false);
        return;
      }

      // FIX 2 - Add console.log before the axios call
      console.log('Sending to edit-code:', {
        fileContent: (fileContent || '').length + ' chars',
        filePath: filePath,
        instruction: instruction,
        startLine: (lineNumber !== null && lineNumber !== undefined) ? lineNumber + 1 : null,
        projectContext: repoName || 'unknown',
        connectedFiles: (isCorrectIntel ? intelData?.connectedFiles?.length : 0) || 0
      });

      const response = await axios.post(`${process.env.EXPO_PUBLIC_API_URL}/ai/edit-code`, {
        filePath,
        fileContent,
        instruction,
        projectContext: repoName || 'unknown',
        startLine: (lineNumber !== null && lineNumber !== undefined) ? lineNumber + 1 : null,
        connectedFiles: isCorrectIntel ? intelData?.connectedFiles || [] : [],
      }, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 30000
      });
      
      const data = response.data;
      
      if (onEditComplete && data.editedContent) {
        // Validation: check if AI returned incomplete file
        if (data.editedContent.length < fileContent.length * 0.3 && fileContent.length > 500) {
          Alert.alert(
            'Edit Failed',
            'AI returned incomplete code. Please try again with a simpler instruction.'
          );
          return;
        }

        onEditComplete(data.editedContent, data.changes || [], data.impactedFiles || []);
        setInstruction('');
      } else {
        console.error("AI returned invalid data format", data);
      }
    } catch (error: any) {
      console.warn("Generation stopped or failed:", error.message);
      const msg = error.response?.data?.error || error.message;
      Alert.alert('Edit Failed', msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTerminalSubmit = async () => {
    if (!terminalInput.trim() || isTerminalTyping) return;

    const cmd = terminalInput.trim();
    const userMsg = { id: Date.now().toString(), type: 'user' as const, text: cmd };
    setTerminalMessages(prev => [...prev, userMsg]);
    setTerminalInput('');
    Keyboard.dismiss();

    // Handle slash commands
    if (cmd.startsWith('/')) {
      let aiResponse = '';
      if (cmd === '/help') {
        aiResponse = 'Available commands:\n/help  - Show this help\n/clear - Clear terminal history\n/file  - Show current file info';
      } else if (cmd === '/clear') {
        setTerminalMessages([{ id: 'welcome', type: 'ai', text: 'Terminal cleared.' }]);
        return;
      } else if (cmd === '/file') {
        aiResponse = `Current File: ${fileName}\nPath: ${filePath || 'N/A'}\nRole: ${fileRole || 'N/A'}`;
      } else {
        aiResponse = `Unknown command: ${cmd}. Type /help for assistance.`;
      }
      
      setTerminalMessages(prev => [...prev, { id: (Date.now() + 1).toString(), type: 'ai', text: aiResponse }]);
      return;
    }

    // Call AI
    setIsTerminalTyping(true);
    try {
      const token = await SecureStore.getItemAsync('userToken');
      const response = await axios.post(`${process.env.EXPO_PUBLIC_API_URL}/ai/terminal`, {
        prompt: cmd,
        fileContent,
        filePath,
        projectContext: repoName || 'unknown'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setTerminalMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        type: 'ai', 
        text: response.data.response 
      }]);
    } catch (err: any) {
      console.error('Terminal AI error:', err.message);
      setTerminalMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        type: 'ai', 
        text: 'Error: Could not reach AI assistant.' 
      }]);
    } finally {
      setIsTerminalTyping(false);
      setTimeout(() => terminalScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const renderTerminalTab = () => {
    return (
      <View style={styles.terminalContainer}>
        <ScrollView 
          ref={terminalScrollRef}
          style={styles.terminalOutput} 
          contentContainerStyle={{ paddingBottom: 20 }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => terminalScrollRef.current?.scrollToEnd({ animated: true })}
        >
          {terminalMessages.map((msg) => (
            <View key={msg.id} style={styles.terminalMessage}>
              <Text style={[
                styles.terminalText, 
                msg.type === 'user' ? styles.userCommandText : styles.aiResponseText
              ]}>
                {msg.type === 'user' ? `$ ${msg.text}` : msg.text}
              </Text>
            </View>
          ))}
          {isTerminalTyping && (
            <Text style={[styles.terminalText, styles.aiResponseText]}>thinking...</Text>
          )}
        </ScrollView>

        <View style={styles.terminalInputRow}>
          <TextInput
            style={styles.terminalInput}
            value={terminalInput}
            onChangeText={setTerminalInput}
            placeholder="Type a command or ask AI..."
            placeholderTextColor="#555"
            onSubmitEditing={handleTerminalSubmit}
            editable={!isTerminalTyping}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity 
            style={[styles.terminalSendBtn, !terminalInput.trim() && { opacity: 0.5 }]}
            onPress={handleTerminalSubmit}
            disabled={!terminalInput.trim() || isTerminalTyping}
          >
            <MaterialCommunityIcons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderEditTab = () => {
    return (
      <ScrollView style={styles.tabContent}>
        <Text style={styles.sectionLabel}>
          LINE {(lineNumber !== null && lineNumber !== undefined) ? lineNumber + 1 : '...'} SELECTED
        </Text>
        
        <View style={styles.codePreview}>
          <Text style={styles.codeText} numberOfLines={3}>
            {lineContent || '// No line selected'}
          </Text>
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Tell AI what to change..."
            placeholderTextColor="#888"
            multiline
            value={instruction}
            onChangeText={setInstruction}
            editable={!isGenerating}
          />
        </View>

        <View style={styles.suggestionsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestionsScroll}>
            <TouchableOpacity style={styles.pillSuggestions} onPress={() => setInstruction('Rewrite logic')} disabled={isGenerating}><Text style={styles.pillSuggestionsText}>Rewrite logic</Text></TouchableOpacity>
            <TouchableOpacity style={styles.pillSuggestions} onPress={() => setInstruction('Add logging')} disabled={isGenerating}><Text style={styles.pillSuggestionsText}>Add logging</Text></TouchableOpacity>
            <TouchableOpacity style={styles.pillSuggestions} onPress={() => setInstruction('Fix bug')} disabled={isGenerating}><Text style={styles.pillSuggestionsText}>Fix bug</Text></TouchableOpacity>
            <TouchableOpacity style={styles.pillSuggestions} onPress={() => setInstruction('Refactor for performance')} disabled={isGenerating}><Text style={styles.pillSuggestionsText}>Refactor</Text></TouchableOpacity>
          </ScrollView>
        </View>

        <View style={styles.bottomRow}>
          <TouchableOpacity 
            style={[
              styles.voiceButton, 
              isRecording && styles.recordingActive
            ]} 
            onPress={toggleRecording}
            disabled={isGenerating || isTranscribing}
          >
            {isTranscribing ? (
              <ActivityIndicator size="small" color="#3b82f6" />
            ) : isRecording ? (
              <View style={styles.recordingIndicator}>
                <View style={styles.pulseDot} />
                <Text style={styles.durationText}>{recordingDuration}s</Text>
              </View>
            ) : (
              <FontAwesome name="microphone" size={20} color={isGenerating ? "#333" : "#e0e0e0"} />
            )}
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.generateButton, (isGenerating || !instruction.trim()) && { opacity: 0.7 }]} 
            onPress={handleGenerateEdit}
            disabled={isGenerating || isTranscribing || !instruction.trim()}
          >
            {isGenerating ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.generateText}>Generate Edit</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={isOpen ? 'auto' : 'none'}>
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.handle} />
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerFileName}>{fileName}</Text>
          <Text style={styles.headerPathHint} numberOfLines={1}>
            {filePath || fileName}
          </Text>
          <Text style={styles.headerFileRole}>
            {fileRole || (activeTab === 'intel' ? 'File intelligence' : 'Edit with AI')}
          </Text>
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabSwitcher}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'intel' && styles.activeTabButton]}
            onPress={() => setActiveTab('intel')}
          >
            <Text style={[styles.tabText, activeTab === 'intel' && styles.activeTabText]}>File Intel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'edit' && styles.activeTabButton]}
            onPress={() => setActiveTab('edit')}
          >
            <Text style={[styles.tabText, activeTab === 'edit' && styles.activeTabText]}>Edit with AI</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'terminal' && styles.activeTabButton]}
            onPress={() => setActiveTab('terminal')}
          >
            <Text style={[styles.tabText, activeTab === 'terminal' && styles.activeTabText]}>AI Terminal</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        <View style={{ flex: 1 }}>
          {activeTab === 'intel' ? renderIntelTab() : 
           activeTab === 'edit' ? renderEditTab() : 
           renderTerminalTab()}
        </View>
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
    backgroundColor: '#0d0d0d',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 0.5,
    borderTopColor: '#252525',
    padding: 20,
    paddingTop: 12,
  },
  handle: {
    width: 32,
    height: 4,
    backgroundColor: '#1a1a1a',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    marginBottom: 20,
    alignItems: 'center',
  },
  headerFileName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#e0e0e0',
  },
  headerPathHint: {
    fontSize: 10,
    color: '#555',
    marginTop: 4,
    maxWidth: '100%',
    paddingHorizontal: 8,
  },
  headerFileRole: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  intelFileBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.accent.blue,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#161616',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  activeTabButton: {
    backgroundColor: '#3b82f6',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
  },
  activeTabText: {
    color: '#fff',
  },
  tabContent: {
    flex: 1,
  },
  loadingHeaderText: {
    color: '#e0e0e0',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 20,
  },
  skeletonContainer: {
    gap: 12,
  },
  skeletonLine: {
    backgroundColor: '#1a1a1a',
    borderRadius: 4,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
  },
  loadingText: {
    color: '#aaa',
    fontSize: 13,
    marginTop: 12,
  },
  errorText: {
    color: '#f87171',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  retryText: {
    color: '#e0e0e0',
    fontSize: 13,
    fontWeight: '600',
  },
  analyzeButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
  },
  analyzeButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  section: {
    marginBottom: 28,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  roleValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#e0e0e0',
    lineHeight: 22,
  },
  contentRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
  },
  blueDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
    marginTop: 6,
  },
  contentName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3b82f6',
    marginBottom: 2,
  },
  contentDesc: {
    fontSize: 12,
    color: '#888',
    lineHeight: 18,
  },
  pillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    backgroundColor: '#111',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3b82f6',
  },
  fullWidthButton: {
    width: '100%',
    paddingVertical: 14,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 30,
  },
  fullWidthButtonText: {
    color: '#e0e0e0',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyText: {
    color: '#555',
    fontSize: 14,
    marginBottom: 16,
  },
  // Terminal Styles
  terminalContainer: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#111',
  },
  terminalOutput: {
    flex: 1,
    marginBottom: 10,
  },
  terminalMessage: {
    marginBottom: 8,
  },
  terminalText: {
    fontFamily: 'monospace',
    fontSize: 14,
    lineHeight: 20,
  },
  userCommandText: {
    color: '#4ade80', // Green for user commands
    fontWeight: '700',
  },
  aiResponseText: {
    color: '#ffffff', // Bright white for AI responses
    fontWeight: '400',
  },
  terminalInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#111',
  },
  terminalInput: {
    flex: 1,
    backgroundColor: '#050505',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#4ade80',
    fontFamily: 'monospace',
    fontSize: 14,
  },
  terminalSendBtn: {
    width: 40,
    height: 40,
    backgroundColor: '#3b82f6',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Keep original edit tab styles
  codePreview: {
    backgroundColor: '#050505',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#111',
  },
  codeText: {
    fontSize: 11,
    color: '#888',
    fontFamily: 'monospace',
  },
  inputContainer: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#1a1a1a',
    borderRadius: 12,
    padding: 15,
    fontSize: 14,
    color: '#fff',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  suggestionsContainer: {
    marginBottom: 20,
  },
  suggestionsScroll: {
    flexDirection: 'row',
  },
  pillSuggestions: {
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  pillSuggestionsText: {
    fontSize: 11,
    color: '#777',
    fontWeight: '600',
  },
  bottomRow: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 20,
  },
  voiceButton: {
    width: 52,
    height: 52,
    backgroundColor: '#161616',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceIcon: {
    fontSize: 20,
  },
  recordingActive: {
    backgroundColor: '#3b1a1a',
    borderColor: '#ef4444',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  durationText: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: '700',
  },
  generateButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  generateText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '700',
  },
});

export default CombinedEditorSheet;
