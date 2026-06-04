/**
 * App.tsx — ComfyUI Prompt Sender
 *
 * React Native CLI (JavaScript) screen that builds a ComfyUI node-graph
 * workflow, optionally attaches up to two gallery images via
 * react-native-image-picker, and POSTs the multipart payload to the
 * active ngrok-proxied backend.
 *
 * @format
 */

// ─── Global Endpoint ────────────────────────────────────────────────────────
const GLOBAL_API_URL = 'https://sublingual-shaun-clumpy.ngrok-free.dev';
// ─────────────────────────────────────────────────────────────────────────────

import React, {useState, useRef, useCallback} from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  StatusBar,
  Platform,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {launchImageLibrary} from 'react-native-image-picker';

// ─── Types ──────────────────────────────────────────────────────────────────
/** Minimal shape we keep per picked image. */
interface PickedImage {
  uri: string;
  fileName: string;
  type: string;
}

// ─── Component ──────────────────────────────────────────────────────────────
function App(): React.JSX.Element {
  // ── state ──────────────────────────────────────────────────────────────
  const [promptText, setPromptText] = useState<string>('');
  const [image1, setImage1] = useState<PickedImage | null>(null);
  const [image2, setImage2] = useState<PickedImage | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusLog, setStatusLog] = useState<string[]>(['[IDLE]']);

  const scrollRef = useRef<ScrollView>(null);

  // ── helpers ────────────────────────────────────────────────────────────

  /** Append a line to the live status console and auto-scroll. */
  const pushStatus = useCallback((msg: string) => {
    setStatusLog(prev => [...prev, msg]);
    setTimeout(() => scrollRef.current?.scrollToEnd({animated: true}), 100);
  }, []);

  /** Launch gallery picker and return a PickedImage or null. */
  const pickImage = useCallback(
    (slot: 1 | 2) => {
      launchImageLibrary(
        {mediaType: 'photo', quality: 0.9, selectionLimit: 1},
        response => {
          if (response.didCancel) {
            pushStatus(`[IMAGE ${slot}] Selection cancelled.`);
            return;
          }
          if (response.errorCode) {
            pushStatus(
              `[IMAGE ${slot}] Error: ${response.errorMessage ?? response.errorCode}`,
            );
            return;
          }
          const asset = response.assets?.[0];
          if (asset?.uri) {
            const picked: PickedImage = {
              uri: asset.uri,
              fileName: asset.fileName ?? `image_${slot}.jpg`,
              type: asset.type ?? 'image/jpeg',
            };
            if (slot === 1) {
              setImage1(picked);
            } else {
              setImage2(picked);
            }
            pushStatus(`[IMAGE ${slot}] Selected: ${picked.fileName}`);
          }
        },
      );
    },
    [pushStatus],
  );

  // ── core send logic ────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const endpoint = `${GLOBAL_API_URL}/api/prompt`;

    // 1. Build the ComfyUI node-graph workflow object
    const promptWorkflowObject = {
      nodes: {
        '1': {type: 'LoadImage', inputs: {image: 'image_1.png'}},
        '2': {type: 'LoadImage', inputs: {image: 'image_2.png'}},
        '3': {
          type: 'CLIPTextEncode',
          inputs: {text: promptText},
        },
        '4': {type: 'KSampler', inputs: {seed: 42, steps: 20}},
      },
      links: [
        [1, 0, 4, 0],
        [2, 0, 4, 1],
      ],
    };

    // 2. Assemble FormData
    const formData = new FormData();
    formData.append('prompt_workflow', JSON.stringify(promptWorkflowObject));

    // Conditionally append images under the SAME key 'images'
    if (image1) {
      formData.append('images', {
        uri: image1.uri,
        name: image1.fileName,
        type: image1.type,
      } as any);
    }
    if (image2) {
      formData.append('images', {
        uri: image2.uri,
        name: image2.fileName,
        type: image2.type,
      } as any);
    }

    const imageCount = (image1 ? 1 : 0) + (image2 ? 1 : 0);
    pushStatus(
      `[SENDING... Submitting to Ngrok Proxy] ${imageCount} image(s) attached`,
    );
    setIsLoading(true);

    // 3. POST via fetch inside try/catch
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'multipart/form-data',
        },
      });

      if (!response.ok) {
        // Attempt to parse error detail from backend
        let detail = response.statusText;
        try {
          const errorPayload = await response.json();
          detail = errorPayload.detail || detail;
        } catch (_) {
          // body wasn't JSON, keep statusText
        }
        throw new Error(`Upload Failed (${response.status}): ${detail}`);
      }

      const data = await response.json();

      pushStatus('[SERVER RESPONSE RECEIVED]');
      pushStatus(`  Workflow ID : ${data.workflow_id ?? 'N/A'}`);
      pushStatus(`  Verification: ${data.verification_text ?? 'N/A'}`);

      // Surface verification in a native Alert
      Alert.alert(
        'Server Response',
        data.verification_text ?? 'No verification text returned.',
        [{text: 'OK'}],
      );
    } catch (error: any) {
      const msg = error?.message ?? 'Unknown error';
      pushStatus(`[ERROR] ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, [promptText, image1, image2, pushStatus]);

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#0f0f1a" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.rootScroll}
          contentContainerStyle={styles.rootContent}
          keyboardShouldPersistTaps="handled">
          {/* ── Header ─────────────────────────────────────────────── */}
          <Text style={styles.header}>ComfyUI Prompt Sender</Text>
          <Text style={styles.subHeader}>
            Connected → {GLOBAL_API_URL}
          </Text>

          {/* ── Prompt TextInput ───────────────────────────────────── */}
          <Text style={styles.label}>Prompt Text</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Cinematic portrait style…"
            placeholderTextColor="#555"
            multiline
            value={promptText}
            onChangeText={setPromptText}
          />

          {/* ── Image Picker Tiles ─────────────────────────────────── */}
          <Text style={styles.label}>Image Attachments</Text>
          <View style={styles.tileRow}>
            {/* Tile 1 */}
            <TouchableOpacity
              style={styles.tile}
              activeOpacity={0.7}
              onPress={() => pickImage(1)}>
              {image1 ? (
                <View style={styles.tileInner}>
                  <Image
                    source={{uri: image1.uri}}
                    style={styles.thumbnail}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    style={styles.clearBtn}
                    onPress={() => {
                      setImage1(null);
                      pushStatus('[IMAGE 1] Cleared.');
                    }}
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                    <Text style={styles.clearBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.tilePlaceholder}>
                  <Text style={styles.tilePlaceholderIcon}>＋</Text>
                  <Text style={styles.tilePlaceholderText}>Image 1</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Tile 2 */}
            <TouchableOpacity
              style={styles.tile}
              activeOpacity={0.7}
              onPress={() => pickImage(2)}>
              {image2 ? (
                <View style={styles.tileInner}>
                  <Image
                    source={{uri: image2.uri}}
                    style={styles.thumbnail}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    style={styles.clearBtn}
                    onPress={() => {
                      setImage2(null);
                      pushStatus('[IMAGE 2] Cleared.');
                    }}
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                    <Text style={styles.clearBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.tilePlaceholder}>
                  <Text style={styles.tilePlaceholderIcon}>＋</Text>
                  <Text style={styles.tilePlaceholderText}>Image 2</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Send Button ────────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.sendBtn, isLoading && styles.sendBtnDisabled]}
            activeOpacity={0.8}
            onPress={handleSend}
            disabled={isLoading}>
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendBtnText}>Send to Comfy Backend</Text>
            )}
          </TouchableOpacity>

          {/* ── Live Status Console ────────────────────────────────── */}
          <Text style={styles.label}>Status Console</Text>
          <View style={styles.console}>
            <ScrollView
              ref={scrollRef}
              nestedScrollEnabled
              style={styles.consoleScroll}>
              {statusLog.map((line, idx) => (
                <Text key={idx} style={styles.consoleLine}>
                  {line}
                </Text>
              ))}
            </ScrollView>
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const ACCENT = '#6C5CE7';
const SURFACE = '#1a1a2e';
const BORDER = '#2a2a40';

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  rootScroll: {
    flex: 1,
  },
  rootContent: {
    padding: 20,
    paddingBottom: 40,
  },

  // Header
  header: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  subHeader: {
    fontSize: 12,
    color: '#888',
    marginBottom: 24,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Labels
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 4,
  },

  // TextInput
  textInput: {
    backgroundColor: SURFACE,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 12,
    color: '#e0e0e0',
    fontSize: 15,
    padding: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 20,
  },

  // Image tiles
  tileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  tile: {
    width: '47%',
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderStyle: 'dashed',
    backgroundColor: SURFACE,
    overflow: 'hidden',
  },
  tileInner: {
    flex: 1,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  clearBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  tilePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tilePlaceholderIcon: {
    fontSize: 32,
    color: '#555',
    marginBottom: 4,
  },
  tilePlaceholderText: {
    fontSize: 12,
    color: '#555',
  },

  // Send button
  sendBtn: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    elevation: 4,
    shadowColor: ACCENT,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  sendBtnDisabled: {
    opacity: 0.6,
  },
  sendBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Console
  console: {
    backgroundColor: '#0d0d16',
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    height: 180,
  },
  consoleScroll: {
    flex: 1,
  },
  consoleLine: {
    color: '#44d49a',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 18,
  },
});

export default App;
