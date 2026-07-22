import { browser } from '$app/environment';
import { en, type Tone } from './en';

export type Theme = 'dark' | 'light' | 'system';

class Preferences {
  tone = $state<Tone>('kitsune');
  theme = $state<Theme>('dark');
  branding = $state(true);

  load() {
    if (!browser) return;
    const tone = localStorage.getItem('kitsune:tone');
    const theme = localStorage.getItem('kitsune:theme');
    if (tone === 'kitsune' || tone === 'professional') this.tone = tone;
    if (theme === 'dark' || theme === 'light' || theme === 'system') this.theme = theme;
    this.applyTheme();
  }

  setTone(tone: Tone) {
    this.tone = tone;
    if (browser) localStorage.setItem('kitsune:tone', tone);
  }

  setTheme(theme: Theme) {
    this.theme = theme;
    if (browser) localStorage.setItem('kitsune:theme', theme);
    this.applyTheme();
  }

  private applyTheme() {
    if (!browser) return;
    const resolved =
      this.theme === 'system'
        ? matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : this.theme;
    document.documentElement.dataset.theme = resolved;
  }
}

export const preferences = new Preferences();

export function copy<T extends keyof typeof en>(section: T): (typeof en)[T] {
  return en[section];
}

export function toned(value: { kitsune: string; professional: string }): string {
  return value[preferences.tone];
}
