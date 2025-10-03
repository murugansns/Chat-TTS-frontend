import { TTS_API } from '../config';

// Global audio state
let currentAudioContext = null;
let currentSource = null;
let isPlaying = false;
let audioQueue = [];
let isProcessingQueue = false;
let currentPlaybackId = null;
const audioCache = new Map(); // Cache for audio blobs by message ID
const activeAudioElements = new Map(); // Track all active audio elements

// Audio streaming state
let audioChunks = new Map(); // Map of streamId to array of chunks
let mediaSource = null;
let sourceBuffer = null;
let audioElement = null;
let currentStreamId = null;
let eventSource = null;
let chunkBuffers = new Map(); // Buffer for out-of-order chunks
let activeStreams = new Map(); // Track active streams
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

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
  
  // Stop all active streams
  activeStreams.forEach(({ stop }) => {
    try {
      stop();
    } catch (e) {
      console.warn('Error stopping audio stream:', e);
    }
  });
  
  // Clear all active audio elements and streams
  activeAudioElements.clear();
  activeStreams.clear();
  
  // Clear the queue
  audioQueue = [];
  
  // Reset state
  isPlaying = false;
  currentPlaybackId = null;
  currentStreamId = null;
  
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
  voiceName = 'sns',
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
  // Create a unique ID for this audio instance
  const audioId = `audio_${Date.now()}`;
  console.log(`[Audio] Created audio instance with ID: ${audioId}`);
  
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
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 300 second (5 minute) timeout for TTS generation
      
      let response;
      try {
        response = await fetch(TTS_API.GENERATE, {
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
          throw new Error('Request timed out after 300 seconds (5 minutes)');
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
 * Clean up streaming resources
 * @param {string} streamId - The stream ID to clean up
 */
const cleanupStream = (streamId) => {
  console.log(`Cleaning up stream: ${streamId}`);
  
  // Close event source
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  
  // Clean up media source
  if (mediaSource) {
    if (mediaSource.readyState === 'open') {
      try {
        mediaSource.endOfStream();
      } catch (e) {
        console.error('Error ending media source:', e);
      }
    }
    
    // Revoke object URL
    if (audioElement && audioElement.src) {
      URL.revokeObjectURL(audioElement.src);
    }
    
    mediaSource = null;
  }
  
  // Clean up audio element
  if (audioElement) {
    audioElement.pause();
    audioElement.src = '';
    audioElement.load();
    audioElement = null;
  }
  
  // Clear data structures
  if (streamId) {
    audioChunks.delete(streamId);
    chunkBuffers.delete(streamId);
    activeStreams.delete(streamId);
  }
  
  sourceBuffer = null;
  currentStreamId = null;
  reconnectAttempts = 0;
};

/**
 * Play the next available audio chunk
 * @param {string} streamId - The stream ID to play chunks for
 */
const playNextChunk = (streamId, onAudioEnd = () => {}) => {
  if (!streamId) {
    console.error('No stream ID provided');
    return;
  }
  
  if (!isPlaying) {
    console.log('Playback is paused, not playing next chunk');
    return;
  }
  
  if (!mediaSource || mediaSource.readyState !== 'open') {
    console.error('Media source is not ready');
    return;
  }
  
  if (!sourceBuffer) {
    console.error('Source buffer not initialized');
    return;
  }
  
  // If source buffer is updating, schedule a retry
  if (sourceBuffer.updating) {
    console.log('Source buffer is updating, will retry...');
    setTimeout(() => playNextChunk(streamId), 50);
    return;
  }
  
  const chunks = audioChunks.get(streamId) || [];
  const buffer = chunkBuffers.get(streamId);
  
  if (!buffer || buffer.size === 0) {
    console.log('No chunks available in buffer');
    return;
  }
  
  if (chunks.length === 0) {
    console.log('No chunks in queue');
    return;
  }
  
  // Find the next chunk to play (in order)
  const nextChunk = chunks[0];
  
  if (!nextChunk) {
    console.log('No next chunk found');
    return;
  }
  
  const chunkData = buffer.get(nextChunk.index);
  if (!chunkData) {
    console.log(`Chunk ${nextChunk.index} data not available yet`);
    // Remove the chunk from the queue if it's not available after a while
    if (Date.now() - nextChunk.timestamp > 30000) { // 30 seconds timeout
      console.log(`Chunk ${nextChunk.index} timed out, removing from queue`);
      chunks.shift();
      playNextChunk(streamId, onAudioEnd);
    }
    return;
  }
  
  try {
    console.log(`Appending chunk ${nextChunk.index} (${chunkData.data?.length || 0} bytes)`);
    
    // Mark as played but don't delete yet (in case of errors)
    chunkData.played = true;
    
    // Remove from queue before appending to prevent race conditions
    chunks.shift();
    
    // Append the chunk to the source buffer
    if (chunkData.data && chunkData.data.length > 0) {
      sourceBuffer.appendBuffer(chunkData.data);
      
      // Clean up old chunks to prevent memory leaks
      if (buffer.size > 10) { // Keep last 10 chunks in buffer
        const keys = Array.from(buffer.keys());
        for (let i = 0; i < keys.length - 10; i++) {
          buffer.delete(keys[i]);
        }
      }
    } else {
      console.error(`Chunk ${nextChunk.index} has no data`);
      // Move to next chunk
      playNextChunk(streamId, onAudioEnd);
    }
    
  } catch (e) {
    console.error('Error appending buffer:', e);
    
    // Handle different error cases
    if (e.name === 'QuotaExceededError') {
      console.log('Buffer full, removing old data');
      try {
        if (sourceBuffer.buffered.length > 0) {
          sourceBuffer.remove(0, sourceBuffer.buffered.end(0) - 1);
          // Retry after a short delay
          setTimeout(() => playNextChunk(streamId), 50);
        }
      } catch (removeError) {
        console.error('Error removing old buffer data:', removeError);
        // Try to recover by creating a new source buffer
        if (mediaSource.readyState === 'open') {
          try {
            sourceBuffer.abort();
            sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
            sourceBuffer.mode = 'sequence';
            // Retry with new buffer
            setTimeout(() => playNextChunk(streamId, onAudioEnd), 100);
          } catch (bufferError) {
            console.error('Error recreating source buffer:', bufferError);
            if (onAudioEnd) onAudioEnd();
            cleanupStream(streamId);
          }
        }
      }
    } else if (e.name === 'InvalidStateError' || e.name === 'TypeError') {
      // Source buffer might be in a bad state, try to recover
      console.log('Source buffer in bad state, attempting recovery...');
      if (mediaSource.readyState === 'open') {
        try {
          sourceBuffer.abort();
          sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
          sourceBuffer.mode = 'sequence';
          // Re-add the chunk to the queue and retry
          chunks.unshift(nextChunk);
          setTimeout(() => playNextChunk(streamId, onAudioEnd), 100);
        } catch (bufferError) {
          console.error('Error recovering source buffer:', bufferError);
          if (onAudioEnd) onAudioEnd();
          cleanupStream(streamId);
        }
      }
    } else {
      // For other errors, clean up and stop
      console.error('Fatal error in playNextChunk:', e);
      if (onAudioEnd) onAudioEnd();
      cleanupStream(streamId);
    }
  }
};

/**
 * Set up event source handlers for streaming
 * @param {string} streamId - The stream ID to set up handlers for
 * @param {Function} onAudioStart - Callback when audio starts
 * @param {Function} onAudioEnd - Callback when audio ends
 */
const setupEventSourceHandlers = (streamId, onAudioStart, onAudioEnd) => {
  if (!eventSource) return;
  
  eventSource.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('Received SSE message:', data.type, data.index !== undefined ? `chunk ${data.index}` : '');
      
      if (data.type === 'chunk') {
        const { index, data: chunkData, text } = data;
        
        // Initialize buffer if it doesn't exist
        if (!chunkBuffers.has(streamId)) {
          chunkBuffers.set(streamId, new Map());
        }
        
        const buffer = chunkBuffers.get(streamId);
        
        try {
          // Convert base64 to Uint8Array
          const binaryString = atob(chunkData);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          // Store the chunk with metadata
          buffer.set(index, {
            data: bytes,
            timestamp: Date.now(),
            text: text || ''
          });
          
          // Add to chunks list if not already present
          if (!audioChunks.has(streamId)) {
            audioChunks.set(streamId, []);
          }
          
          const chunks = audioChunks.get(streamId);
          if (!chunks.some(c => c.index === index)) {
            chunks.push({ index, timestamp: Date.now() });
            chunks.sort((a, b) => a.index - b.index);
          }
          
          // If this is the first chunk, start playback
          if (index === 0 && !isPlaying && mediaSource && mediaSource.readyState === 'open') {
            console.log('First chunk received, starting playback...');
            try {
              await audioElement.play();
              isPlaying = true;
              if (onAudioStart) onAudioStart();
    playNextChunk(streamId, onAudioEnd);
            } catch (e) {
              console.error('Initial playback failed:', e);
              // If autoplay was prevented, try with a user gesture
              if (e.name === 'NotAllowedError') {
                console.log('Autoplay was prevented. Waiting for user interaction...');
                const playOnClick = () => {
                  audioElement.play()
                    .then(() => {
                      isPlaying = true;
                      if (onAudioStart) onAudioStart();
            playNextChunk(streamId, onAudioEnd);
                    })
                    .catch(e => {
                      console.error('Playback after interaction failed:', e);
                      if (onAudioEnd) onAudioEnd();
                      cleanupStream(streamId);
                    });
                  document.removeEventListener('click', playOnClick);
                };
                document.addEventListener('click', playOnClick);
              } else {
                if (onAudioEnd) onAudioEnd();
                cleanupStream(streamId);
              }
            }
          } else if (isPlaying) {
            // If we're already playing, queue up the next chunk
  playNextChunk(streamId, onAudioEnd);
          }
        } catch (e) {
          console.error('Error processing chunk data:', e);
        }
        
      } else if (data.type === 'complete') {
        console.log('Stream complete');
        if (onAudioEnd) onAudioEnd();
        cleanupStream(streamId);
      } else if (data.type === 'error') {
        console.error('Stream error:', data.error);
        if (onAudioEnd) onAudioEnd();
        cleanupStream(streamId);
      }
    } catch (e) {
      console.error('Error processing SSE message:', e);
    }
  };
  
  eventSource.onopen = () => {
    console.log('SSE connection opened');
    reconnectAttempts = 0; // Reset reconnect attempts on successful connection
  };
  
  eventSource.onerror = (error) => {
    console.error('SSE Error:', error);
    
    // Only try to reconnect if the connection was closed unexpectedly
    if (eventSource.readyState === EventSource.CLOSED) {
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Exponential backoff with max 30s
        console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
        
        setTimeout(() => {
          if (currentStreamId === streamId) { // Only reconnect if this is still the active stream
            eventSource = new EventSource(`${TTS_API.STREAM}/${streamId}`);
            setupEventSourceHandlers(streamId, onAudioStart, onAudioEnd);
          }
        }, delay);
      } else {
        console.error('Max reconnection attempts reached');
        if (onAudioEnd) onAudioEnd();
        cleanupStream(streamId);
      }
    } else {
      // For other errors, just clean up
      if (onAudioEnd) onAudioEnd();
      cleanupStream(streamId);
    }
  };
};

