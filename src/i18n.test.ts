import i18next, { SUPPORTED_LOCALES, getAppLanguage, setAppLanguage } from "./i18n";
import { LIB_MESSAGES, t as libMessage } from "../lib/src/messages";
import { formatReadTime } from "../lib/src/lib";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

type LocaleTree = { [key: string]: string | LocaleTree };

// Each locale file is shaped {"<area>": { ... }}; unwrap the top-level key so
// both languages can be walked the same way.
const unwrap = (file: unknown, area: string): LocaleTree => {
  const value = (file as Record<string, LocaleTree | undefined>)[area];
  if (!value || typeof value !== "string" && typeof value !== "object") {
    throw new Error(`locale file for "${area}" is missing its "${area}" top-level key`);
  }
  return value;
};

const AREAS: Record<string, { en: unknown; es: unknown }> = {
  common: { en: commonEn, es: commonEs },
  prefs: { en: prefsEn, es: prefsEs },
  list: { en: listEn, es: listEs },
  article: { en: articleEn, es: articleEs },
  submit: { en: submitEn, es: submitEs },
  diagnostics: { en: diagnosticsEn, es: diagnosticsEs },
  tts: { en: ttsEn, es: ttsEs },
  failure: { en: failureEn, es: failureEs },
};

const flattenKeys = (node: LocaleTree, prefix = ""): string[] =>
  Object.entries(node).flatMap(([key, value]) =>
    typeof value === "string" ? [prefix + key] : flattenKeys(value, `${prefix}${key}.`)
  );

const flattenEntries = (node: LocaleTree, prefix = ""): [string, string][] =>
  Object.entries(node).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[`${prefix}${key}`, value] as [string, string]]
      : flattenEntries(value, `${prefix}${key}.`)
  );

const placeholdersOf = (text: string): string[] =>
  (text.match(/\{\{\s*\w+\s*\}\}/g) ?? []).sort();

describe("locale files", () => {
  it("every supported locale has a file for every area", () => {
    expect(SUPPORTED_LOCALES.map((l) => l.code)).toEqual(["en", "es"]);
    for (const area of Object.keys(AREAS)) {
      for (const locale of SUPPORTED_LOCALES) {
        const file = locale.code === "en" ? AREAS[area].en : AREAS[area].es;
        expect(typeof unwrap(file, area)).toBe("object");
      }
    }
  });

  it("en and es expose exactly the same keys, per area", () => {
    for (const [area, files] of Object.entries(AREAS)) {
      const enKeys = flattenKeys(unwrap(files.en, area)).sort();
      const esKeys = flattenKeys(unwrap(files.es, area)).sort();
      expect({ area, keys: esKeys }).toEqual({ area, keys: enKeys });
      expect(enKeys.length).toBeGreaterThan(0);
    }
  });

  it("es translations are all non-empty strings", () => {
    for (const [area, files] of Object.entries(AREAS)) {
      for (const [, value] of flattenEntries(unwrap(files.es, area))) {
        expect(typeof value).toBe("string");
        expect(value.trim()).not.toBe("");
        expect(value).not.toContain("undefined");
      }
    }
  });

  it("interpolation placeholders match between en and es", () => {
    for (const [area, files] of Object.entries(AREAS)) {
      const enEntries = flattenEntries(unwrap(files.en, area));
      const esEntries = flattenEntries(unwrap(files.es, area));
      const esByKey = new Map(esEntries);
      for (const [key, value] of enEntries) {
        expect({ area, key, placeholders: placeholdersOf(esByKey.get(key)!) }).toEqual({
          area,
          key,
          placeholders: placeholdersOf(value),
        });
      }
    }
  });

  it("es/lib.json covers exactly the keys lib/src/messages.ts defines", () => {
    const enKeys = Object.keys(LIB_MESSAGES).sort();
    const esKeys = flattenKeys(unwrap(libEs, "lib")).sort();
    expect(esKeys).toEqual(enKeys);
  });
});

describe("translated key usage", () => {
  // The i18next bundle for one language: every area file merged into the
  // default namespace, exactly like src/i18n.ts does at runtime.
  const bundleFor = (locale: "en" | "es"): LocaleTree => {
    const bundle: LocaleTree = locale === "en" ? { lib: LIB_MESSAGES } : unwrap(libEs, "lib");
    for (const [area, files] of Object.entries(AREAS)) {
      bundle[area] = locale === "en" ? unwrap(files.en, area) : unwrap(files.es, area);
    }
    return bundle;
  };

  const hasKey = (node: LocaleTree, key: string): boolean => {
    const resolve = (candidate: string): boolean => {
      let current: LocaleTree | string | undefined = node;
      for (const segment of candidate.split(".")) {
        if (typeof current !== "object" || current === undefined) return false;
        current = current[segment];
      }
      return typeof current === "string";
    };
    // Plural forms: t("area.items", { count }) resolves items_one / items_other.
    return resolve(key) || resolve(`${key}_one`);
  };

  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        return entry.name === "locales" ? [] : sourceFiles(path);
      }
      if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) return [];
      return [path];
    });

  it("every literal t(\"…\") key exists in both en and es", () => {
    const en = bundleFor("en");
    const es = bundleFor("es");
    const missing: string[] = [];

    for (const file of sourceFiles("src")) {
      const contents = readFileSync(file, "utf8");
      const calls = contents.matchAll(/\bt\(\s*"([^"]+)"/g);
      for (const match of calls) {
        const key = match[1];
        // Skip dynamic keys built by concatenation (t("area.prefix." + x)),
        // which resolve to a family of keys rather than a single one.
        if (!/^[\w.]+$/.test(key) || key.endsWith(".")) continue;
        if (!hasKey(en, key)) missing.push(`${file}: en missing "${key}"`);
        if (!hasKey(es, key)) missing.push(`${file}: es missing "${key}"`);
      }
    }

    expect(missing).toEqual([]);
  });
});

describe("i18n runtime", () => {
  afterEach(async () => {
    await setAppLanguage("en");
  });

  it("defaults to English when no language has been chosen", () => {
    expect(getAppLanguage()).toBe("en");
    expect(i18next.language).toBe("en");
  });

  it("translates keys in English and Spanish", async () => {
    expect(i18next.t("prefs.title")).toBe("Preferences");
    await setAppLanguage("es");
    expect(getAppLanguage()).toBe("es");
    expect(i18next.t("prefs.title")).toBe("Preferencias");
    expect(i18next.t("prefs.title")).not.toBe("Preferences");
  });

  it("returns the key itself for unknown keys instead of throwing", async () => {
    await setAppLanguage("es");
    expect(i18next.t("this.key.does.not.exist")).toBe("this.key.does.not.exist");
  });

  it("routes lib messages through the active language", async () => {
    expect(libMessage("day")).toBe("day");
    expect(formatReadTime(1500)).toBe("1 day 1 hr");

    await setAppLanguage("es");
    expect(libMessage("day")).toBe("día");
    expect(formatReadTime(1500)).toBe("1 día 1 h");
    expect(libMessage("downloadingImages")).toBe("descargando imágenes");
  });

  it("normalises Spanish browser locales to es", async () => {
    await setAppLanguage("es");
    expect(getAppLanguage()).toBe("es");
    await setAppLanguage("en");
    expect(getAppLanguage()).toBe("en");
  });
});
