import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { pt } from './pt'
import { en } from './en'
import { es } from './es'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { pt, en, es },
    fallbackLng: 'pt',
    supportedLngs: ['pt', 'en', 'es'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'robinho_lang',
    },
  })

export default i18n
export const LANGS = [
  { code: 'pt', label: '🇧🇷 Português' },
  { code: 'en', label: '🇺🇸 English' },
  { code: 'es', label: '🇪🇸 Español' },
]
