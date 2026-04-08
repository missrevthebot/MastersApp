import { useState, useEffect } from 'react';

const STORAGE_KEY = 'masters-pool-entries';

// Hardcoded entries — baked into the build so everyone sees the same pool
const DEFAULT_ENTRIES = [
  { id: 'e1', name: 'Collin Lamar', picks: ['Jon Rahm', 'Ludvig Aberg', 'Patrick Reed', 'J.J. Spaun', 'Gary Woodland', 'Max Greyserman'] },
  { id: 'e2', name: 'Bob Bennett', picks: ['Jon Rahm', 'Justin Rose', 'Patrick Reed', 'J.J. Spaun', 'Gary Woodland', 'Nick Taylor'] },
  { id: 'e3', name: 'Clark Foy 1', picks: ['Rory McIlroy', 'Ludvig Aberg', 'Robert MacIntyre', 'Maverick McNealy', 'Gary Woodland', 'Wyndham Clark'] },
  { id: 'e4', name: 'Clark Foy 2', picks: ['Bryson DeChambeau', 'Xander Schauffele', 'Chris Gotterup', 'J.J. Spaun', 'Keegan Bradley', 'Nick Taylor'] },
  { id: 'e5', name: 'Jesse Bennett', picks: ['Jon Rahm', 'Hideki Matsuyama', 'Si Woo Kim', 'Kurt Kitayama', 'Sungjae Im', 'Hao-Tong Li'] },
  { id: 'e6', name: 'T-Money$', picks: ['Rory McIlroy', 'Tommy Fleetwood', 'Sepp Straka', 'J.J. Spaun', 'Daniel Berger', 'Bubba Watson'] },
  { id: 'e7', name: 'Cole Hon', picks: ['Scottie Scheffler', 'Cameron Young', 'Patrick Reed', 'Sam Burns', 'Gary Woodland', 'Ryan Gerard'] },
  { id: 'e8', name: 'Chris Ondo', picks: ['Bryson DeChambeau', 'Brooks Koepka', 'Robert MacIntyre', 'Corey Conners', 'Ben Griffin', 'Brian Harman'] },
  { id: 'e9', name: 'Xander Cribb', picks: ['Scottie Scheffler', 'Xander Schauffele', 'Si Woo Kim', 'Sam Burns', 'Keegan Bradley', 'Bubba Watson'] },
  { id: 'e10', name: 'Justin Eeg', picks: ['Jon Rahm', 'Ludvig Aberg', 'Min Woo Lee', 'J.J. Spaun', 'Ben Griffin', 'Brian Harman'] },
  { id: 'e11', name: 'Patrick Crimi', picks: ['Scottie Scheffler', 'Matt Fitzpatrick', 'Russell Henley', 'Maverick McNealy', 'Harry Hall', 'Nick Taylor'] },
  { id: 'e12', name: 'Raphael Dickie', picks: ['Scottie Scheffler', 'Xander Schauffele', 'Viktor Hovland', 'Corey Conners', 'Sungjae Im', 'Wyndham Clark'] },
  { id: 'e13', name: 'Dan Jackson', picks: ['Rory McIlroy', 'Tommy Fleetwood', 'Si Woo Kim', 'J.J. Spaun', 'Gary Woodland', 'Hao-Tong Li'] },
  { id: 'e14', name: 'Kevin Tan', picks: ['Bryson DeChambeau', 'Xander Schauffele', 'Patrick Reed', 'Corey Conners', 'Daniel Berger', 'Sergio Garcia'] },
  { id: 'e15', name: 'Mike Martinez', picks: ['Scottie Scheffler', 'Ludvig Aberg', 'Viktor Hovland', 'Sam Burns', 'Sungjae Im', 'Brian Harman'] },
  { id: 'e16', name: 'Liam Masek', picks: ['Bryson DeChambeau', 'Xander Schauffele', 'Patrick Reed', 'Matthew McCarty', 'Max Homa', 'Sergio Garcia'] },
  { id: 'e17', name: 'Patrick Crimi 2', picks: ['Scottie Scheffler', 'Hideki Matsuyama', 'Robert MacIntyre', 'Jacob Bridgeman', 'Alexander Noren', 'Ryan Gerard'] },
];

export function useEntries() {
  const [entries, setEntries] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Always use hardcoded defaults for default IDs (so name/pick changes deploy instantly)
        const defaultIds = new Set(DEFAULT_ENTRIES.map(d => d.id));
        const adminAdded = parsed.filter(e => !defaultIds.has(e.id));
        return [...DEFAULT_ENTRIES, ...adminAdded];
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
