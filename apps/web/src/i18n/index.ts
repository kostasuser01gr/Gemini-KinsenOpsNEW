import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    resources: {
      en: {
        translation: {
          new_chat: 'New Chat',
          search_threads: 'Search threads...',
          knowledge_base: 'Knowledge Base',
          settings: 'Settings',
          how_help: 'How can I help you today?',
          no_ai_mode: 'No-AI mode active',
        }
      },
      el: {
        translation: {
          new_chat: 'Νέα Συνομιλία',
          search_threads: 'Αναζήτηση συνομιλιών...',
          knowledge_base: 'Βάση Γνώσης',
          settings: 'Ρυθμίσεις',
          how_help: 'Πώς μπορώ να βοηθήσω σήμερα;',
          no_ai_mode: 'Λειτουργία No-AI ενεργή',
        }
      }
    }
  });

export default i18n;
