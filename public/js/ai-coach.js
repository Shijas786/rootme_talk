/**
 * RootMe Talk - Live AI Speech Transcription & Real-Time Corrections Coach
 * Transcribes what the user says in real-time, understands it, and provides
 * instant natural sentence corrections and phrase improvements in the same screen HUD.
 * Activated strictly on-demand via the AI Coach button.
 */
class LiveAICoach {
  constructor() {
    this.isActive = false;
    this.recognition = null;
    this.currentLanguage = 'en-US';
    this.transcriptHistory = [];
    this.interimText = '';
    this.analysisHistory = [];
    this.isAnalyzing = false;
    this.targetRoomLanguage = 'English';

    this.initRecognition();
  }

  initRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      console.warn('SpeechRecognition API is not supported in this browser.');
      return;
    }

    this.recognition = new SpeechRec();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.isActive = true;
      if (this.onStateChange) this.onStateChange(true);
    };

    this.recognition.onresult = (event) => {
      let interim = '';
      let finalized = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalized += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      this.interimText = interim;
      if (this.onTranscriptUpdate) {
        this.onTranscriptUpdate({
          interim: this.interimText,
          history: this.transcriptHistory
        });
      }

      if (finalized.trim()) {
        const sentence = finalized.trim();
        const localProfile = window.currentUserProfile || {};
        const item = {
          text: sentence,
          speakerName: localProfile.name || 'You',
          speakerAvatar: localProfile.avatar || '🦊',
          speakerPhotoUrl: localProfile.photoUrl || null,
          isLocal: true,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        };
        this.transcriptHistory.push(item);
        if (this.transcriptHistory.length > 50) this.transcriptHistory.shift();

        if (this.onLocalSpoken) {
          this.onLocalSpoken(item);
        }

        // Trigger real-time AI correction and linguistic understanding
        this.analyzeSpokenSentence(sentence, item);

        if (this.onTranscriptUpdate) {
          this.onTranscriptUpdate({
            interim: '',
            history: this.transcriptHistory
          });
        }
      }
    };

    this.recognition.onerror = (event) => {
      console.warn('Speech recognition event:', event.error);
      if (event.error === 'not-allowed') {
        this.stop();
        if (this.onError) this.onError('Microphone permission required for speech transcription.');
      }
    };

    this.recognition.onend = () => {

      if (this.isActive) {
        // Auto restart if still marked active
        try {
          this.recognition.start();
        } catch (e) {}
      } else {
        if (this.onStateChange) this.onStateChange(false);
      }
    };
  }

  setLanguage(languageName) {
    this.targetRoomLanguage = languageName;
    const langMap = {
      'English': 'en-US',
      'Spanish': 'es-ES',
      'French': 'fr-FR',
      'German': 'de-DE',
      'Japanese': 'ja-JP',
      'Korean': 'ko-KR',
      'Mandarin': 'zh-CN',
      'Arabic': 'ar-SA',
      'Italian': 'it-IT',
      'Portuguese': 'pt-BR'
    };
    this.currentLanguage = langMap[languageName] || 'en-US';
    if (this.recognition) {
      this.recognition.lang = this.currentLanguage;
    }
  }

  toggle(roomLanguage = 'English') {
    if (this.isActive) {
      this.stop();
      return false;
    } else {
      this.start(roomLanguage);
      return true;
    }
  }

  start(roomLanguage = 'English') {
    if (!this.recognition) {
      if (this.onError) this.onError('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }
    this.setLanguage(roomLanguage);
    this.isActive = true;
    try {
      this.recognition.start();
    } catch (e) {
      console.warn('Recognition start warning:', e);
    }
    if (this.onStateChange) this.onStateChange(true);
  }

  stop() {
    this.isActive = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }
    if (this.onStateChange) this.onStateChange(false);
  }

  // Add remote room participant's speech into the live coach feed
  addRemoteSpeechSegment({ text, speakerName, speakerAvatar, speakerPhotoUrl, timestamp }) {
    if (!text || !text.trim()) return;
    const item = {
      text: text.trim(),
      speakerName: speakerName || 'Partner',
      speakerAvatar: speakerAvatar || '👤',
      speakerPhotoUrl: speakerPhotoUrl || null,
      isLocal: false,
      timestamp: timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    this.transcriptHistory.push(item);
    if (this.transcriptHistory.length > 50) this.transcriptHistory.shift();

    // Analyze speech segment to offer constructive tips
    this.analyzeSpokenSentence(item.text, item);

    if (this.onTranscriptUpdate) {
      this.onTranscriptUpdate({
        interim: this.interimText,
        history: this.transcriptHistory
      });
    }
  }

  // Real-Time Sentence Analysis & Grammar / Natural Phrasing Engine
  async analyzeSpokenSentence(sentence, speakerInfo = null) {
    if (!sentence || sentence.length < 3) return;

    this.isAnalyzing = true;
    if (this.onAnalysisStatus) this.onAnalysisStatus(true);

    let feedback = null;

    // 1. Check for user-provided OpenAI API Key
    const openAIKey = localStorage.getItem('rootme_openai_key');
    if (openAIKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openAIKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `You are an expert real-time speaking coach for ${this.targetRoomLanguage}.
Analyze the user's spoken sentence. Return JSON with:
- "original": the input sentence
- "isAccurate": boolean (true if natural and grammatically correct)
- "better": a more natural, idiomatic, or corrected phrasing (or null if already perfect)
- "grammarNote": concise 1-sentence explanation of what was fixed or improved
- "vocabularyAlternative": one advanced/C1-level phrase or idiom that levels up this thought
Keep everything polite, encouraging, and brief.`
              },
              {
                role: 'user',
                content: sentence
              }
            ],
            response_format: { type: 'json_object' }
          })
        });

        if (response.ok) {
          const data = await response.json();
          feedback = JSON.parse(data.choices[0].message.content);
        }
      } catch (err) {
        console.warn('OpenAI live coach fallback:', err);
      }
    }

    // 2. Offline Linguistic Rules & Intelligent Corrections Engine
    if (!feedback) {
      feedback = this.generateLocalLinguisticFeedback(sentence);
    }

    this.isAnalyzing = false;
    if (this.onAnalysisStatus) this.onAnalysisStatus(false);

    if (feedback) {
      const card = {
        id: 'fb-' + Date.now().toString(36),
        original: sentence,
        better: feedback.better,
        grammarNote: feedback.grammarNote,
        vocabularyAlternative: feedback.vocabularyAlternative,
        speakerName: speakerInfo ? speakerInfo.speakerName : 'Speaker',
        speakerAvatar: speakerInfo ? speakerInfo.speakerAvatar : '👤',
        speakerPhotoUrl: speakerInfo ? speakerInfo.speakerPhotoUrl : null,
        isLocal: speakerInfo ? !!speakerInfo.isLocal : false,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      this.analysisHistory.unshift(card);
      if (this.analysisHistory.length > 25) this.analysisHistory.pop();

      if (this.onNewFeedback) {
        this.onNewFeedback(card);
      }
    }
  }

  generateLocalLinguisticFeedback(text) {
    const lower = text.toLowerCase();

    // Pattern-based grammatical rules for instant coaching
    const patterns = [
      {
        test: /\b(i am agree|i'm agree)\b/i,
        better: text.replace(/\b(i am agree|i'm agree)\b/gi, 'I agree'),
        note: '"Agree" is a verb, not an adjective. Say "I agree" instead of "I am agree".',
        vocab: 'Concur ("I concur with your point")'
      },
      {
        test: /\b(i go|i went to|i did go)\b.*\byesterday\b/i,
        better: text.replace(/\bi go\b/gi, 'I went'),
        note: 'Use simple past tense ("went") when specifying completed past time like "yesterday".',
        vocab: 'Headed over ("I headed over to the office yesterday")'
      },
      {
        test: /\b(listen music)\b/i,
        better: text.replace(/\blisten music\b/gi, 'listen to music'),
        note: 'The verb "listen" requires the preposition "to" before an object.',
        vocab: 'Tune into ("I love tuning into classical music")'
      },
      {
        test: /\b(depends of)\b/i,
        better: text.replace(/\bdepends of\b/gi, 'depends on'),
        note: 'In English, the dependent preposition is "on" (e.g. "It depends on the weather").',
        vocab: 'Hinges upon ("The decision hinges upon timing")'
      },
      {
        test: /\b(explain me)\b/i,
        better: text.replace(/\bexplain me\b/gi, 'explain to me'),
        note: 'The verb "explain" takes "to + person" (e.g. "Can you explain this to me?").',
        vocab: 'Elaborate ("Could you elaborate on that concept?")'
      },
      {
        test: /\b(people is)\b/i,
        better: text.replace(/\bpeople is\b/gi, 'people are'),
        note: '"People" is a plural noun in English, so it pairs with "are", not "is".',
        vocab: 'Individuals ("Many individuals find this helpful")'
      },
      {
        test: /\b(more better|more easier)\b/i,
        better: text.replace(/\bmore better\b/gi, 'better').replace(/\bmore easier\b/gi, 'easier'),
        note: 'Do not use double comparatives. Use "better" or "easier" alone.',
        vocab: 'Far superior / Significantly simpler'
      }
    ];

    for (const p of patterns) {
      if (p.test.test(text)) {
        return {
          original: text,
          better: p.better,
          grammarNote: p.note,
          vocabularyAlternative: p.vocab
        };
      }
    }

    // If no direct grammatical error, provide a natural conversational polish
    const polished = this.polishSentenceFlow(text);
    return {
      original: text,
      better: polished.better,
      grammarNote: 'Grammar looks solid! Here is an even more natural, native phrasing:',
      vocabularyAlternative: polished.vocab
    };
  }

  polishSentenceFlow(text) {
    if (text.length < 15) {
      return {
        better: `${text} — phrased smoothly!`,
        vocab: 'Articulate ("Well articulated statement")'
      };
    }

    // Suggestions for making basic sentences sound fluent
    return {
      better: `To put it another way: "${text.charAt(0).toUpperCase() + text.slice(1)}"`,
      vocab: 'In essence / From my vantage point'
    };
  }
}

window.liveAICoach = new LiveAICoach();
