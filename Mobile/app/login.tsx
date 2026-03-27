import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar, ActivityIndicator, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, TYPOGRAPHY, BORDER_RADIUS } from '../constants/theme';
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import API_URL from '../config/api';
import { useRouter } from 'expo-router';

// GitHub OAuth configuration
const githubClientId = process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID || 'Ov23lijbCjsr7FA6004i';
const discovery = {
  authorizationEndpoint: 'https://github.com/login/oauth/authorize',
  tokenEndpoint: 'https://github.com/login/oauth/access_token',
  revocationEndpoint: `https://github.com/settings/connections/applications/${githubClientId}`,
};

const LoginScreen = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Dynamic redirect URI for better flexibility
  const redirectUri = AuthSession.makeRedirectUri();

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: githubClientId,
      scopes: ['repo', 'user'],
      redirectUri: redirectUri,
      usePKCE: false, // Disable PKCE
    },
    discovery
  );

  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      console.log('Received Deep Link URL:', event.url);
      if (event.url.includes('code=')) {
        const code = event.url.split('code=')[1].split('&')[0];
        console.log('Extracted code from URL:', code);
        handleLogin(code);
      } else if (event.url.includes('error=')) {
        console.error('Deep link error:', event.url);
        Alert.alert('Auth Error', 'GitHub returned an error: ' + event.url);
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Also check for initial URL (if app was closed)
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('Initial URL:', url);
        if (url.includes('code=')) {
          const code = url.split('code=')[1].split('&')[0];
          handleLogin(code);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (response?.type === 'success') {
      const { code } = response.params;
      console.log('Browser closed with success');
      // handleLogin(code); // We rely on Linking listener for better reliability
    } else if (response?.type === 'cancel') {
      setLoading(false);
      console.log('Browser closed - cancelled');
      Alert.alert('Login', 'Login cancelled');
    } else if (response?.type === 'error') {
      setLoading(false);
      console.log('Browser closed - error');
      Alert.alert('Login', 'OAuth error occurred');
    }
  }, [response]);

  const onLoginPress = async () => {
    try {
      setLoading(true);
      const state = Math.random().toString(36).substring(7);
      const authUrl = `https://github.com/login/oauth/authorize?client_id=${githubClientId}&scope=repo,user&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
      console.log('Opening auth URL:', authUrl);
      console.log('Redirect URI:', redirectUri);
      await promptAsync();
      console.log('Browser closed');
    } catch (error: any) {
      setLoading(false);
      console.error('Launch error:', error);
      Alert.alert('Auth Error', error.message || JSON.stringify(error));
    }
  };

  const handleLogin = async (code: string) => {
    try {
      setLoading(true);
      console.log('Backend URL:', `${API_URL}/auth/github`);
      console.log('Calling backend with code...');
      const res = await axios.post(`${API_URL}/auth/github`, { code });
      const { token, username } = res.data;
      console.log('JWT received:', token);

      if (token) {
        await SecureStore.setItemAsync('userToken', token);
        if (username) await SecureStore.setItemAsync('username', username);
        router.replace('/repos' as any);
      } else {
        throw new Error('No token received');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      Alert.alert('Auth Error', error.response?.data?.error || error.message || JSON.stringify(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.content}>
        {/* App Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoOuter}>
            <View style={styles.logoInner} />
          </View>
        </View>

        {/* App Name */}
        <Text style={styles.appName}>CodePilot</Text>

        {/* Tagline */}
        <Text style={styles.tagline}>
          Code anywhere.{"\n"}No keyboard needed.
        </Text>

        {/* GitHub Button */}
        <TouchableOpacity 
          style={[styles.githubButton, loading && styles.disabledButton]} 
          activeOpacity={0.7}
          onPress={onLoginPress}
          disabled={loading || !request}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.background.login} size="small" />
          ) : (
            <>
              <View style={styles.githubIconContainer}>
                <View style={styles.githubIconCircle} />
              </View>
              <Text style={styles.githubButtonText}>Continue with GitHub</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.login,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  logoContainer: {
    marginBottom: 24,
  },
  logoOuter: {
    width: 64,
    height: 64,
    backgroundColor: COLORS.background.elevated,
    borderRadius: BORDER_RADIUS.icon * 2,
    borderWidth: 1,
    borderColor: COLORS.border.subtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoInner: {
    width: 28,
    height: 28,
    backgroundColor: COLORS.accent.blue,
    borderRadius: 6,
    shadowColor: COLORS.accent.blue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 5,
  },
  appName: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text.primary,
    letterSpacing: -1,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 13,
    color: COLORS.text.secondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 48,
    fontWeight: '400',
  },
  githubButton: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 8,
    minHeight: 52,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  disabledButton: {
    opacity: 0.6,
  },
  githubIconContainer: {
    marginRight: 10,
  },
  githubIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  githubButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
});

export default LoginScreen;