/**
 * Stream audio chunks as they arrive
 * @param {string} streamId - The stream ID to connect to
 * @param {Function} [onAudioStart] - Callback when audio starts playing
 * @param {Function} [onAudioEnd] - Callback when audio finishes playing
 * @returns {Object} Object with stop control
 */
const streamAudio = async (streamId, onAudioStart, onAudioEnd) => {
  console.log(`Starting audio stream: ${streamId}`);
  
  // Clean up any existing stream with the same ID
  if (activeStreams.has(streamId)) {
    console.log(`Stopping existing stream: ${streamId}`);
    activeStreams.get(streamId).stop();
  }
  
  // Initialize state for this stream
  audioChunks.set(streamId, []);
  chunkBuffers.set(streamId, new Map());
  currentStreamId = streamId;
  reconnectAttempts = 0;
  
  try {
    // Create audio context if it doesn't exist
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!currentAudioContext) {
      currentAudioContext = new AudioContext();
      console.log('Created new AudioContext');
    }
    
    // Set up media source
    if (mediaSource && mediaSource.readyState === 'open') {
      mediaSource.endOfStream();
      URL.revokeObjectURL(audioElement?.src);
    }
    
    mediaSource = new MediaSource();
    mediaSource.addEventListener('sourceclose', () => {
      console.log('MediaSource closed');
      cleanupStream(streamId);
    });
    
    // Create audio element
    audioElement = new Audio();
    audioElement.preload = 'none';
    audioElement.controls = false;
    audioElement.autoplay = false;
    
    // Handle audio element events
    audioElement.onended = () => {
      console.log('Audio playback ended');
      isPlaying = false;
      if (onAudioEnd) onAudioEnd();
      cleanupStream(streamId);
    };
    
    audioElement.onerror = (e) => {
      console.error('Audio element error:', e);
      if (onAudioEnd) onAudioEnd();
      cleanupStream(streamId);
    };
    
    // Set up source buffer when media source is ready
    mediaSource.addEventListener('sourceopen', () => {
      console.log('MediaSource opened');
      
      try {
        // Create source buffer for MP3 audio
        sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
        sourceBuffer.mode = 'sequence';
        
        sourceBuffer.addEventListener('updateend', () => {
          if (isPlaying) {
  playNextChunk(streamId, onAudioEnd);
          }
        });
        
        sourceBuffer.addEventListener('error', (e) => {
          console.error('SourceBuffer error:', e);
        });
        
        console.log('SourceBuffer created');
        
      } catch (e) {
        console.error('Error creating SourceBuffer:', e);
        if (onAudioEnd) onAudioEnd();
        cleanupStream(streamId);
        return;
      }
    });
    
    // Set the media source URL
    audioElement.src = URL.createObjectURL(mediaSource);
    
    // Set up SSE connection with error handling and credentials
    const streamUrl = `${TTS_API.STREAM}/${streamId}`;
    console.log(`Connecting to SSE: ${streamUrl}`);
    
    // Create EventSource with error handling
    eventSource = new EventSource(streamUrl, {
      withCredentials: true  // Important for CORS with credentials
    });
    
    // Set up event handlers
    setupEventSourceHandlers(streamId, onAudioStart, onAudioEnd);
    
    // Add error event listener to the audio element
    if (audioElement) {
      audioElement.onerror = (e) => {
        console.error('Audio element error:', e);
        if (onAudioEnd) onAudioEnd();
        cleanupStream(streamId);
      };
    }
    
  } catch (e) {
    console.error('Error setting up audio stream:', e);
    if (onAudioEnd) onAudioEnd();
    cleanupStream(streamId);
    throw e;
  }
  
  // Create control object
  const control = {
    stop: () => {
      console.log(`Stopping stream: ${streamId}`);
      cleanupStream(streamId);
      if (onAudioEnd) onAudioEnd();
    },
    pause: () => {
      if (audioElement) {
        audioElement.pause();
        isPlaying = false;
      }
    },
    resume: () => {
      if (audioElement && !isPlaying) {
        audioElement.play().catch(e => console.error('Resume failed:', e));
      }
    }
  };
  
  // Store the control object
  activeStreams.set(streamId, control);
  
  return control;
};

