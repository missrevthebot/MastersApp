import { useState, useEffect } from 'react';

const STORAGE_KEY = 'masters-pool-entries';

export function useEntries() {
  const [entries, setEntries] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  function addEntry(entry) {
    setEntries(prev => [...prev, { ...entry, id: Date.now().toString() }]);
  }

  function bulkImport(newEntries) {
    setEntries(prev => {
      const existingNames = new Set(prev.map(e => e.name.toLowerCase().trim()));
      const toAdd = newEntries
        .filter(e => !existingNames.has(e.name.toLowerCase().trim()))
        .map(e => ({ ...e, id: (Date.now() + Math.random()).toString() }));
      return [...prev, ...toAdd];
    });
  }

  function updateEntry(id, updated) {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...updated } : e));
  }

  function deleteEntry(id) {
    setEntries(prev => prev.filter(e => e.id !== id));
  }

  function clearAll() {
    setEntries([]);
  }

  return { entries, addEntry, bulkImport, updateEntry, deleteEntry, clearAll };
}
