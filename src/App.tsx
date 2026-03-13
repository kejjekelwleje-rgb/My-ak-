import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Mic, 
  Video, 
  MessageSquare, 
  X, 
  User, 
  Bot, 
  Volume2, 
  VolumeX,
  Maximize2,
  Minimize2,
  Settings,
  Info,
  ChevronRight,
  Sparkles,
  PhoneOff,
  Camera,
  MicOff,
  Terminal,
  BookOpen,
  Cpu,
  Image as ImageIcon,
  ChevronDown,
  Zap,
  Brain,
  Layers,
  Code,
  PenTool,
  Lightbulb,
  Search,
  Trash2,
  ImagePlus,
  Mail,
  Lock,
  AlertCircle,
  Loader2
} from 'lucide-react';
import Markdown from 'react-markdown';
import { GoogleGenAI, Modality } from "@google/genai";
import { getAI, SYSTEM_INSTRUCTION } from './services/ai';
import { Message, AppMode } from './types';
import { auth, db, loginWithGoogle, logout, registerWithEmail, loginWithEmail } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, doc, onSnapshot, setDoc, deleteDoc, query, orderBy, getDocs, serverTimestamp } from 'firebase/firestore';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [mode, setMode] = useState<AppMode>('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [selectedModel, setSelectedModel] = useState('gemini-3-flash-preview');
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  
  const models = [
    { id: 'gemini-3-flash-preview', name: 'Gemini Flash', desc: 'Fast & Efficient', icon: <Zap size={14} /> },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini Pro', desc: 'Complex Reasoning', icon: <Brain size={14} /> },
    { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini Lite', desc: 'Lightweight', icon: <Layers size={14} /> },
    { id: 'gemini-3.1-flash-image-preview', name: 'Nano Banana 2', desc: 'Image Gen & Edit', icon: <ImageIcon size={14} /> },
  ];

  const quickPrompts = [
    { icon: <PenTool size={18} />, label: 'Help me write', prompt: 'Help me write a professional email about ' },
    { icon: <Lightbulb size={18} />, label: 'Brainstorm', prompt: 'Give me 5 creative ideas for ' },
    { icon: <Code size={18} />, label: 'Code assistant', prompt: 'Explain this code or help me write a function for ' },
    { icon: <Search size={18} />, label: 'Summarize', prompt: 'Summarize the following text in 3 bullet points: ' },
  ];
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const recognitionRef = useRef<any>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      
      if (currentUser) {
        // Create user doc if it doesn't exist
        try {
          await setDoc(doc(db, 'users', currentUser.uid), {
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL,
            createdAt: Date.now()
          }, { merge: true });
        } catch (error) {
          console.error("Error creating user doc:", error);
        }
      } else {
        setMessages([{
          id: '1',
          role: 'model',
          text: "Hello! I am AKBOT, your professional AI assistant created by Priyanshu. Please log in to save your chat history.",
          timestamp: Date.now()
        }]);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;
    
    if (user) {
      const q = query(collection(db, 'users', user.uid, 'messages'), orderBy('timestamp', 'asc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const loadedMessages: Message[] = [];
        snapshot.forEach((doc) => {
          loadedMessages.push(doc.data() as Message);
        });
        
        if (loadedMessages.length === 0) {
          setMessages([{
            id: '1',
            role: 'model',
            text: "Hello! I am AKBOT, your professional AI assistant created by Priyanshu. How can I help you today?",
            timestamp: Date.now()
          }]);
        } else {
          setMessages(loadedMessages);
        }
      }, (error) => {
        console.error("Firestore Error:", error);
      });
      return () => unsubscribe();
    }
  }, [user, isAuthReady]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    let currentStream: MediaStream | null = null;

    if (mode === 'video') {
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
          currentStream = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
          stream.getVideoTracks().forEach(track => track.enabled = isCameraOn);
          stream.getAudioTracks().forEach(track => track.enabled = isMicOn);
        })
        .catch(err => console.error("Error accessing media:", err));
    } else {
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach(track => track.stop());
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [mode]);

  useEffect(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getVideoTracks().forEach(track => track.enabled = isCameraOn);
    }
  }, [isCameraOn]);

  useEffect(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getAudioTracks().forEach(track => track.enabled = isMicOn);
    }
  }, [isMicOn]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    setAuthError('');
    try {
      if (authMode === 'signup') {
        await registerWithEmail(email, password);
      } else {
        await loginWithEmail(email, password);
      }
      setShowAuthModal(false);
      setEmail('');
      setPassword('');
    } catch (error: any) {
      console.error("Auth error:", error);
      if (error.code === 'auth/email-already-in-use') {
        setAuthError('This email is already registered. Please log in.');
      } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
        setAuthError('Invalid email or password.');
      } else if (error.code === 'auth/weak-password') {
        setAuthError('Password should be at least 6 characters.');
      } else {
        setAuthError(error.message || "Authentication failed. Please try again.");
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const saveMessage = async (msg: Message) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid, 'messages', msg.id), msg);
    } catch (error) {
      console.error("Error saving message:", error);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSend = async (text: string = input) => {
    if (!text.trim() && !selectedImage) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text,
      imageUrl: selectedImage || undefined,
      timestamp: Date.now()
    };

    if (!user) {
      setMessages(prev => [...prev, userMessage]);
    } else {
      await saveMessage(userMessage);
    }
    
    const currentImage = selectedImage;
    setSelectedImage(null);
    setInput('');
    setIsTyping(true);

    // Specific identity check for Priyanshu
    const normalizedText = text.toLowerCase().trim().replace(/[?]$/, '');
    if (normalizedText === 'who is priyanshu') {
      const modelMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: "Priyanshu is the CEO of AK Army and the founder of AKBOT.",
        timestamp: Date.now()
      };

      setTimeout(async () => {
        if (!user) {
          setMessages(prev => [...prev, modelMessage]);
        } else {
          await saveMessage(modelMessage);
        }
        setIsTyping(false);
        if (mode === 'voice' || mode === 'video') {
          speak(modelMessage.text);
        }
      }, 600); // Slight delay for natural feel
      return;
    }

    // Image generation check
    const isImageRequest = normalizedText.startsWith('generate image') || 
                          normalizedText.startsWith('create image') || 
                          normalizedText.startsWith('draw') ||
                          selectedModel === 'gemini-3.1-flash-image-preview';

    try {
      const ai = getAI();
      
      if (isImageRequest) {
        const prompt = text.replace(/^(generate image|create image|draw)\s*/i, '');
        
        const parts: any[] = [];
        if (currentImage) {
          const [prefix, base64Data] = currentImage.split(',');
          const mimeType = prefix.match(/:(.*?);/)?.[1] || 'image/jpeg';
          parts.push({
            inlineData: {
              data: base64Data,
              mimeType
            }
          });
        }
        parts.push({ text: prompt || "A high quality professional image" });

        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-image-preview',
          contents: { parts },
          config: {
            imageConfig: {
              aspectRatio: "1:1",
              imageSize: "1K"
            }
          }
        });

        let imageUrl = '';
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            imageUrl = `data:image/png;base64,${part.inlineData.data}`;
            break;
          }
        }

        const modelMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'model',
          text: imageUrl ? `Here is the image you requested: "${prompt}"` : "I'm sorry, I couldn't generate the image.",
          imageUrl,
          timestamp: Date.now()
        };

        if (!user) {
          setMessages(prev => [...prev, modelMessage]);
        } else {
          await saveMessage(modelMessage);
        }
        
        if (mode === 'voice' || mode === 'video') {
          speak(modelMessage.text);
        }
        return;
      }

      let response;
      if (currentImage) {
        const [prefix, base64Data] = currentImage.split(',');
        const mimeType = prefix.match(/:(.*?);/)?.[1] || 'image/jpeg';
        response = await ai.models.generateContent({
          model: selectedModel,
          contents: {
            parts: [
              { inlineData: { data: base64Data, mimeType } },
              { text: text || "What is in this image?" }
            ]
          },
          config: { systemInstruction: SYSTEM_INSTRUCTION }
        });
      } else {
        const chat = ai.chats.create({
          model: selectedModel,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
          }
        });
        response = await chat.sendMessage({ message: text });
      }

      const modelText = response.text || "I'm sorry, I couldn't process that.";

      const modelMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: modelText,
        timestamp: Date.now()
      };

      if (!user) {
        setMessages(prev => [...prev, modelMessage]);
      } else {
        await saveMessage(modelMessage);
      }
      
      if (mode === 'voice' || mode === 'video') {
        speak(modelText);
      }
    } catch (error) {
      console.error("AI Error:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: "I encountered an error processing your request. Please check your API key and try again.",
        timestamp: Date.now()
      };
      if (!user) {
        setMessages(prev => [...prev, errorMessage]);
      } else {
        await saveMessage(errorMessage);
      }
    } finally {
      setIsTyping(false);
    }
  };

  const speak = async (text: string) => {
    setIsSpeaking(true);
    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say clearly and professionally: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioUrl = `data:audio/mp3;base64,${base64Audio}`;
        if (audioRef.current) {
          audioRef.current.src = audioUrl;
          audioRef.current.play();
          audioRef.current.onended = () => setIsSpeaking(false);
        }
      } else {
        setIsSpeaking(false);
      }
    } catch (error) {
      console.error("TTS Error:", error);
      setIsSpeaking(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (mode === 'chat') {
        setInput(transcript);
        // Automatically send after a short delay to allow visual feedback
        setTimeout(() => {
          handleSend(transcript);
        }, 500);
      } else {
        handleSend(transcript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-50 overflow-hidden">
      <audio ref={audioRef} className="hidden" />
      
      {/* Header */}
      <header className="h-16 glass flex items-center justify-between px-6 z-20 shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <button 
              onClick={() => setShowModelMenu(!showModelMenu)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-neutral-100 transition-all text-sm font-medium border border-neutral-200"
            >
              <span className="text-accent">
                {models.find(m => m.id === selectedModel)?.icon}
              </span>
              {models.find(m => m.id === selectedModel)?.name}
              <ChevronDown size={14} className={`transition-transform ${showModelMenu ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showModelMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full left-0 mt-2 w-64 bg-white border border-neutral-200 rounded-2xl shadow-xl p-2 z-50"
                >
                  {models.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setSelectedModel(m.id);
                        setShowModelMenu(false);
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-xl transition-all text-left ${selectedModel === m.id ? 'bg-primary/5' : 'hover:bg-neutral-50'}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 p-1.5 rounded-lg ${selectedModel === m.id ? 'bg-primary text-white' : 'bg-neutral-100 text-neutral-500'}`}>
                          {m.icon}
                        </div>
                        <div>
                          <p className="text-sm font-bold">{m.name}</p>
                          <p className="text-[10px] text-neutral-500">{m.desc}</p>
                        </div>
                      </div>
                      {selectedModel === m.id && (
                        <div className="w-2 h-2 bg-primary rounded-full" />
                      )}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="h-4 w-[1px] bg-neutral-200 mx-1 hidden sm:block" />
          <div className="flex items-center gap-2 group cursor-pointer">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white shadow-lg shadow-primary/20 group-hover:scale-110 transition-transform">
              <Bot size={18} />
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-tight">AKBOT</h1>
              <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-widest">Powered by Gemini</p>
            </div>
          </div>
        </div>

        <nav className="flex items-center gap-1 bg-neutral-100 p-1 rounded-xl">
          <button 
            onClick={() => setMode('chat')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${mode === 'chat' ? 'bg-white shadow-sm text-primary' : 'text-neutral-500 hover:text-primary'}`}
          >
            <MessageSquare size={16} />
            <span className="hidden sm:inline">Chat</span>
          </button>
          <button 
            onClick={() => setMode('voice')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${mode === 'voice' ? 'bg-white shadow-sm text-primary' : 'text-neutral-500 hover:text-primary'}`}
          >
            <Mic size={16} />
            <span className="hidden sm:inline">Voice</span>
          </button>
          <button 
            onClick={() => setMode('video')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${mode === 'video' ? 'bg-white shadow-sm text-primary' : 'text-neutral-500 hover:text-primary'}`}
          >
            <Video size={16} />
            <span className="hidden sm:inline">Video</span>
          </button>
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <div className="flex items-center gap-2">
              <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.email}`} alt="User" className="w-8 h-8 rounded-full border border-neutral-200" />
              <button 
                onClick={logout}
                className="text-xs font-medium text-neutral-500 hover:text-primary transition-colors px-2 py-1"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button 
                onClick={() => { setAuthMode('login'); setShowAuthModal(true); }}
                className="px-4 py-1.5 text-neutral-600 text-sm font-medium hover:text-primary transition-colors hidden sm:block"
              >
                Log In
              </button>
              <button 
                onClick={() => { setAuthMode('signup'); setShowAuthModal(true); }}
                className="px-4 py-1.5 bg-primary text-white text-sm font-medium rounded-full hover:bg-primary/90 transition-colors shadow-sm"
              >
                Sign Up
              </button>
            </div>
          )}
          <button 
            onClick={async () => {
              if (window.confirm('Clear all messages?')) {
                if (user) {
                  try {
                    const q = query(collection(db, 'users', user.uid, 'messages'));
                    const snapshot = await getDocs(q);
                    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
                    await Promise.all(deletePromises);
                  } catch (error) {
                    console.error("Error clearing chat:", error);
                  }
                } else {
                  setMessages([{
                    id: '1',
                    role: 'model',
                    text: "Hello! I am AKBOT, your professional AI assistant created by Priyanshu. How can I help you today?",
                    timestamp: Date.now()
                  }]);
                }
              }
            }}
            className="p-2 hover:bg-red-50 text-neutral-400 hover:text-red-500 rounded-lg transition-colors"
            title="Clear Chat"
          >
            <Trash2 size={20} />
          </button>
          <button 
            onClick={() => setShowInfo(!showInfo)}
            className="p-2 hover:bg-neutral-100 rounded-lg transition-colors text-neutral-500"
          >
            <Info size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 relative overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          {mode === 'chat' && (
            <motion.div 
              key="chat"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 flex flex-col max-w-4xl mx-auto w-full p-4 sm:p-6 overflow-y-auto"
            >
              {messages.length === 1 && (
                <div className="w-full mt-12 mb-12">
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-12"
                  >
                    <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                      Hello, I'm AKBOT
                    </h2>
                    <p className="text-neutral-500 max-w-lg mx-auto">
                      How can I help you today? Select a quick action or start typing below.
                    </p>
                  </motion.div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {quickPrompts.map((item, i) => (
                      <motion.button
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        onClick={() => setInput(item.prompt)}
                        className="flex items-start gap-4 p-5 bg-white border border-neutral-200 rounded-2xl hover:border-primary hover:shadow-lg hover:shadow-primary/5 transition-all text-left group"
                      >
                        <div className="p-3 rounded-xl bg-neutral-50 text-neutral-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                          {item.icon}
                        </div>
                        <div>
                          <p className="font-bold text-sm mb-1">{item.label}</p>
                          <p className="text-xs text-neutral-500 line-clamp-2">Click to start with this prompt template.</p>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-6 pb-4">
                {messages.map((msg, index) => {
                  const isLastMessage = index === messages.length - 1;
                  const showLoading = isTyping && isLastMessage && msg.role === 'user';
                  
                  return (
                  <div 
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''} items-end`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-neutral-200' : 'bg-primary text-white'}`}>
                        {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                      </div>
                      <div className={`p-4 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-primary text-white rounded-tr-none' : 'bg-white border border-neutral-200 rounded-tl-none shadow-sm'}`}>
                        {msg.imageUrl && (
                          <div className="mb-3 rounded-xl overflow-hidden border border-neutral-100 shadow-sm">
                            <img 
                              src={msg.imageUrl} 
                              alt="Generated" 
                              className="w-full h-auto object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        )}
                        <div className="markdown-body prose prose-sm max-w-none">
                          <Markdown>{msg.text}</Markdown>
                        </div>
                      </div>
                      {showLoading && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex items-center justify-center mb-2 mr-2"
                        >
                          <Loader2 size={16} className="animate-spin text-neutral-400" />
                        </motion.div>
                      )}
                    </div>
                  </div>
                )})}
                <div ref={chatEndRef} />
              </div>
            </motion.div>
          )}

          {mode === 'voice' && (
            <motion.div 
              key="voice"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex-1 flex flex-col items-center justify-center p-6 text-center"
            >
              <div className="relative">
                <motion.div 
                  animate={{ 
                    scale: isListening || isSpeaking ? [1, 1.2, 1] : 1,
                    opacity: isListening || isSpeaking ? [0.3, 0.6, 0.3] : 0.1
                  }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute inset-0 bg-accent rounded-full blur-3xl"
                />
                <button 
                  onClick={toggleListening}
                  className={`relative w-48 h-48 rounded-full flex flex-col items-center justify-center transition-all duration-500 ${isListening ? 'bg-accent text-white scale-110 shadow-2xl' : 'bg-white border-4 border-neutral-100 text-primary hover:border-accent/30'}`}
                >
                  {isListening ? <Mic size={64} className="animate-pulse" /> : <Mic size={64} />}
                  <span className="mt-4 font-bold text-sm uppercase tracking-widest">
                    {isListening ? 'Listening...' : 'Tap to Speak'}
                  </span>
                </button>
              </div>
              
              <div className="mt-12 max-w-md">
                <h2 className="text-2xl font-bold mb-2">Voice Assistant</h2>
                <p className="text-neutral-500">Talk to AKBOT naturally. I'll respond with clear and professional speech.</p>
                
                {isSpeaking && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-8 flex items-center gap-3 bg-accent/10 text-accent px-4 py-2 rounded-full"
                  >
                    <Volume2 size={18} className="animate-bounce" />
                    <span className="text-sm font-medium">AKBOT is speaking...</span>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {mode === 'video' && (
            <motion.div 
              key="video"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 bg-neutral-900 relative flex flex-col items-center justify-center overflow-hidden"
            >
              {/* Main Video (AKBOT Representation) */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-full h-full flex items-center justify-center">
                  <div className="absolute inset-0 bg-gradient-to-b from-neutral-900/50 via-transparent to-neutral-900" />
                  
                  {/* AKBOT Visualizer */}
                  <div className="relative z-10 flex flex-col items-center">
                    <motion.div 
                      animate={{ 
                        y: [0, -20, 0],
                        scale: isSpeaking ? [1, 1.05, 1] : 1
                      }}
                      transition={{ repeat: Infinity, duration: 4 }}
                      className="w-64 h-64 bg-primary rounded-3xl flex items-center justify-center text-white shadow-2xl video-glow relative"
                    >
                      <Sparkles className="absolute -top-4 -right-4 text-accent" size={48} />
                      <Bot size={120} />
                    </motion.div>
                    <h3 className="mt-8 text-3xl font-bold text-white tracking-tight">AKBOT Assistant</h3>
                    <p className="text-neutral-400 mt-2">Professional Digital Assistant</p>
                    
                    {isSpeaking && (
                      <div className="mt-6 flex gap-1 h-8 items-center">
                        {[...Array(5)].map((_, i) => (
                          <motion.div 
                            key={i}
                            animate={{ height: [8, 32, 8] }}
                            transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }}
                            className="w-1.5 bg-accent rounded-full"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* User Camera Preview */}
              <div className="absolute bottom-24 right-6 w-48 h-64 bg-neutral-800 rounded-2xl border-2 border-white/10 overflow-hidden shadow-2xl z-20">
                {isCameraOn ? (
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    muted 
                    playsInline 
                    className="w-full h-full object-cover mirror"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-500">
                    <Camera size={32} />
                  </div>
                )}
                <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-sm px-2 py-1 rounded text-[10px] text-white font-bold uppercase tracking-widest">
                  You
                </div>
              </div>

              {/* Video Controls */}
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 z-30">
                <button 
                  onClick={() => setIsMicOn(!isMicOn)}
                  className={`p-4 rounded-full transition-all ${isMicOn ? 'bg-neutral-800 text-white hover:bg-neutral-700' : 'bg-red-500 text-white'}`}
                >
                  {isMicOn ? <Mic size={24} /> : <MicOff size={24} />}
                </button>
                <button 
                  onClick={() => setIsCameraOn(!isCameraOn)}
                  className={`p-4 rounded-full transition-all ${isCameraOn ? 'bg-neutral-800 text-white hover:bg-neutral-700' : 'bg-red-500 text-white'}`}
                >
                  {isCameraOn ? <Video size={24} /> : <PhoneOff size={24} />}
                </button>
                <button 
                  onClick={() => setMode('chat')}
                  className="px-8 py-4 bg-red-600 text-white rounded-full font-bold hover:bg-red-700 transition-all flex items-center gap-2"
                >
                  <PhoneOff size={20} />
                  End Call
                </button>
                <button 
                  onClick={toggleListening}
                  className={`p-4 rounded-full transition-all ${isListening ? 'bg-accent text-white animate-pulse' : 'bg-neutral-800 text-white hover:bg-neutral-700'}`}
                >
                  <Mic size={24} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Info Panel */}
        <AnimatePresence>
          {showInfo && (
            <motion.div 
              initial={{ opacity: 0, x: 300 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 300 }}
              className="absolute top-0 right-0 h-full w-80 glass z-30 p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="font-bold text-xl">About AKBOT</h2>
                <button onClick={() => setShowInfo(false)} className="p-1 hover:bg-neutral-100 rounded-lg">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-3">Identity</h3>
                  <p className="text-sm text-neutral-600 leading-relaxed">
                    AKBOT is an intelligent, professional AI assistant designed to help with education, technology, and productivity.
                  </p>
                </section>

                <section>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-3">Creator</h3>
                  <div className="bg-neutral-100 p-4 rounded-xl border border-neutral-200">
                    <p className="text-sm font-bold text-primary">Priyanshu</p>
                    <p className="text-xs text-neutral-500 mt-1">CEO of AK Army & Founder of AKBOT</p>
                    <div className="mt-4 pt-4 border-t border-neutral-200">
                      <p className="text-[11px] text-neutral-500 italic">
                        "Priyanshu is the visionary leader behind AK Army, dedicated to pushing the boundaries of AI technology."
                      </p>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-3">Core Features</h3>
                  <div className="space-y-2">
                    {[
                      { icon: <MessageSquare size={14} />, text: 'Smart AI Chat' },
                      { icon: <Mic size={14} />, text: 'Voice Assistant' },
                      { icon: <Video size={14} />, text: 'Video Call Interface' },
                      { icon: <Sparkles size={14} />, text: 'Knowledge Assistant' }
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-neutral-600">
                        <span className="text-accent">{item.icon}</span>
                        {item.text}
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-3">Knowledge Areas</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { icon: <Terminal size={14} />, label: 'Coding' },
                      { icon: <Cpu size={14} />, label: 'Tech' },
                      { icon: <BookOpen size={14} />, label: 'Education' },
                      { icon: <Sparkles size={14} />, label: 'AI' }
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 bg-white border border-neutral-200 rounded-lg text-xs font-medium">
                        <span className="text-accent">{item.icon}</span>
                        {item.label}
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="absolute bottom-6 left-6 right-6">
                <p className="text-[10px] text-center text-neutral-400 uppercase tracking-tighter">
                  © 2026 AK Army. All Rights Reserved.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Input Area (Only for Chat mode) */}
      {mode === 'chat' && (
        <footer className="p-4 sm:p-6 bg-white border-t border-neutral-100 shrink-0">
          <div className="max-w-4xl mx-auto flex flex-col gap-2">
            <AnimatePresence>
              {isListening && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="flex items-center gap-2 text-accent text-xs font-bold uppercase tracking-widest px-2"
                >
                  <span className="flex gap-1">
                    <span className="w-1 h-1 bg-accent rounded-full animate-bounce" />
                    <span className="w-1 h-1 bg-accent rounded-full animate-bounce [animation-delay:0.2s]" />
                    <span className="w-1 h-1 bg-accent rounded-full animate-bounce [animation-delay:0.4s]" />
                  </span>
                  AKBOT is listening...
                </motion.div>
              )}
            </AnimatePresence>
            
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                {selectedImage && (
                  <div className="absolute -top-20 left-4 bg-white p-1 rounded-lg shadow-md border border-neutral-200 z-10">
                    <button 
                      onClick={() => setSelectedImage(null)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 shadow-sm"
                    >
                      <X size={12} />
                    </button>
                    <img src={selectedImage} alt="Selected" className="h-16 w-16 object-cover rounded-md" />
                  </div>
                )}
                <input 
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder={isListening ? "Listening..." : "Ask AKBOT anything..."}
                  className={`w-full bg-neutral-100 border-none rounded-2xl px-6 py-4 text-sm focus:ring-2 focus:ring-primary/10 transition-all outline-none pr-32 ${isListening ? 'placeholder:text-accent/50 ring-2 ring-accent/20' : ''}`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleImageUpload} 
                    accept="image/*" 
                    className="hidden" 
                  />
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-neutral-400 hover:text-accent transition-colors rounded-xl hover:bg-white"
                    title="Upload Image"
                  >
                    <ImagePlus size={20} />
                  </button>
                  <button 
                    onClick={() => {
                      if (input.trim()) {
                        handleSend(`Generate image: ${input}`);
                      } else {
                        setInput('Generate image: ');
                      }
                    }}
                    className="p-2 text-neutral-400 hover:text-accent transition-colors rounded-xl hover:bg-white"
                    title="Generate Image"
                  >
                    <ImageIcon size={20} />
                  </button>
                  <button 
                    onClick={toggleListening}
                    className={`p-2 rounded-xl transition-all ${isListening ? 'text-white bg-accent shadow-lg shadow-accent/20 scale-110' : 'text-neutral-400 hover:text-primary'}`}
                    title="Voice Input"
                  >
                    <Mic size={20} className={isListening ? 'animate-pulse' : ''} />
                  </button>
                </div>
              </div>
              <button 
                onClick={() => handleSend()}
                disabled={(!input.trim() && !selectedImage) || isTyping || isListening}
                className="bg-primary text-white p-4 rounded-2xl hover:bg-neutral-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
                title="Send Message"
              >
                <Send size={20} />
              </button>
            </div>
          </div>
        </footer>
      )}

      {/* Auth Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold">{authMode === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
                  <button onClick={() => setShowAuthModal(false)} className="p-2 hover:bg-neutral-100 rounded-full transition-colors">
                    <X size={20} />
                  </button>
                </div>
                
                {authError && (
                  <div className="mb-6 p-3 bg-red-50 text-red-600 rounded-xl flex items-start gap-2 text-sm border border-red-100">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <span>{authError}</span>
                  </div>
                )}

                <form onSubmit={handleEmailAuth} className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-neutral-700 mb-1.5 ml-1">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
                      <input 
                        type="email" 
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="w-full pl-11 pr-4 py-3.5 bg-neutral-50 border border-neutral-200 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm"
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-neutral-700 mb-1.5 ml-1">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
                      <input 
                        type="password" 
                        required
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full pl-11 pr-4 py-3.5 bg-neutral-50 border border-neutral-200 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                  <button 
                    type="submit"
                    disabled={isAuthLoading}
                    className="w-full py-3.5 mt-2 bg-primary text-white rounded-2xl font-bold hover:bg-primary/90 transition-colors disabled:opacity-70 shadow-lg shadow-primary/20"
                  >
                    {isAuthLoading ? 'Please wait...' : (authMode === 'login' ? 'Sign In' : 'Create Account')}
                  </button>
                </form>

                <div className="my-8 flex items-center gap-4">
                  <div className="flex-1 h-px bg-neutral-200"></div>
                  <span className="text-xs text-neutral-400 font-bold uppercase tracking-widest">OR</span>
                  <div className="flex-1 h-px bg-neutral-200"></div>
                </div>

                <button 
                  onClick={async () => {
                    try {
                      await loginWithGoogle();
                      setShowAuthModal(false);
                    } catch (err) {
                      setAuthError("Google sign in failed.");
                    }
                  }}
                  className="w-full py-3.5 bg-white border-2 border-neutral-100 text-neutral-700 rounded-2xl font-bold hover:bg-neutral-50 hover:border-neutral-200 transition-all flex items-center justify-center gap-3 shadow-sm"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </button>

                <p className="mt-8 text-center text-sm text-neutral-500">
                  {authMode === 'login' ? "Don't have an account? " : "Already have an account? "}
                  <button 
                    onClick={() => {
                      setAuthMode(authMode === 'login' ? 'signup' : 'login');
                      setAuthError('');
                    }}
                    className="text-primary font-bold hover:underline"
                  >
                    {authMode === 'login' ? 'Sign Up' : 'Sign In'}
                  </button>
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
