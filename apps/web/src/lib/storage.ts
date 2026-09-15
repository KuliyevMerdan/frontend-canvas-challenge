/** localStorage может быть недоступен (приватный режим) — все обращения защищены здесь. */
export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Хранилище недоступно: приложение работает, но состояние не переживёт перезагрузку.
  }
}
