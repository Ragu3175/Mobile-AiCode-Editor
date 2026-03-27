import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AppContextType {
  modifiedFiles: { [key: string]: string };
  setModifiedFiles: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;
  savedFiles: { [key: string]: { content: string, sha: string, savedAt: number } };
  setSavedFiles: React.Dispatch<React.SetStateAction<{ [key: string]: { content: string, sha: string, savedAt: number } }>>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const SAVED_FILES_KEY = 'codepilot_saved_files';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [modifiedFiles, setModifiedFiles] = useState<{ [key: string]: string }>({});
  const [savedFiles, setSavedFiles] = useState<{ [key: string]: { content: string, sha: string, savedAt: number } }>({});
  const [isLoaded, setIsLoaded] = useState(false);

  // Load savedFiles from AsyncStorage on mount
  useEffect(() => {
    const loadState = async () => {
      try {
        const saved = await AsyncStorage.getItem(SAVED_FILES_KEY);
        if (saved) {
          setSavedFiles(JSON.parse(saved));
        }
      } catch (err) {
        console.error('Failed to load saved files from storage:', err);
      } finally {
        setIsLoaded(true);
      }
    };
    loadState();
  }, []);

  // Save savedFiles to AsyncStorage whenever state changes
  useEffect(() => {
    if (isLoaded) {
      const saveState = async () => {
        try {
          await AsyncStorage.setItem(SAVED_FILES_KEY, JSON.stringify(savedFiles));
        } catch (err) {
          console.error('Failed to save saved files to storage:', err);
        }
      };
      saveState();
    }
  }, [savedFiles, isLoaded]);

  return (
    <AppContext.Provider value={{ modifiedFiles, setModifiedFiles, savedFiles, setSavedFiles }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
