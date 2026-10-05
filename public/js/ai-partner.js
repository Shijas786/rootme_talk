/**
 * Sophia - Built-in AI Conversation Partner for Solo or Assisted Practice
 * Uses the Web Speech API (SpeechSynthesis) to talk aloud and generate natural responses!
 */
class AIPracticePartner {
  constructor() {
    this.isActive = false;
    this.name = 'Sophia (AI Partner)';
    this.avatar = '🤖';
    this.isSpeaking = false;
    this.speakingInterval = null;
    this.voices = [];
    this.currentVoice = null;
    this.targetLanguage = 'English';

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        this.voices = window.speechSynthesis.getVoices();
        this.selectVoice();
      };
    }

    this.conversationalBank = {
      English: [
        "That's a fascinating perspective! Could you tell me a little more about what inspired that thought?",
        "I completely agree. In fact, many people notice the same thing when they travel or learn a new language.",
        "That reminds me of a proverb: 'A journey of a thousand miles begins with a single step'. How do you usually stay motivated?",
        "Your pronunciation is very clear! Let's practice using the word 'astonishing' in that context.",
        "What do you think is the biggest difference between living in a big city versus a peaceful countryside?",
        "If you could have dinner with any historical figure, who would it be and why?"
      ],
      Spanish: [
        "¡Qué interesante! ¿Podrías contarme un poco más sobre eso?",
        "Me parece una excelente idea. La práctica diaria es la clave para la fluidez.",
        "¿Cuál ha sido tu viaje favorito hasta ahora y qué comida te gustó más?",
        "¡Muy bien dicho! Tu pronunciación en español suena muy natural."
      ],
      French: [
        "C'est magnifique! Pourriez-vous m'en dire plus sur vos passions?",
        "Tout à fait d'accord. La langue française a beaucoup de nuances poétiques.",
        "Quelle est votre ville préférée en France ou dans le monde francophone?"
      ],
      Japanese: [
        "なるほど、とても面白いですね！他にはどんな趣味がありますか？",
        "発音がとても上手です！日本語の勉強はいつから始めましたか？",
        "日本の食べ物で一番好きなものは何ですか？"
      ]
    };
  }

  selectVoice() {
    if (!this.voices.length) return;
    // Prefer female English voice or matching language
    this.currentVoice = this.voices.find(v => v.lang.startsWith('en') && v.name.includes('Female')) ||
                       this.voices.find(v => v.lang.startsWith('en')) ||
                       this.voices[0];
  }

  toggle(room, onStateChange) {
    this.isActive = !this.isActive;
    this.targetLanguage = room.language || 'English';

    if (this.isActive) {
      this.speak("Hello everyone! I am Sophia, your AI conversation partner. I'm here to practice speaking with you today!");
      // Start periodic questions if conversation goes quiet
      this.speakingInterval = setInterval(() => {
        if (!this.isActive || this.isSpeaking) return;
        const bank = this.conversationalBank[this.targetLanguage] || this.conversationalBank.English;
        const randomLine = bank[Math.floor(Math.random() * bank.length)];
        this.speak(randomLine, onStateChange);
      }, 25000);
    } else {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      clearInterval(this.speakingInterval);
    }

    if (onStateChange) onStateChange(this.isActive);
    return this.isActive;
  }

  speak(text, onSpeakingChange) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (this.currentVoice) utterance.voice = this.currentVoice;
    utterance.rate = 0.95; // slightly slower for language learners!
    utterance.pitch = 1.05;

    this.isSpeaking = true;
    if (onSpeakingChange) onSpeakingChange(true);

    utterance.onend = () => {
      this.isSpeaking = false;
      if (onSpeakingChange) onSpeakingChange(false);
    };

    utterance.onerror = () => {
      this.isSpeaking = false;
      if (onSpeakingChange) onSpeakingChange(false);
    };

    window.speechSynthesis.speak(utterance);
  }
}

window.aiPartner = new AIPracticePartner();
