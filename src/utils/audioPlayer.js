// Global audio state
let currentAudioContext = null;
let currentSource = null;
let isPlaying = false;
let audioQueue = [];
let isProcessingQueue = false;
let currentPlaybackId = null;
const audioCache = new Map(); // Cache for audio blobs by message ID
const activeAudioElements = new Map(); // Track all active audio elements

// Initialize IndexedDB for audio caching
const DB_NAME = 'audioCacheDB';
const STORE_NAME = 'audioCache';
let db = null;

// Initialize the database
const initDB = () => {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onerror = (event) => {
      console.error('Error opening database:', event);
      reject('Error opening database');
    };
    
    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

// Get audio from cache
const getCachedAudio = async (id) => {
  await initDB();
  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    
    request.onsuccess = (event) => {
      resolve(event.target.result?.audioData);
    };
    
    request.onerror = () => resolve(null);
  });
};

// Save audio to cache
const saveAudioToCache = async (id, audioData) => {
  await initDB();
  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put({ id, audioData });
    transaction.oncomplete = () => resolve();
  });
};

/**
 * Stops any currently playing audio and cleans up resources
 */
/**
 * Stops all audio playback and cleans up resources
 * @param {boolean} skipOnEnd - If true, skips calling onEnd callbacks
 */
export const stopAudio = (skipOnEnd = false) => {
  // Stop all active audio elements
  activeAudioElements.forEach(({ source, gainNode, id }) => {
    try {
      if (source && source.stop) {
        source.onended = null; // Prevent onended from triggering
        source.stop();
        source.disconnect();
      }
      if (gainNode) {
        gainNode.disconnect();
      }
    } catch (e) {
      console.warn('Error stopping audio source:', e);
    }
  });
  
  // Clear all active audio elements
  activeAudioElements.clear();
  
  // Clear the queue
  audioQueue = [];
  
  // Reset state
  isPlaying = false;
  currentPlaybackId = null;
  
  // Clean up the audio context
  if (currentAudioContext) {
    try {
      if (currentAudioContext.state !== 'closed') {
        currentAudioContext.close();
      }
    } catch (e) {
      console.warn('Error closing audio context:', e);
    } finally {
      currentAudioContext = null;
    }
  }
  try {
    // Stop and clean up the Web Audio API resources
    if (currentSource) {
      try {
        currentSource.onended = null; // Remove any existing end handlers
        if (currentSource.stop) {
          currentSource.stop();
        }
        currentSource.disconnect();
      } catch (e) {
        console.warn('Error stopping audio source:', e);
      } finally {
        currentSource = null;
      }
    }
    
    if (currentAudioContext) {
      try {
        // Don't close the context if we're just moving to the next track
        if (!skipOnEnd && currentAudioContext.state !== 'closed') {
          currentAudioContext.close();
        }
      } catch (e) {
        console.warn('Error closing audio context:', e);
      } finally {
        if (!skipOnEnd) {
          currentAudioContext = null;
        }
      }
    }
  } catch (error) {
    console.error('Error in stopAudio:', error);
  }
};

/**
 * Processes the audio queue
 */

/**
 * Processes the next item in the audio queue if nothing is currently playing
 */
const processQueue = async () => {
  // If we're already processing or there's nothing in the queue, or something is playing, do nothing
  if (isProcessingQueue || audioQueue.length === 0 || isPlaying) return;
  
  isProcessingQueue = true;
  const queueItem = audioQueue.shift();
  
  if (!queueItem) {
    isProcessingQueue = false;
    return;
  }
  
  const { text, onAudioStart, onAudioEnd, voiceName, preset, resolve, reject } = queueItem;
  
  try {
    await playAudio(text, onAudioStart, onAudioEnd, voiceName, preset);
    if (resolve) resolve();
  } catch (error) {
    console.error('Error in audio playback:', error);
    if (reject) reject(error);
  } finally {
    isProcessingQueue = false;
    // Don't process next item here - let the onended handler handle it
  }
};

/**
 * Queue audio for playback
 * @param {Object} options - Playback options
 * @param {string} options.text - Text to speak
 * @param {Function} [options.onAudioStart] - Called when playback starts
 * @param {Function} [options.onAudioEnd] - Called when playback ends
 * @param {string} [options.voiceName='my_voice'] - Voice to use
 * @param {string} [options.preset='fast'] - Quality preset
 * @returns {Promise} Resolves when playback completes or rejects on error
 */
