import React, { useState, useRef, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { prepareAudio, stopAudio } from './utils/audioPlayer';
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
  
  // Removed overly aggressive split that inserted spaces between an uppercase letter
  // followed by a lowercase letter (e.g., "The" -> "T he"). We only split camelCase
  // elsewhere using ([a-z])([A-Z]) rules.
  
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

  const handleStreamResponse = useCallback(async (question) => {
    return new Promise(async (resolve, reject) => {
      const requestBody = {
        question: question,
        top_k: 5,
        similarity_threshold: 0.3
      };

      let fullResponse = '';
      let messageId = Date.now();

      try {
        const response = await fetch('http://192.168.1.218:8000/api/v1/ask/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.body) {
          throw new Error('No response body');
        }

        const reader = response.body.getReader();
        let buffer = '';
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

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += new TextDecoder().decode(value);

          let eventMatch;
          const eventRegex = /data: (.*)\n\n/g;
          while ((eventMatch = eventRegex.exec(buffer)) !== null) {
            try {
              const data = JSON.parse(eventMatch[1]);
              switch (data.type) {
                case 'start':
                  // Already handled above
                  break;
                case 'token':
                  fullResponse += data.content;
                  setMessages(prevMessages => prevMessages.map(msg =>
                    msg.id === messageId
                      ? { ...msg, text: (msg.text || '') + data.content }
                      : msg
                  ));
                  break;
                case 'end':
                  resolve(fullResponse);
                  return;
                case 'error':
                  reject(new Error(data.content));
                  return;
                default:
                  break;
              }
            } catch (e) {
              console.error('Error parsing SSE event:', e);
            }
          }
          // Remove processed events from buffer
          buffer = buffer.slice(eventRegex.lastIndex);
          eventRegex.lastIndex = 0;
        }
        resolve(fullResponse);
      } catch (error) {
        console.error('Streaming fetch error:', error);
        reject(error);
      }
    });
  }, []);

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
      await handleStreamResponse(text);
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

  const handlePlayAudio = useCallback(async (audioFile) => {
    if (isSpeaking) {
      try {
        if (audioPlayer.current.currentAudio) {
          if (audioPlayer.current.currentAudio.paused) {
            await audioPlayer.current.currentAudio.play();
          } else {
            audioPlayer.current.currentAudio.pause();
            audioPlayer.current.currentAudio.currentTime = 0;
          }
        }
      } catch (error) {
        console.error('Error controlling audio:', error);
      }
      return;
    }

    try {
      setIsSpeaking(true);
      audioPlayer.current.isPlaying = true;
      
      if (audioPlayer.current.currentAudio) {
        audioPlayer.current.currentAudio.pause();
        audioPlayer.current.currentAudio = null;
      }
      const audio = new Audio(audioFile);
      audioPlayer.current.currentAudio = audio;
      
      audio.onended = () => {
        setIsSpeaking(false);
        audioPlayer.current.isPlaying = false;
      };
      
      audio.onerror = (error) => {
        console.error('Error playing audio:', error);
        setIsSpeaking(false);
        audioPlayer.current.isPlaying = false;
      };

      await audio.play();
    } catch (error) {
      console.error('Error playing audio:', error);
      setIsSpeaking(false);
      audioPlayer.current.isPlaying = false;
    }
  }, [isSpeaking]);

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
      <div className="flex-1 bg-white flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-primary text-white p-4">
          <h1 className="text-xl font-semibold">RAG Chatbot</h1>
          <p className="text-white/80 text-sm">Ask me anything!</p>
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
                        __html: typeof message.text === 'string' 
                          ? formatMessageText(message.text)
                          : ''
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
                        onClick={() => handlePlayAudio(message.audioFile)}
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
    </div>
  );
}

export default App;
