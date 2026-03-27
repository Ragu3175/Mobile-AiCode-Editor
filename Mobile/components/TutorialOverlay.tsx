import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Modal, Dimensions } from 'react-native';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS } from '../constants/theme';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';

interface TutorialOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  currentStep: number;
  onNext: () => void;
}

const STEPS = [
  {
    id: 1,
    title: "Undo Edits (↩)",
    message: "Undo your last AI edit — step by step like Ctrl+Z. The badge shows how many steps are available.",
    icon: <MaterialIcons name="undo" size={24} color="#e0e0e0" />
  },
  {
    id: 2,
    title: "File Intel (🧠)",
    message: "Understand what this file does — AI analyzes functions and connections to other files.",
    icon: <MaterialIcons name="psychology" size={24} color="#3b82f6" />
  },
  {
    id: 3,
    title: "Push to GitHub (☁️)",
    message: "Push your changes to GitHub — only when you are ready. Turns orange when you have local changes.",
    icon: <Ionicons name="cloud-upload-outline" size={24} color="#f59e0b" />
  }
];

const TutorialOverlay = ({ isVisible, onClose, currentStep, onNext }: TutorialOverlayProps) => {
  if (!isVisible || currentStep >= STEPS.length) return null;

  return (
    <Modal visible={isVisible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            {STEPS[currentStep].icon}
          </View>

          {/* Content */}
          <Text style={styles.title}>{STEPS[currentStep].title}</Text>
          <Text style={styles.message}>{STEPS[currentStep].message}</Text>

          {/* Button */}
          <TouchableOpacity style={styles.button} onPress={onNext}>
            <Text style={styles.buttonText}>
              {currentStep === STEPS.length - 1 ? 'Start Coding' : 'Got it →'}
            </Text>
          </TouchableOpacity>

          {/* Indicators */}
          <View style={styles.indicators}>
            {STEPS.map((_, index) => (
              <View 
                key={index} 
                style={[
                  styles.dot, 
                  index === currentStep && styles.activeDot
                ]} 
              />
            ))}
          </View>

          {/* Skip */}
          <TouchableOpacity style={styles.skipButton} onPress={onClose}>
            <Text style={styles.skipText}>Skip tutorial</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  card: {
    width: '100%',
    backgroundColor: '#111',
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: '#252525',
    padding: 24,
    alignItems: 'center',
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  indicators: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 20,
    marginBottom: 10,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2a2a2a',
  },
  activeDot: {
    backgroundColor: COLORS.accent.blue,
    width: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  message: {
    fontSize: 13,
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  button: {
    width: '100%',
    backgroundColor: COLORS.accent.blueDark,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  skipButton: {
    marginTop: 20,
  },
  skipText: {
    fontSize: 11,
    color: '#444',
  },
});

export default TutorialOverlay;
