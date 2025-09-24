// Audio cache to store generated audio blobs by message ID
const audioCache = new Map();
let currentAudio = null;

/**
 * Play audio for a message, either from cache or by generating it
 * @param {string} messageId - Unique ID for the message
 * @param {string} text - Text to convert to speech
 * @param {string} [voiceName='my_voice'] - Voice to use for TTS
 * @param {string} [preset='fast'] - TTS quality preset
 * @returns {Promise<void>}
 */
export const playAudio = async (messageId, text, voiceName = 'sns', preset = 'fast') => {
    // Stop any currently playing audio
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }

    // Check if audio is in cache
    if (audioCache.has(messageId)) {
        const audioBlob = audioCache.get(messageId);
        return playAudioBlob(audioBlob);
    }

    // If not in cache, generate it
    try {
        const response = await fetch('http://192.168.1.218:8000/api/v1/tts/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text,
                voice_name: voiceName,
                preset,
                message_id: messageId
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const audioBlob = await response.blob();
        audioCache.set(messageId, audioBlob);
        return playAudioBlob(audioBlob);
    } catch (error) {
        console.error('Error playing audio:', error);
        throw error;
    }
};

/**
 * Play an audio blob
 * @param {Blob} blob - The audio blob to play
 * @returns {Promise<void>}
 */
const playAudioBlob = (blob) => {
    return new Promise((resolve, reject) => {
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        currentAudio = audio;

        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            currentAudio = null;
            resolve();
        };

        audio.onerror = (error) => {
            URL.revokeObjectURL(audioUrl);
            currentAudio = null;
            reject(error);
        };

        audio.play().catch(error => {
            URL.revokeObjectURL(audioUrl);
            currentAudio = null;
            reject(error);
        });
    });
};

/**
 * Stop the currently playing audio
 * @returns {boolean} True if audio was stopped, false if none was playing
 */
export const stopCurrentAudio = () => {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
        return true;
    }
    return false;
};

/**
 * Clear the audio cache
 */
export const clearAudioCache = () => {
    audioCache.clear();
};
