import { useState, useEffect } from 'react';

const STORAGE_KEY = 'masters-pool-entries';

// Hardcoded entries — baked into the build so everyone sees the same pool
const DEFAULT_ENTRIES = [
  { id: 'e1', name: 'Collin Lamar', picks: ['Jon Rahm', 'Ludvig Aberg', 'Patrick Reed', 'J.J. Spaun', 'Gary Woodland', 'Max Greyserman'] },
  { id: 'e2', name: 'Bob Bennett', picks: ['Jon Rahm', 'Justin Rose', 'Patrick Reed', 'J.J. Spaun', 'Gary Woodland', 'Nick Taylor'] },
  { id: 'e3', name: 'Clark Foy 1', picks: ['Rory McIlroy', 'Ludvig Aberg', 'Robert MacIntyre', 'Maverick McNealy', 'Gary Woodland', 'Wyndham Clark'] },
  { id: 'e4', name: 'Clark Foy 2', picks: ['Bryson DeChambeau', 'Xander Schauffele', 'Chris Gotterup', 'J.J. Spaun', 'Keegan Bradley', 'Nick Taylor'] },
  { id: 'e5', name: 'Jesse Bennett', picks: ['Jon Rahm', 'Hideki Matsuyama', 'Si Woo Kim', 'Kurt Kitayama', 'Sungjae Im', 'Hao-Tong Li'] },
  { id: 'e6', name: 'Trent Brink', picks: ['Rory McIlroy', 'Tommy Fleetwood', 'Sepp Straka', 'J.J. Spaun', 'Daniel Berger', 'Bubba Watson'] },
  { id: 'e7', name: 'Cole Hon', picks: ['Scottie Scheffler', 'Cameron Young', 'Patrick Reed', 'Sam Burns', 'Gary Woodland', 'Ryan Gerard'] },
  { id: 'e8', name: 'Chris Ondo', picks: ['Bryson DeChambeau', 'Brooks Koepka', 'Robert MacIntyre', 'Corey Conners', 'Ben Griffin', 'Brian Harman'] },
  { id: 'e9', name: 'Xander Cribb', picks: ['Scottie Scheffler', 'Xander Schauffele', 'Si Woo Kim', 'Sam Burns', 'Keegan Bradley', 'Bubba Watson'] },
  { id: 'e10', name: 'Justin Eeg', picks: ['Jon Rahm', 'Ludvig Aberg', 'Min Woo Lee', 'J.J. Spaun', 'Ben Griffin', 'Brian Harman'] },
  { id: 'e11', name: 'Patrick Crimi', picks: ['Scottie Scheffler', 'Matt Fitzpatrick', 'Russell Henley', 'Maverick McNealy', 'Harry Hall', 'Nick Taylor'] },
];

export function useEntries() {
  const [entries, setEntries] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge: keep any admin-added entries, but ensure defaults are always present
        const existingIds = new Set(parsed.map(e => e.id));
        const missing = DEFAULT_ENTRIES.filter(d => !existingIds.has(d.id));
        return [...parsed, ...missing];
      }
    } catch { /* ignore */ }
    return [...DEFAULT_ENTRIES];
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
    setEntries([...DEFAULT_ENTRIES]);
  }

  return { entries, addEntry, bulkImport, updateEntry, deleteEntry, clearAll };
}
