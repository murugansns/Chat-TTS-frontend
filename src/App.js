import React, { useState, useRef, useEffect } from 'react';
import { prepareAudio, stopAudio } from './utils/audioPlayer';

function App() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState({ message: '', type: '' });
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentAudio, setCurrentAudio] = useState(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle file upload
  const handleFileUpload = async (event) => {
    console.log('🔄 File upload initiated');
    const file = event.target.files[0];
    
    if (!file) {
      console.log('❌ No file selected');
      return;
    }

    console.log('📁 File selected:', {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: new Date(file.lastModified).toISOString()
    });

    if (file.type !== 'application/pdf') {
      console.log('❌ Invalid file type:', file.type);
      alert('Please select a PDF file');
      return;
    }

    console.log('✅ PDF file validated');

    // Check if backend is reachable first
    console.log('🔍 Checking backend connectivity...');
    try {
      const pingResponse = await fetch('http://192.168.1.218:8000/api/health', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'cors',
        // credentials: 'include'
      });
      console.log('🏥 Health check response:', {
        status: pingResponse.status,
        ok: pingResponse.ok,
        statusText: pingResponse.statusText
      });
      
      if (!pingResponse.ok) {
        throw new Error('Backend server is not responding');
      }
      console.log('✅ Backend is reachable');
    } catch (error) {
      console.error('❌ Backend connection error:', error);
      setUploadStatus('Error: Could not connect to the server. Please make sure the backend is running.');
      return;
    }

    console.log('📦 Creating FormData...');
    const formData = new FormData();
    formData.append('file', file);
    console.log('✅ FormData created with file');

    const xhr = new XMLHttpRequest();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 30 second timeout

    try {
      console.log('🚀 Starting upload process...');
      setUploadStatus({ message: 'Preparing upload...', type: 'info' });
      setIsUploading(true);
      setUploadProgress(0);
      
      const response = await new Promise((resolve, reject) => {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            const progressPercentage = Math.round(progress);
            setUploadStatus({ message: `Uploading: ${progressPercentage}%`, type: 'uploading' });
            setUploadProgress(progressPercentage);
          }
        };

        xhr.onload = () => {
          clearTimeout(timeoutId);
          console.log('📋 Upload response:', {
            status: xhr.status,
            statusText: xhr.statusText,
            responseText: xhr.responseText
          });
          
          if (xhr.status >= 200 && xhr.status < 300) {
            console.log('✅ Upload successful');
            resolve(xhr);
          } else {
            console.error('❌ Upload failed with status:', xhr.status);
            reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
          }
        };

        xhr.onerror = () => {
          console.error('❌ XHR Error occurred:', {
            status: xhr.status,
            statusText: xhr.statusText,
            readyState: xhr.readyState
          });
          clearTimeout(timeoutId);
          if (xhr.status === 0) {
            reject(new Error('Network error: Could not connect to the server. Please check your connection and make sure the backend is running on http://192.168.1.218:8000'));
          } else {
            reject(new Error(`Network error occurred: ${xhr.statusText || 'Unknown error'}`));
          }
        };
        
        xhr.onabort = () => {
          console.log('⏹️ Upload was aborted');
          clearTimeout(timeoutId);
          reject(new Error('Upload was cancelled'));
        };
        
        console.log('🌐 Opening XHR connection to: http://192.168.1.218:8000/api/upload');
        xhr.open('POST', 'http://192.168.1.218:8000/api/v1/upload', true);
        
        // Set request headers if needed
        // xhr.setRequestHeader('Accept', 'application/json');
        
        console.log('📤 Sending file...');
        try {
          xhr.send(formData);
        } catch (error) {
          console.error('❌ Error sending request:', error);
          reject(error);
        }

        // Handle abort
        controller.signal.addEventListener('abort', () => {
          console.log('⏰ Upload timeout reached');
          xhr.abort();
          reject(new Error('Upload was aborted due to timeout'));
        });
      });

      if (response.status === 200) {
        console.log('🎉 Upload completed successfully');
        setUploadStatus({ message: 'Upload successful!', type: 'success' });
        setUploadProgress(100);
        
        // Store uploaded file info for preview
        setUploadedFile({
          name: file.name,
          size: file.size,
          type: file.type,
          uploadDate: new Date(),
          url: URL.createObjectURL(file)
        });
        
        setTimeout(() => {
          setUploadProgress(0);
          setUploadStatus({ message: '', type: '' });
        }, 3000);
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('💥 Upload error:', error);
      const errorMessage = error.message.includes('Network error') 
        ? error.message 
        : `Upload failed: ${error.message || 'Unknown error'}`;
      setUploadStatus({ message: errorMessage, type: 'error' });
      setUploadProgress(0);
    } finally {
      console.log('🧹 Cleaning up upload process...');
      // Cleanup
      clearTimeout(timeoutId);
      controller.abort();
      
      // Reset states
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      setIsUploading(false);
    }
  };

  // Handle sending a message
  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage = {
      id: Date.now(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date(),
    };

    console.log('📩 Sending question:', inputValue);
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      console.log('🌐 Sending request to /api/v1/ask with question:', inputValue);
      const startTime = Date.now();
      
      const response = await fetch('http://192.168.1.218:8000/api/v1/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          question: inputValue,
          debug: true
        })
      });

      const endTime = Date.now();
      console.log(`⏱️ Request took ${endTime - startTime}ms`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Server error response:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('📥 Received response:', data);
      
      const botMessage = {
        id: Date.now() + 1,
        text: data.answer,
        sender: 'bot',
        timestamp: new Date(),
        // Include additional context if available
        context: data.context || null,
        sources: data.sources || [],
      };

      console.log('🤖 Bot response:', botMessage);
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error('❌ Error sending message:', error);
      
      setMessages(prev => [
        ...prev, 
        {
          id: Date.now() + 1,
          text: 'Sorry, there was an error processing your request. Please try again.',
          sender: 'bot',
          timestamp: new Date(),
          isError: true
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle TTS speech generation with cache-busting
  const handleSpeak = async (text, messageId) => {
    console.log('handleSpeak called with messageId:', messageId, 'isSpeaking:', isSpeaking);
    
    try {
      // If we're already speaking this message, just toggle play/pause
      if (isSpeaking === messageId && currentAudio) {
        console.log('Toggling play/pause for existing audio');
        try {
          if (currentAudio.paused) {
            await currentAudio.play();
          } else {
            currentAudio.pause();
          }
          return;
        } catch (error) {
          console.error('Error toggling audio playback:', error);
          // Continue with new audio generation if toggle fails
        }
      }

      // If not already speaking this message, start new TTS
      setIsSpeaking(messageId);
      const audio = await prepareAudio(`tts-${Date.now()}`, text);
      await audio.play();
      setIsSpeaking(false);
    } catch (error) {
      console.error('Error in TTS playback:', error);
      setIsSpeaking(false);
      
      // Fallback to Web Speech API if TTS fails
      const speech = new SpeechSynthesisUtterance(text);
      speech.volume = 1;
      speech.rate = 0.9;
      speech.pitch = 1;
      
      const voices = window.speechSynthesis.getVoices();
      const femaleVoice = voices.find(voice => 
        voice.name.toLowerCase().includes('female') || 
        voice.lang.includes('en')
      );
      
      if (femaleVoice) {
        speech.voice = femaleVoice;
      }
      
      speech.onend = () => setIsSpeaking(false);
      window.speechSynthesis.speak(speech);
    }
  };

  // Stop current speech
  const handleStopSpeech = () => {
    if (!currentAudio) return;
    
    try {
      // Stop the audio
      currentAudio.pause();
      currentAudio.currentTime = 0;
      
      // Clean up
      if (currentAudio.src) {
        URL.revokeObjectURL(currentAudio.src);
      }
      
    } catch (error) {
      console.error('Error stopping speech:', error);
    } finally {
      setIsSpeaking(false);
      setCurrentAudio(null);
    }
  };

  useEffect(() => {
    return () => {
      stopAudio();
      window.speechSynthesis.cancel();
    };
  }, []);

  // Handle Enter key press
  const handleKeyPress = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="h-screen bg-gray-100 flex flex-col">
      <div className="flex-1 bg-white flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-primary text-white p-4">
          <h1 className="text-xl font-semibold">RAG Chatbot</h1>
          <p className="text-white/80 text-sm">Upload a PDF and ask questions about it</p>
        </div>

        {/* File Upload Section */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-4">
            <div className="mb-4">
              <input
                type="file"
                onChange={handleFileUpload}
                accept=".pdf"
                className="hidden"
                id="file-upload"
                ref={fileInputRef}
                disabled={isLoading || isUploading}
              />
              <label
                htmlFor="file-upload"
                className={`inline-flex items-center px-4 py-2 rounded cursor-pointer transition-colors ${
                  isUploading || isLoading
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-primary hover:bg-opacity-90 text-white'
                }`}
              >
                {isUploading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Uploading...
                  </>
                ) : 'Upload PDF'}
              </label>
              
              {uploadStatus.message && (
                <div className={`mt-2 p-2 rounded text-sm ${
                  uploadStatus.type === 'error' ? 'bg-red-100 text-red-700' :
                  uploadStatus.type === 'success' ? 'bg-green-100 text-green-700' :
                  'bg-blue-100 text-blue-700'
                }`}>
                  {uploadStatus.message}
                </div>
              )}
              
              {isUploading && uploadProgress > 0 && (
                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                  <div 
                    className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" 
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PDF Preview Section */}
        {uploadedFile && (
          <div className="p-3 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <div className="w-8 h-10 bg-red-100 border border-red-200 rounded flex items-center justify-center">
                  <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-gray-900 truncate">
                  {uploadedFile.name}
                </h4>
                <p className="text-xs text-gray-500">
                  {(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready for questions
                </p>
              </div>
              <div className="flex-shrink-0">
                <button
                  onClick={() => setUploadedFile(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  title="Remove file"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-8">
              <p>Upload a PDF file and start asking questions!</p>
            </div>
          )}
          
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className="flex items-start space-x-2">
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                    message.sender === 'user'
                      ? 'bg-primary text-white rounded-br-none'
                      : 'bg-gray-100 text-gray-800 rounded-bl-none border border-gray-200'
                  }`}
                >
                  <p className="text-sm">{message.text}</p>
                  <p className={`text-xs mt-1 ${message.sender === 'user' ? 'text-white/80' : 'text-gray-500'}`}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                
                {/* TTS Button for bot messages */}
                {message.sender === 'bot' && (
                  <button
                    onClick={() => isSpeaking === message.id ? handleStopSpeech() : handleSpeak(message.text, message.id)}
                    className={`p-2 rounded-full transition-colors ${
                      isSpeaking === message.id 
                        ? 'bg-red-100 text-red-600 hover:bg-red-200' 
                        : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                    }`}
                    title={isSpeaking === message.id ? 'Stop speaking' : 'Speak answer'}
                  >
                    {isSpeaking === message.id ? (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 012 0v6a1 1 0 11-2 0V7zM12 7a1 1 0 012 0v6a1 1 0 11-2 0V7z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.617.824L4.5 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.5l3.883-3.824zM15 8.75a.75.75 0 011.5 0v2.5a.75.75 0 01-1.5 0v-2.5zM17.25 5.5a.75.75 0 011.5 0v9a.75.75 0 01-1.5 0v-9z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 text-gray-800 px-4 py-2 rounded-lg rounded-bl-none max-w-xs border border-gray-200">
                <div className="flex items-center space-x-2">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                  <span className="text-sm text-gray-600">Bot is thinking...</span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input Section */}
        <div className="flex-shrink-0 p-4 border-t border-gray-200 bg-white">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your question here..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading}
            />
            <button
              onClick={handleSendMessage}
              disabled={isLoading || !inputValue.trim()}
              className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