/**
 * Play audio from a data URL
 * @param {string} audioDataUrl - Data URL of the audio to play (e.g., data:audio/wav;base64,...)
 * @param {Function} [onAudioStart] - Callback when audio starts playing
 * @param {Function} [onAudioEnd] - Callback when audio finishes playing
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.isStreaming] - Whether the URL is a streaming endpoint
 * @param {string} [options.streamId] - Stream ID for chunked audio
 * @returns {Promise<{stop: Function}>} Object with stop control
 */
const playAudioFromDataUrl = async (audioDataUrl, onAudioStart, onAudioEnd, options = {}) => {
  const { isStreaming = false, streamId = null } = options;
  
  // If this is a streaming request, use the streaming function
  if (isStreaming && streamId) {
    return streamAudio(streamId, onAudioStart, onAudioEnd);
  }
  // Log the audio data URL (trimmed for readability)
  const logUrl = audioDataUrl ? 
    (audioDataUrl.length > 100 ? 
      `${audioDataUrl.substring(0, 50)}...${audioDataUrl.substring(audioDataUrl.length - 30)}` : 
      audioDataUrl) : 
    'undefined';
  
  console.log(`[Audio] Preparing to play audio from URL: ${logUrl}`);
  
  // Stop any currently playing audio
  stopAudio(true);

  if (!audioDataUrl) {
    console.error('[Audio] No audio data URL provided');
    if (onAudioEnd) onAudioEnd();
    return { stop: () => {} };
  }

  try {
    const audioElement = new Audio(audioDataUrl);
    const id = `audio-${Date.now()}`;
    
    // Add to active audio elements
    activeAudioElements.set(id, { 
      source: audioElement,
      startTime: new Date().toISOString(),
      url: logUrl
    });
    
    // Log all active audio elements for debugging
    console.log(`[Audio] Active audio elements:`, Array.from(activeAudioElements.entries()).map(([id, data]) => ({
      id,
      playing: !data.source.paused,
      duration: data.source.duration || 'unknown',
      currentTime: data.source.currentTime || 0,
      url: data.url || 'unknown',
      startTime: data.startTime || 'unknown'
    })));
    
    // Set up event handlers
    const handleEnded = () => {
      console.log(`[Audio] Playback ended for audio ID: ${id}`);
      activeAudioElements.delete(id);
      if (onAudioEnd) onAudioEnd();
    };
    
    audioElement.onplay = () => {
      console.log(`[Audio] Playback started for audio ID: ${id}`);
      console.log(`[Audio] Audio element state:`, {
        duration: audioElement.duration,
        currentTime: audioElement.currentTime,
        volume: audioElement.volume,
        muted: audioElement.muted,
        paused: audioElement.paused,
        readyState: audioElement.readyState,
        networkState: audioElement.networkState
      });
      if (onAudioStart) onAudioStart();
    };
    
    audioElement.onended = handleEnded;
    
    audioElement.onerror = (error) => {
      console.error(`[Audio] Error playing audio (ID: ${id}):`, error);
      console.error(`[Audio] Error details:`, {
        errorCode: audioElement.error ? audioElement.error.code : 'unknown',
        errorMessage: audioElement.error ? audioElement.error.message : 'Unknown error',
        readyState: audioElement.readyState,
        networkState: audioElement.networkState
      });
      activeAudioElements.delete(id);
      if (onAudioEnd) onAudioEnd();
    };
    
    // Attempt to play the audio
    console.log(`[Audio] Starting playback for audio ID: ${id}`);
    try {
      await audioElement.play();
      console.log(`[Audio] Playback started successfully for audio ID: ${id}`);
    } catch (playError) {
      console.error(`[Audio] Failed to start playback for audio ID: ${id}:`, playError);
      throw playError;
    }
    
    return {
      stop: () => {
        console.log(`[Audio] Stopping playback for audio ID: ${id}`);
        audioElement.pause();
        audioElement.currentTime = 0;
        audioElement.removeEventListener('ended', handleEnded);
        activeAudioElements.delete(id);
      }
    };
  } catch (error) {
    console.error('[Audio] Error initializing audio playback:', error);
    if (onAudioEnd) onAudioEnd();
    throw error;
  }
};
/**
 * Prepare audio for playback with queue management
 * @param {string|Object} messageIdOrAudioData - Either a message ID (string) or audio data URL (object with audio and mimetype)
 * @param {string} [text] - Text to convert to speech (if not providing audio data)
 * @param {Function} [onAudioStart] - Callback when audio starts playing
 * @param {Function} [onAudioEnd] - Callback when audio finishes playing
 * @param {string} [voiceName='my_voice'] - Voice to use for TTS
 * @param {string} [preset='fast'] - TTS quality preset
 * @returns {Object} Object with playback controls
 */
