// i18next bootstrap.
//
// Locale files live in src/locales/{en,es}/<area>.json and are shaped
// {"<area>": { "key": "text" }} — each area file owns one top-level key, and
// all of them are merged into the default ("common") namespace here. English
// strings for lib/ (read-time and ingestion progress messages) live next to
// their code in lib/src/messages.ts; es/lib.json supplies the Spanish side.
//
// Add a new language by extending SUPPORTED_LOCALES, adding a src/locales/<lng>
// directory, and extending the resource imports below. The key-parity test in
// src/i18n.test.ts keeps the files from drifting apart.
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { getLanguageFromCookie, setLanguageInCookie } from "./utils/cookies";
import { LIB_MESSAGES, setLibLocale, setLibMessageTranslator } from "../lib/src/messages";

import commonEn from "./locales/en/common.json";
import prefsEn from "./locales/en/prefs.json";
import listEn from "./locales/en/list.json";
import articleEn from "./locales/en/article.json";
import submitEn from "./locales/en/submit.json";
import diagnosticsEn from "./locales/en/diagnostics.json";
import ttsEn from "./locales/en/tts.json";
import failureEn from "./locales/en/failure.json";

import commonEs from "./locales/es/common.json";
import prefsEs from "./locales/es/prefs.json";
import listEs from "./locales/es/list.json";
import articleEs from "./locales/es/article.json";
import submitEs from "./locales/es/submit.json";
import diagnosticsEs from "./locales/es/diagnostics.json";
import ttsEs from "./locales/es/tts.json";
import failureEs from "./locales/es/failure.json";
import libEs from "./locales/es/lib.json";

export const SUPPORTED_LOCALES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
] as const;

export type AppLanguage = (typeof SUPPORTED_LOCALES)[number]["code"];

// Cookie first (explicit user choice), then the browser language, then English.
const detectInitialLanguage = (): AppLanguage => {
  const stored = getLanguageFromCookie();
  if (stored && SUPPORTED_LOCALES.some((l) => l.code === stored)) {
    return stored as AppLanguage;
  }

  const browserLanguage =
    typeof navigator !== "undefined" ? (navigator.language || "").toLowerCase() : "";
  if (browserLanguage.startsWith("es")) return "es";
  return "en";
};

i18next.use(initReactI18next).init({
  resources: {
    en: {
      common: {
        ...commonEn,
        ...prefsEn,
        ...listEn,
        ...articleEn,
        ...submitEn,
        ...diagnosticsEn,
        ...ttsEn,
        ...failureEn,
        lib: LIB_MESSAGES,
      },
    },
    es: {
      common: {
        ...commonEs,
        ...prefsEs,
        ...listEs,
        ...articleEs,
        ...submitEs,
        ...diagnosticsEs,
        ...ttsEs,
        ...failureEs,
        ...libEs,
      },
    },
  },
  lng: detectInitialLanguage(),
  fallbackLng: "en",
  supportedLngs: SUPPORTED_LOCALES.map((l) => l.code),
  defaultNS: "common",
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

i18next.on("languageChanged", (language) => {
  if (typeof document !== "undefined") {
    document.documentElement.lang = language;
  }
  setLibLocale(language);
});

if (typeof document !== "undefined" && document.documentElement) {
  document.documentElement.lang = i18next.language || "en";
}
setLibLocale(i18next.language || "en");

// lib/ progress and read-time strings go through the same i18next instance.
setLibMessageTranslator((key, params) =>
  i18next.t(`lib.${key}`, { ...params, defaultValue: LIB_MESSAGES[key] })
);

// The app's UI language, normalised to a supported locale code.
export const getAppLanguage = (): AppLanguage => {
  const language = i18next.resolvedLanguage || i18next.language || "en";
  return language.startsWith("es") ? "es" : "en";
};

// Persist the choice and switch the live app over.
export const setAppLanguage = async (language: AppLanguage): Promise<void> => {
  setLanguageInCookie(language);
  await i18next.changeLanguage(language);
};

export default i18next;
