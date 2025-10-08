  import React, { useState, useRef, useEffect, useCallback } from 'react';
  import DOMPurify from 'dompurify';
  import { prepareAudio, stopAudio } from './utils/audioPlayer';
  import Login from './components/Login';
  import './Chat.css';


  const addSpacesToText = (str) => {
    if (!str) return '';
    
    let result = str.replace(/\s+/g, ' ').trim();
    
    result = result.replace(/([a-z])([A-Z])/g, '$1 $2');
    
    result = result.replace(/([.,!?])([^\s\d])/g, '$1 $2');
    
    result = result.replace(/([^\s(])(\()/g, '$1 $2');  
    result = result.replace(/([)]])([A-Za-z0-9])/g, '$1 $2');  
    
    const contractions = ["let's", "i'm", "don't", "doesn't", "can't", "won't", "isn't", "aren't", "wasn't", "weren't", "haven't", "hasn't", "hadn't", "wouldn't", "shouldn't", "couldn't", "mustn't", "mightn't", "needn't", "i've", "you've", "we've", "they've", "i'd", "you'd", "he'd", "she'd", "we'd", "they'd", "i'll", "you'll", "he'll", "she'll", "we'll", "they'll", "i'm", "you're", "he's", "she's", "it's", "we're", "they're", "that's", "who's", "what's", "where's", "when's", "why's", "how's"];
    
    contractions.forEach(contraction => {
      const regex = new RegExp(`\\b${contraction.replace("'", "'")}\\b`, 'gi');
      result = result.replace(regex, contraction);
    });
    
    result = result.replace(/(\w)-(?=\w)/g, '$1 - ');  
    
    result = result.replace(/\s*([.,!?;:])\s*/g, '$1 ');  
    result = result.replace(/\s+([.,!?;:])/g, '$1');  
    
    result = result.replace(/"\s*([^"]+?)\s*"/g, '"$1"');
    result = result.replace(/\'\s*([^\']+?)\s*\'/g, "'$1'");
    
    
    result = result.replace(/\s+/g, ' ').trim();
    
    if (result.length > 0) {
      result = result.charAt(0).toUpperCase() + result.slice(1);
    }
    
    return result;
  };

  const formatMessageText = (text) => {
    if (!text) return '';
    
    const containsHtml = /<[a-z][\s\S]*>/i.test(text);
    
    if (containsHtml) {
      return text;
    }
    
    let formattedText = addSpacesToText(text);
    
    if (formattedText.includes('Featured Projectsin Healthcare')) {
      return formatHealthcareProjects(formattedText);
    }
    
    if (formattedText.includes('A.') || formattedText.includes('B.') || formattedText.includes('C.') || formattedText.includes('D.')) {
      return formatStructuredResponse(formattedText);
    }
    
    formattedText = formattedText.replace(/([a-z])([A-Z])/g, '$1 $2'); 
    formattedText = formattedText.replace(/([a-zA-Z])([A-Z])([a-z])/g, '$1 $2$3'); 
    if (formattedText.includes('A.') || formattedText.includes('B.') || formattedText.includes('C.') || formattedText.includes('D.')) {
      return formatStructuredResponse(formattedText);
    }
    
    formattedText = formattedText.replace(/([a-z])([A-Z])/g, '$1 $2');    
    formattedText = formattedText.replace(/([a-zA-Z])([A-Z])([a-z])/g, '$1 $2$3'); 
    formattedText = formattedText.replace(/([a-z])([A-Z][a-z])/g, '$1 $2'); 
    
    const paragraphs = formattedText.split(/\n{2,}/);
    const processedParagraphs = [];
    
    for (const paragraph of paragraphs) {
      if (!paragraph.trim()) continue;
      
      const lines = paragraph.split('\n');
      const processedLines = [];
      let inList = false;
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        
        const bulletMatch = trimmedLine.match(/^\s*([•*\-]|\d+[.)])\s*/);
        
        if (bulletMatch) {
          if (!inList) {
            inList = true;
            processedLines.push('<ul class="message-list">');
          }
          
          const bullet = bulletMatch[0].trim();
          const content = trimmedLine.substring(bulletMatch[0].length).trim();
          processedLines.push(`<li class="list-item">${content}</li>`);
        } else {
          if (inList) {
            inList = false;
            processedLines.push('</ul>');
          }
          
          if (trimmedLine) {
            const processedLine = trimmedLine.charAt(0).toUpperCase() + trimmedLine.slice(1);
            processedLines.push(`<p>${processedLine}</p>`);
          }
        }
      }
      
      if (inList) {
        processedLines.push('</ul>');
      }
      
      if (processedLines.length > 0) {
        processedParagraphs.push(processedLines.join(''));
      }
    }
    
    return processedParagraphs.join('\n\n');
  };

  const formatStructuredResponse = (text) => {
    const lines = text.split('\n');
    let result = [];
    let currentSection = null;
    let inList = false;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      const sectionMatch = trimmedLine.match(/^([A-Z])\.\s*(.*)/);
      
      if (sectionMatch) {
        if (inList) {
          result.push('</ul>');
          inList = false;
        }
        
        const sectionTitle = sectionMatch[2] ? ` ${sectionMatch[2]}` : '';
        result.push(`<h3 class="section-header">${sectionMatch[1]}.${sectionTitle}</h3>`);
        currentSection = sectionMatch[1];
      } 
      else if (/^\s*([•*\-]|\d+[.)])\s*/.test(trimmedLine)) {
        if (!inList) {
          result.push('<ul class="section-list">');
          inList = true;
        }
        
        const bulletMatch = trimmedLine.match(/^\s*([•*\-]|\d+[.)])\s*/);
        const bullet = bulletMatch ? bulletMatch[1] : '•';
        const content = bulletMatch ? trimmedLine.substring(bulletMatch[0].length).trim() : trimmedLine;
        
        const projectMatch = content.match(/^(.+?)\s*–\s*(.+)$/);
        if (projectMatch) {
          result.push(`<li class="list-item"><strong>${projectMatch[1].trim()}</strong> – ${projectMatch[2].trim()}</li>`);
        } else {
          result.push(`<li class="list-item">${content}</li>`);
        }
      } 
      else {
        if (inList) {
          result.push('</ul>');
          inList = false;
        }
        
        const processedLine = trimmedLine.charAt(0).toUpperCase() + trimmedLine.slice(1);
        result.push(`<p>${processedLine}</p>`);
      }
    }
    
    if (inList) {
      result.push('</ul>');
    }
    
    return result.join('\n');
  };
  const formatHealthcareProjects = (text) => {
    const cleanedText = addSpacesToText(text)
      .replace(/\s+/g, ' ') 
      .trim();
    
    let projects = [];
    const projectMatches = cleanedText.matchAll(/(?:•|\*|\-)\s*([^•\n]+?)(?=\s*(?:•|\*|\-)|$)/g);
    
    for (const match of projectMatches) {
      const projectText = match[1].trim();
      if (projectText) {
        const [name, ...descParts] = projectText.split(/[–\-:]/).map(s => s.trim());
        const description = descParts.join(' ').replace(/\s+/g, ' ').trim();
        
        if (name) {
          projects.push({
            name: name.replace(/^\s*[0-9]+\.?\s*/, ''), 
            description: description || 'No description available'
          });
        }
      }
    }
    
    if (projects.length === 0) {
      projects = [
        {
          name: 'Medi Assist Portal',
          description: 'HIPAA-compliant patient management system'
        },
        {
          name: 'Tele Med Care App',
          description: 'Video consultation and prescription handling'
        }
      ];
    }

    const sanitize = (html) => {
      return DOMPurify.sanitize(html, { 
        ALLOWED_TAGS: ['div', 'span', 'h3', 'strong', 'em', 'br'],
        ALLOWED_ATTR: ['class']
      });
    };

    const formattedProjects = projects.map(project => 
      `<div class="project-item">
        <span class="project-name">${sanitize(project.name)}</span>
        <span class="project-desc">${sanitize(project.description)}</span>
      </div>`
    ).join('\n');

    const htmlContent = `<div class="healthcare-project">
      <h3>Featured Projects in Healthcare</h3>
      <div class="project-list">
        ${formattedProjects}
      </div>
    </div>`;

    return htmlContent;
  };

  function App() {
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [streamedText, setStreamedText] = useState('');

    // Authentication state
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState(null);
    const [authToken, setAuthToken] = useState('');

    const eventSourceRef = useRef(null);
    const messagesEndRef = useRef(null);
    const typingTimeoutRef = useRef(null);
    
    const audioPlayer = useRef({
      currentAudio: null,
      isPlaying: false,
      audioContext: null,
      ...Array(10).fill().reduce((acc, _, i) => ({ ...acc, [`audio_${i}`]: null }), {})
    });
    
    const audioPlayerRef = audioPlayer;
    
    const scrollToBottom = useCallback(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    const handleKeyPress = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (inputValue.trim()) {
          handleSendMessage(inputValue);
          setInputValue('');
        }
      }
    };

    const handleSpeak = (text, messageId) => {
      if ('speechSynthesis' in window) {
        const speech = new SpeechSynthesisUtterance(text);
        speech.onend = () => {
          setIsSpeaking(false);
          audioPlayer.current.isPlaying = false;
        };
        
        window.speechSynthesis.cancel();
        
        setIsSpeaking(messageId);
        audioPlayer.current.isPlaying = true;
        window.speechSynthesis.speak(speech);
      }
    };

    const handleStopSpeech = useCallback(() => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
        audioPlayer.current.isPlaying = false;
      }
    }, []);

    // Authentication handlers
    const handleLogin = (userData, token) => {
      setUser(userData);
      setAuthToken(token);
      setIsAuthenticated(true);
    };

    const handleLogout = () => {
      setUser(null);
      setAuthToken('');
      setIsAuthenticated(false);
      setMessages([]);
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
    };

    // Check for existing authentication on component mount
    useEffect(() => {
      const storedToken = localStorage.getItem('authToken');
      const storedUser = localStorage.getItem('user');

      if (storedToken && storedUser) {
        try {
          // Parse the user data
          const userData = JSON.parse(storedUser);

          // Basic token validation - check if it's a proper JWT format
          const tokenParts = storedToken.split('.');
          if (tokenParts.length === 3) {
            setUser(userData);
            setAuthToken(storedToken);
            setIsAuthenticated(true);
          } else {
            // Invalid token format, clear storage
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
          }
        } catch (error) {
          console.error('Error parsing stored authentication data:', error);
          localStorage.removeItem('authToken');
          localStorage.removeItem('user');
        }
      }
    }, []);

    const cleanResponseText = (text) => {
      if (!text) return '';
      
      // First, try to extract text from complete JSON messages
      const completeMatch = text.match(/\{\s*"type"\s*:\s*"complete"\s*,\s*"text"\s*:\s*"([\s\S]*?)"\s*\}/);
      if (completeMatch && completeMatch[1]) {
        return completeMatch[1];
      }
      
      // If not a complete message, clean up any JSON artifacts
      let cleaned = text
        // Remove complete JSON objects first
        .replace(/\{\s*"type"\s*:\s*"complete"\s*,\s*"text"\s*:\s*"[\s\S]*?"\s*\}/g, '')
        // Remove any data: { ... } patterns
        .replace(/data:\s*\{[\s\S]*?\}/g, '')
        // Remove any remaining JSON-like content
        .replace(/\{[\s\S]*?\}/g, '')
        .replace(/\[[\s\S]*?\]/g, '')
        // Clean up quotes and escape characters
        .replace(/["']/g, '')
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\/g, '')
        // Clean up whitespace
        .replace(/\s+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      
      // If we're left with just whitespace or empty, try to get the text between quotes
      if (!cleaned.trim()) {
        const quotedMatch = text.match(/"text"\s*:\s*"([\s\S]*?)"/);
        if (quotedMatch && quotedMatch[1]) {
          cleaned = quotedMatch[1];
        }
      }
      
      return cleaned;
    };

    const handleStreamResponse = async (response, messageId) => {
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      let lastUpdateTime = 0;
      const UPDATE_THROTTLE_MS = 30;
      let streamId = response.headers.get('X-Stream-ID');
      let audioController = null;

      const updateMessage = (newText, force = false) => {
        const now = Date.now();
        if (!force && now - lastUpdateTime < UPDATE_THROTTLE_MS) return;
        lastUpdateTime = now;

        const cleanText = cleanResponseText(newText);
        
        setMessages(prev =>
          prev.map(msg =>
            msg.id === messageId
              ? { 
                  ...msg, 
                  text: cleanText, 
                  isStreaming: !force,
                  streamId: streamId || msg.streamId
                }
              : msg
          )
        );
      };

      return new Promise(async (resolve, reject) => {
        try {
          // If we have a stream ID, prepare for audio streaming
          if (streamId) {
            // Update the message with the stream ID
            updateMessage(fullResponse, false);
            
            // Start audio streaming in the background
            audioController = prepareAudio(
              { streamId },
              null,
              () => console.log('Audio started'),
              () => console.log('Audio ended'),
              'sns',
              'fast'
            );
            
            // Start playing the audio stream
            audioController.play().catch(err => {
              console.error('Error starting audio stream:', err);
            });
          }
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (!line.trim()) continue;
              
              let data;
              try {
                if (line.startsWith("data:")) {
                  data = JSON.parse(line.slice(5).trim());
                } else {
                  // If it's not a proper data line, skip it
                  continue;
                }
              } catch (e) {
                console.warn('Failed to parse line as JSON:', line);
                continue;
              }

              switch (data.type) {
                case "start":
                  break;

                case "token":
                  if (data.content) {
                    let content = data.content;
                    
                    // Skip processing if this is just metadata
                    const trimmedContent = content.trim();
                    if (trimmedContent === '{"type":"complete"}' || 
                        trimmedContent.startsWith('data: {')) {
                      continue;
                    }
                    
                    // Clean the content
                    content = cleanResponseText(content);
                    
                    if (content && content.trim()) {
                      // Only add space if the last character isn't a newline
                      if (fullResponse.length > 0 && 
                          !fullResponse.endsWith('\n') && 
                          !content.startsWith('\n') &&
                          !content.startsWith('-') &&  // Don't add space before bullet points
                          !fullResponse.endsWith(':')) {  // Don't add space after colons
                        fullResponse += ' ';
                      }
                      fullResponse += content;
                      updateMessage(fullResponse);
                    }
                  }
                  break;

                case "audio_complete":
                  // Handle audio completion with custom voice file
                  // Make sure we're using the text from data, not the raw response
                  fullResponse = typeof data.text === 'string' ? data.text : 
                               (data.text && typeof data.text.text === 'string' ? data.text.text : 
                               (data.text && typeof data.text.content === 'string' ? data.text.content : fullResponse));
                  
                  updateMessage(fullResponse, true);

                  // If we were streaming audio, clean up the audio controller
                  if (audioController) {
                    try {
                      audioController.stop();
                    } catch (e) {
                      console.error('Error stopping audio controller:', e);
                    }
                    audioController = null;
                  }

                  // For non-streaming audio, handle the audio file URL
                  const baseUrl = 'http://192.168.1.218:8000';
                  const audioFile = data.audio_file || (data.text && data.text.audio_file);
                  const audioUrl = audioFile && (
                    audioFile.startsWith('http') 
                      ? audioFile 
                      : `${baseUrl}${audioFile.startsWith('/') ? '' : '/'}${audioFile}`
                  );

                  // Store the audio file URL in the message and reset speaking state
                  setMessages(prev =>
                    prev.map(msg =>
                      msg.id === messageId
                        ? { 
                            ...msg, 
                            text: fullResponse, 
                            isStreaming: false, 
                            audioFile: audioUrl,
                            streamId: null // Clear stream ID since we're done streaming
                          }
                        : msg
                    )
                  );

                  // Reset speaking state to allow playing the new audio
                  setIsSpeaking(false);
                  audioPlayer.current.isPlaying = false;

                  return resolve(fullResponse);

                case "complete":
                  // Clean up any audio controller if it exists
                  if (audioController) {
                    try {
                      audioController.stop();
                    } catch (e) {
                      console.error('Error stopping audio controller on complete:', e);
                    }
                    audioController = null;
                  }
                  
                  // If we already have content from token events, ignore the complete event text
                  // to prevent duplicate content
                  if (fullResponse.trim().length > 0) {
                    // Finalize the message with what we have
                    updateMessage(fullResponse, true);
                    
                    // Clear the stream ID if it exists
                    setMessages(prev =>
                      prev.map(msg =>
                        msg.id === messageId
                          ? { ...msg, streamId: null }
                          : msg
                      )
                    );
                    
                    return resolve(fullResponse);
                  }
                  
                  // Fallback: If no content from tokens, use the complete event text
                  if (data.text) {
                    let cleanText = data.text;
                    
                    // If the text is JSON, parse it
                    if (typeof cleanText === 'string' && (cleanText.trim().startsWith('{') || cleanText.includes('"type":'))) {
                      try {
                        // Try to extract JSON from the text
                        const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                          const jsonData = JSON.parse(jsonMatch[0]);
                          if (jsonData.text) {
                            cleanText = jsonData.text;
                          }
                        }
                      } catch (e) {
                        console.warn('Failed to parse complete event JSON:', e);
                      }
                    }
                    
                    // Clean up the text
                    cleanText = cleanText
                      .replace(/^[\s\S]*?("text"\s*:\s*"|"type"\s*:\s*"complete")[\s\S]*?"([^"]+)"[\s\S]*$/, '$2')
                      .replace(/\\n/g, '\n')
                      .replace(/\\"/g, '"')
                      .replace(/\\/g, '')
                      .replace(/\s+\n/g, '\n')
                      .replace(/\n{3,}/g, '\n\n')
                      .trim();
                    
                    if (cleanText) {
                      fullResponse = cleanText;
                      updateMessage(fullResponse, true);
                      
                      // Clear the stream ID if it exists
                      setMessages(prev =>
                        prev.map(msg =>
                          msg.id === messageId
                            ? { ...msg, streamId: null }
                            : msg
                        )
                      );
                      
                      return resolve(fullResponse);
                    }
                  }
                  
                  // Clear the stream ID if it exists
                  setMessages(prev =>
                    prev.map(msg =>
                      msg.id === messageId
                        ? { ...msg, streamId: null }
                        : msg
                    )
                  );
                  
                  return resolve('');

                case "error":
                  console.error("Stream error:", data.message);
                  return reject(new Error(data.message));
              }
            }
          }
        } catch (err) {
          console.error("Stream read error:", err);
          
          // Clean up any audio controller if it exists
          if (audioController) {
            try {
              audioController.stop();
            } catch (e) {
              console.error('Error stopping audio controller on error:', e);
            }
            audioController = null;
          }
          
          // Clear the stream ID if it exists
          setMessages(prev =>
            prev.map(msg =>
              msg.id === messageId
                ? { ...msg, streamId: null, isStreaming: false }
                : msg
            )
          );
          
          reject(err);
        }
      });
    };

    const handleSendMessage = async (text) => {
      if (!text.trim() || isLoading || isStreaming) return;

      const userMessage = {
        id: `user-${Date.now()}`,
        text: text,
        sender: 'user',
        timestamp: new Date().toISOString(),
      };

      const typingMessage = {
        id: 'typing',
        text: '',
        sender: 'bot',
        timestamp: new Date().toISOString(),
      };

      setMessages(prevMessages => [...prevMessages, userMessage, typingMessage]);
      setInputValue('');
      setIsLoading(true);
      setIsStreaming(true);
      scrollToBottom();

      try {
        const messageId = Date.now();
        setMessages(prevMessages => {
          const messages = prevMessages.filter(msg => msg.id !== 'typing');
          return [
            ...messages,
            {
              id: messageId,
              text: '',
              sender: 'bot',
              timestamp: new Date().toISOString()
            }
          ];
        });

        const response = await fetch('http://192.168.1.218:8000/api/v1/ask/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
          },
          body: JSON.stringify({
            question: text,
            top_k: 5,
            similarity_threshold: 0.3
          }),
        });

        await handleStreamResponse(response, messageId);
      } catch (error) {
        console.error('Error in streaming response:', error);
        setMessages(prevMessages => [
          ...prevMessages.filter(msg => msg.id !== 'typing'),
          {
            id: `error-${Date.now()}`,
            text: 'Sorry, there was an error generating the response. Please try again.',
            sender: 'bot',
            timestamp: new Date().toISOString(),
          }
        ]);
      } finally {
        setIsLoading(false);
        setIsStreaming(false);
        scrollToBottom();
      }
    };

    const handlePlayAudio = useCallback(async (audioFile, messageText = '') => {
      // If already speaking, stop the current audio
      if (isSpeaking) {
        try {
          if (audioPlayer.current.currentAudio) {
            audioPlayer.current.currentAudio.pause();
            audioPlayer.current.currentAudio.currentTime = 0;
          }
          setIsSpeaking(false);
          audioPlayer.current.isPlaying = false;
          return;
        } catch (error) {
          console.error('Error controlling audio:', error);
          setIsSpeaking(false);
          audioPlayer.current.isPlaying = false;
          return;
        }
      }

      // If not speaking, start playing the audio
      try {
        setIsSpeaking(true);
        audioPlayer.current.isPlaying = true;

        // Stop any existing audio
        if (audioPlayer.current.currentAudio) {
          audioPlayer.current.currentAudio.pause();
          audioPlayer.current.currentAudio = null;
        }

        // Play custom voice audio file if available
        if (audioFile) {
          const audio = new Audio(audioFile);
          audioPlayer.current.currentAudio = audio;

          audio.onended = () => {
            setIsSpeaking(false);
            audioPlayer.current.isPlaying = false;
          };

          audio.onerror = (error) => {
            console.error('❌ Error playing custom audio:', error);
            setIsSpeaking(false);
            audioPlayer.current.isPlaying = false;
            // Fallback to browser TTS with the actual message text
            if (messageText) {
              handleSpeak(messageText, 'fallback');
            } else {
              console.error('No message text available for fallback TTS');
            }
          };

          await audio.play();
        } else {
          // Fallback to browser TTS if no custom audio file
          if (messageText) {
            handleSpeak(messageText, 'no-audio');
          } else {
            console.error('No message text available for TTS');
          }
          setIsSpeaking(false);
          audioPlayer.current.isPlaying = false;
        }
      } catch (error) {
        console.error('❌ Error playing audio:', error);
        setIsSpeaking(false);
        audioPlayer.current.isPlaying = false;
        // Try browser TTS as final fallback
        if (messageText) {
          console.log('🔄 Final fallback to browser TTS');
          handleSpeak(messageText, 'error-fallback');
        }
      }
    }, [isSpeaking, handleSpeak]);

    useEffect(() => {
      return () => {
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        
        
        if (audioPlayer.current.currentAudio) {
          audioPlayer.current.currentAudio.pause();
          audioPlayer.current.currentAudio = null;
        }
        
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
      };
    }, []);

    return (
      <div className="h-screen bg-gray-100 flex flex-col">
        {!isAuthenticated ? (
          <Login onLogin={handleLogin} />
        ) : (
          <>
            <div className="flex-1 bg-white flex flex-col overflow-hidden">
              {/* Header */}
              <div className="bg-primary text-white p-4 flex justify-between items-center">
                <div>
                  <h1 className="text-xl font-semibold">RAG Chatbot</h1>
                  <p className="text-white/80 text-sm">Welcome back, {user?.name}!</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm font-medium transition-colors"
                >
                  Logout
                </button>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                  <div className="text-center text-gray-500 mt-8">
                    <p>Start chatting with the AI assistant!</p>
                  </div>
                )}
                
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`chat-message ${message.sender}-message`}>
                      <div className="chat-message-content">
                        <div className="message-content-wrapper">
                        <div 
                          className="message-text"
                          dangerouslySetInnerHTML={{
                            __html: message.isStreaming
                              ? DOMPurify.sanitize(message.text)  // ✅ raw growing text (no bullets)
                              : formatMessageText(message.text),  // ✅ format once finished
                          }}
                        />

                          {isStreaming && message.id === 'typing' && (
                            <div className="typing-indicator">
                              <span></span>
                              <span></span>
                              <span></span>
                            </div>
                          )}
                        </div>
                        <div className="message-meta">
                          <span className={`timestamp ${message.sender === 'user' ? 'text-white/80' : 'text-gray-500'}`}>
                            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          
                          {message.sender === 'bot' && message.audioFile && (
                            <button
                              onClick={() => handlePlayAudio(message.audioFile, message.text)}
                              className="audio-control ml-2"
                              disabled={isLoading}
                              aria-label={isSpeaking && audioPlayer.current.isPlaying ? 'Pause audio' : 'Play audio'}
                            >
                              {isSpeaking && audioPlayer.current.isPlaying ? (
                                <svg className="w-4 h-4 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                </svg>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {message.sender === 'bot' && !message.audioFile && message.text && (
                        <button
                          onClick={() => handleSpeak(message.text, message.id)}
                          className="audio-control self-center"
                          disabled={isLoading}
                          aria-label={isSpeaking === message.id ? 'Stop speech' : 'Read aloud'}
                        >
                          {isSpeaking === message.id ? (
                            <svg className="w-4 h-4 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Loading indicator */}
                {isLoading && (
                  <div className="loading-dots">
                    <div className="loading-dot"></div>
                    <div className="loading-dot"></div>
                    <div className="loading-dot"></div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>

              {/* Input Section */}
              <div className="flex-shrink-0 p-4 border-t border-gray-200 bg-white">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <textarea
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Type your message..."
                      className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent resize-none"
                      rows="1"
                      style={{ minHeight: '44px', maxHeight: '120px' }}
                      disabled={isLoading || isStreaming}
                    />
                    <button
                      onClick={() => {
                        if (inputValue.trim()) {
                          handleSendMessage(inputValue);
                          setInputValue('');
                        }
                      }}
                      disabled={!inputValue.trim() || isLoading || isStreaming}
                      className={`absolute right-2 bottom-2 p-1 rounded-full ${
                        !inputValue.trim() || isLoading || isStreaming
                          ? 'text-gray-400 cursor-not-allowed'
                          : 'text-primary hover:bg-gray-100'
                      }`}
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  export default App;