export const prepareAudio = (messageIdOrAudioData, text, onAudioStart, onAudioEnd, voiceName = 'sns', preset = 'fast') => {
  // Handle case where first argument is an audio data URL object or streaming config
  if (messageIdOrAudioData && typeof messageIdOrAudioData === 'object') {
    // Handle streaming audio
    if (messageIdOrAudioData.streamId) {
      const { streamId } = messageIdOrAudioData;
      return {
        stop: stopAudio,
        play: () => playAudioFromDataUrl(null, onAudioStart, onAudioEnd, { 
          isStreaming: true, 
          streamId 
        }),
        queue: () => {
          // For streaming, just play immediately when queued
          return playAudioFromDataUrl(null, onAudioStart, onAudioEnd, { 
            isStreaming: true, 
            streamId 
          });
        },
        getState: () => ({
          isPlaying: activeStreams.has(streamId),
          currentPlaybackId: streamId,
          queueLength: 0,
          activeAudioCount: activeStreams.size
        })
      };
    }
    // Handle direct audio data URL
    else if (messageIdOrAudioData.audio) {
      const { audio, mimetype } = messageIdOrAudioData;
      const audioDataUrl = `data:${mimetype || 'audio/wav'};base64,${audio}`;
      
      return {
        stop: stopAudio,
        play: () => playAudioFromDataUrl(audioDataUrl, onAudioStart, onAudioEnd),
        queue: () => {
          // For simplicity, just play immediately when queued
          return playAudioFromDataUrl(audioDataUrl, onAudioStart, onAudioEnd);
        },
        getState: () => ({
          isPlaying: activeAudioElements.size > 0,
          currentPlaybackId: null,
          queueLength: 0,
          activeAudioCount: activeAudioElements.size
        })
      };
    }
  }
  
  // Original behavior for text-to-speech
  const messageId = messageIdOrAudioData;
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
    const audioId = `cached-audio-${Date.now()}`;
    
    // Add to active audio elements
    activeAudioElements.set(audioId, {
      source: audio,
      url: audioUrl,
      startTime: new Date().toISOString()
    });
    
    audio.onplay = () => {
      console.log(`[Audio] Playback started for audio ID: ${audioId}`);
      console.log(`[Audio] Audio element state:`, {
        duration: audio.duration,
        currentTime: audio.currentTime,
        volume: audio.volume,
        muted: audio.muted,
        paused: audio.paused,
        readyState: audio.readyState,
        networkState: audio.networkState
      });
      isPlaying = true;
      if (onAudioStart) onAudioStart();
    };
    
    const handleEnded = () => {
      console.log(`[Audio] Playback finished for audio ID: ${audioId}`);
      audio.pause();
      audio.currentTime = 0;
      audio.removeEventListener('ended', handleEnded);
      activeAudioElements.delete(audioId);
      isPlaying = false;
      URL.revokeObjectURL(audioUrl);
      if (onAudioEnd) onAudioEnd();
    };
    
    audio.onended = handleEnded;
    
    audio.onerror = (error) => {
      console.error(`[Audio] Error playing audio (ID: ${audioId}):`, error);
      console.error(`[Audio] Error details:`, {
        errorCode: audio.error ? audio.error.code : 'unknown',
        errorMessage: audio.error ? audio.error.message : 'Unknown error',
        readyState: audio.readyState,
        networkState: audio.networkState
      });
      audio.pause();
      audio.currentTime = 0;
      audio.removeEventListener('ended', handleEnded);
      activeAudioElements.delete(audioId);
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