export const queueAudio = ({
  text,
  onAudioStart = () => {},
  onAudioEnd = () => {},
  voiceName = 'my_voice',
  preset = 'fast'
}) => {
  return new Promise((resolve, reject) => {
    // Add to queue
    audioQueue.push({
      text,
      onAudioStart,
      onAudioEnd,
      voiceName,
      preset,
      resolve,
      reject
    });
    
    // Start processing if not already playing
    if (!isPlaying) {
      processQueue();
    }
  });
};

const playAudio = async (text, onAudioStart, onAudioEnd, voiceName, preset) => {
  // Generate a unique ID for this playback
  const playbackId = `playback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Stop any currently playing audio
  if (isPlaying) {
    stopAudio();
  }
  
  // Update playback state
  isPlaying = true;
  currentPlaybackId = playbackId;
  
  // Create a new audio context if needed
  if (!currentAudioContext || currentAudioContext.state === 'closed') {
    currentAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  } else if (currentAudioContext.state === 'suspended') {
    await currentAudioContext.resume();
  }
  if (!currentAudioContext) {
    currentAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  } else if (currentAudioContext.state === 'suspended') {
    await currentAudioContext.resume();
  }
  
  isPlaying = true;
  
  try {
    // Create a unique cache ID based on the text and voice settings
    const cacheId = `${text}_${voiceName}_${preset}`;
    
    // Try to get cached audio first
    const cachedAudio = await getCachedAudio(cacheId);
    
    let audioData;
    if (cachedAudio) {
      // Use cached audio
      console.log('Playing from cache');
      audioData = cachedAudio;
    } else {
      console.log('Fetching new audio');
      // Generate a unique request ID
      const requestId = `req_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      
      // Make the API request to get the audio stream with extended timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 second timeout for TTS generation
      
      let response;
      try {
        response = await fetch('http://192.168.1.218:8000/api/v1/tts/generate', {
          signal: controller.signal,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: text,
            voice_name: voiceName,
            preset: preset,
            request_id: requestId
          }),
          mode: 'cors',
          credentials: 'omit'
        });
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error('Request timed out after 120 seconds');
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorData}`);
      }

      // Get the audio data as an array buffer
      audioData = await response.arrayBuffer();
      
      // Cache the audio data if we got a valid response
      if (audioData && audioData.byteLength > 0) {
        await saveAudioToCache(cacheId, audioData);
      } else {
        throw new Error('Received empty audio data');
      }
    }
    
    // Decode the audio data with error handling
    let audioBuffer;
    try {
      audioBuffer = await currentAudioContext.decodeAudioData(audioData.slice(0));
    } catch (e) {
      console.error('Error decoding audio data:', e);
      // If decoding fails, clear the cache for this entry
      if (window.confirm('Error playing audio. Clear cache and retry?')) {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.delete(cacheId);
      }
      throw new Error('Failed to decode audio data');
    }
    
    // Create a buffer source and connect it to the audio context
    const source = currentAudioContext.createBufferSource();
    source.buffer = audioBuffer;
    
    // Create a gain node for volume control
    const gainNode = currentAudioContext.createGain();
    gainNode.gain.value = 1.0; // Full volume
    
    // Connect the nodes: source -> gain -> destination
    source.connect(gainNode);
    gainNode.connect(currentAudioContext.destination);
    
    // Store the source and gain node for later control
    const audioElement = { source, gainNode, id: playbackId };
    activeAudioElements.set(playbackId, audioElement);
    
    // Set up the onended handler
    source.onended = () => {
      // Only process if this is the current active playback
      if (currentPlaybackId === playbackId) {
        isPlaying = false;
        currentPlaybackId = null;
        
        // Clean up
        source.disconnect();
        gainNode.disconnect();
        activeAudioElements.delete(playbackId);
        
        // Call the end callback
        if (onAudioEnd) onAudioEnd();
        
        // Process next in queue if available
        processQueue();
      }
    };
    
    // Start playback
    source.start(0);
    
    // Call the start callback
    if (onAudioStart) onAudioStart();
    
    // Return the audio source so it can be stopped if needed
    return {
      stop: () => {
        isPlaying = false;
        stopAudio();
        // Clear the queue if we're stopping manually
        audioQueue = [];
      },
      audioContext: currentAudioContext
    };
  } catch (error) {
    console.error('Error in playAudio:', error);
    isPlaying = false;
    stopAudio();
    throw error;
  }
};

/**
 * Generate or retrieve audio for a message
 * @param {string} messageId - Unique ID for the message
 * @param {string} text - Text to convert to speech
 * @param {Function} [onAudioStart] - Callback when audio starts playing
 * @param {Function} [onAudioEnd] - Callback when audio finishes playing
 * @param {string} [voiceName='my_voice'] - Voice to use for TTS
 * @param {string} [preset='fast'] - TTS quality preset
 * @returns {Promise<{play: Function, stop: Function}>} Object with play/stop controls
 */
/**
 * Prepare audio for playback with queue management
 * @param {string} messageId - Unique ID for the message
 * @param {string} text - Text to convert to speech
 * @param {Function} [onAudioStart] - Callback when audio starts playing
 * @param {Function} [onAudioEnd] - Callback when audio finishes playing
 * @param {string} [voiceName='my_voice'] - Voice to use for TTS
 * @param {string} [preset='fast'] - TTS quality preset
 * @returns {Object} Object with playback controls
 */
export const prepareAudio = (messageId, text, onAudioStart, onAudioEnd, voiceName = 'my_voice', preset = 'fast') => {
  // Check if audio is already in cache
  if (audioCache.has(messageId)) {
    const audioBlob = audioCache.get(messageId);
    
    // Return play/stop controls for cached audio
    return {
      stop: stopAudio,
      play: () => {
        stopAudio();
        return queueAudio({
          text,
          onAudioStart: (duration) => {
            if (onAudioStart) onAudioStart(duration);
          },
          onAudioEnd: () => {
            if (onAudioEnd) onAudioEnd();
          },
          voiceName,
          preset
        });
      },
      queue: () => {
        return queueAudio({
          text,
          onAudioStart,
          onAudioEnd,
          voiceName,
          preset
        });
      },
      getState: () => ({
        isPlaying,
        currentPlaybackId,
        queueLength: audioQueue.length,
        activeAudioCount: activeAudioElements.size
      })
    };
  }
  
  // If not in cache, return a controller that will handle generation on play
  return {
    stop: stopAudio,
    play: () => {
      stopAudio();
      return queueAudio({
        text,
        onAudioStart,
        onAudioEnd,
        voiceName,
        preset
      });
    },
    queue: () => {
      return queueAudio({
        text,
        onAudioStart,
        onAudioEnd,
        voiceName,
        preset
      });
    },
    getState: () => ({
      isPlaying,
      currentPlaybackId,
      queueLength: audioQueue.length,
      activeAudioCount: activeAudioElements.size
    })
  };
  
  // Check if audio is already generated
  const isGenerated = audioCache.has(messageId);
  
  // If already generated, play from cache
  if (isGenerated) {
    const audioBlob = audioCache.get(messageId);
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    
    audio.onplay = () => {
      isPlaying = true;
      if (onAudioStart) onAudioStart();
    };
    
    audio.onended = () => {
      isPlaying = false;
      URL.revokeObjectURL(audioUrl);
      if (onAudioEnd) onAudioEnd();
    };
    
    audio.play().catch(error => {
      console.error('Error playing audio:', error);
      if (onAudioEnd) onAudioEnd();
    });
    
    return {
      stop: () => {
        audio.pause();
        isPlaying = false;
        URL.revokeObjectURL(audioUrl);
        if (onAudioEnd) onAudioEnd();
      }
    };
  }
  
  // If not generated, generate and play
  const playPromise = (async () => {
    try {
      const response = await fetch('http://localhost:8000/api/v1/tts/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          voice_name: voiceName,
          preset
        })
      });

      if (!response.ok) {
        throw new Error('TTS generation failed');
      }

      const audioData = await response.blob();
      audioCache.set(messageId, audioData);
      const audioUrl = URL.createObjectURL(audioData);

      const audio = new Audio(audioUrl);
      audio.onplay = () => {
        isPlaying = true;
        if (onAudioStart) onAudioStart();
      };
      
      audio.onended = () => {
        isPlaying = false;
        URL.revokeObjectURL(audioUrl);
        if (onAudioEnd) onAudioEnd();
      };
      
      await audio.play();
      
      return {
        stop: () => {
          audio.pause();
          isPlaying = false;
          URL.revokeObjectURL(audioUrl);
        }
      };
    } catch (error) {
      console.error('Error generating/playing audio:', error);
      isPlaying = false;
      if (onAudioEnd) onAudioEnd();
      throw error;
    }
  })();

  return {
    stop: () => {
      isPlaying = false;
      stopAudio();
    }
  };
};