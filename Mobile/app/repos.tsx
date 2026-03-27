import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, FlatList, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS } from '../constants/theme';
import { useAppContext } from '../context/AppContext';
import { Ionicons } from '@expo/vector-icons';

const RepoItem = ({ item, onPress }: { item: any, onPress: (item: any) => void }) => {
  const { modifiedFiles } = useAppContext();
  const hasModifiedFiles = Object.keys(modifiedFiles).some(key => key.startsWith(`${item.full_name}:`));

  return (
    <TouchableOpacity 
      style={styles.repoItem} 
      activeOpacity={0.7}
      onPress={() => onPress(item)}
    >
      <View style={styles.repoInfo}>
        <View style={styles.repoNameRow}>
          <Text style={styles.repoName}>{item.name}</Text>
          {hasModifiedFiles && (
            <View style={styles.modifiedDot} />
          )}
        </View>
        <Text style={styles.repoMeta}>
          Updated {new Date(item.updated_at).toLocaleDateString()} · {item.default_branch}
        </Text>
      </View>
      <View style={[styles.badge, item.private ? styles.privateBadge : styles.publicBadge]}>
        <Text style={[styles.badgeText, item.private ? styles.privateBadgeText : styles.publicBadgeText]}>
          {item.private ? 'private' : 'public'}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const RepoListScreen = () => {
  const router = useRouter();
  const [repos, setRepos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('Account');

  useEffect(() => {
    fetchRepos();
    loadUsername();
  }, []);

  const loadUsername = async () => {
    const saved = await SecureStore.getItemAsync('username');
    if (saved) setUsername(saved);
  };

  const fetchRepos = async () => {
    try {
      setLoading(true);
      const token = await SecureStore.getItemAsync('userToken');
      if (!token) {
        router.replace('/login' as any);
        return;
      }
      const response = await axios.get(`${process.env.EXPO_PUBLIC_API_URL}/github/repos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRepos(response.data);
    } catch (err: any) {
      console.error('Error fetching repos:', err);
      if (err.response?.status === 401) {
        await SecureStore.deleteItemAsync('userToken');
        router.replace('/login' as any);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRepoPress = (item: any) => {
    router.push({
      pathname: '/files' as any,
      params: { 
        repo: item.full_name, 
        branch: item.default_branch,
        repoName: item.name 
      }
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Top Bar */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Your Repos</Text>
          <Text style={styles.headerSubtitle}>{username}</Text>
        </View>
        <TouchableOpacity style={styles.profileButton} activeOpacity={0.7}>
          <View style={styles.blueDot} />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search repositories..."
          placeholderTextColor={COLORS.text.loginTagline}
        />
      </View>

      {/* Repo List */}
      <FlatList
        data={repos}
        renderItem={({ item }) => <RepoItem item={item} onPress={handleRepoPress} />}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={fetchRepos}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text.primary,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#555',
    marginTop: 2,
  },
  profileButton: {
    width: 32,
    height: 32,
    backgroundColor: '#121212',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#181818',
    justifyContent: 'center',
    alignItems: 'center',
  },
  blueDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
    backgroundColor: COLORS.accent.blue,
  },
  searchContainer: {
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  searchInput: {
    backgroundColor: '#0D0D0D',
    borderWidth: 1,
    borderColor: '#181818',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 13,
    color: COLORS.text.primary,
  },
  listContent: {
    paddingBottom: 40,
  },
  repoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#080808',
  },
  repoInfo: {
    flex: 1,
  },
  repoName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: 4,
  },
  repoMeta: {
    fontSize: 12,
    color: COLORS.accent.blue,
    opacity: 0.7,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  publicBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    borderColor: 'rgba(16, 185, 129, 0.1)',
  },
  privateBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
    borderColor: 'rgba(245, 158, 11, 0.1)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'lowercase',
  },
  publicBadgeText: {
    color: COLORS.accent.green,
  },
  privateBadgeText: {
    color: COLORS.accent.orange,
  },
  repoNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modifiedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f59e0b',
  },
});

export default RepoListScreen;
