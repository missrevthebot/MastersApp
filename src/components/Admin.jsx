import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';

const ADMIN_PIN = '1234';

function GolferInput({ value, onChange, golferNames, placeholder }) {
  const [suggestions, setSuggestions] = useState([]);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  function handleChange(val) {
    onChange(val);
    if (val.length >= 2) {
      const lower = val.toLowerCase();
      const matches = golferNames
        .filter(n => n.toLowerCase().includes(lower))
        .slice(0, 6);
      setSuggestions(matches);
    } else {
      setSuggestions([]);
    }
  }

  function selectSuggestion(name) {
    onChange(name);
    setSuggestions([]);
    setFocused(false);
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
        placeholder={placeholder}
        className="w-full bg-bg-input border border-augusta/30 rounded px-3 py-2 text-sm
                   text-text-primary placeholder-text-secondary/50
                   focus:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/20
                   transition-colors"
      />
      {focused && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-bg-card border border-augusta/30 rounded shadow-xl max-h-40 overflow-y-auto">
          {suggestions.map(name => (
            <button
              key={name}
              onMouseDown={() => selectSuggestion(name)}
              className="w-full text-left px-3 py-1.5 text-sm text-text-primary hover:bg-augusta/20 transition-colors"
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EntryForm({ entry, golferNames, onSave, onCancel }) {
  const [name, setName] = useState(entry?.name || '');
  const [picks, setPicks] = useState(entry?.picks || ['', '', '', '', '', '']);

  function updatePick(index, value) {
    const next = [...picks];
    next[index] = value;
    setPicks(next);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    const filledPicks = picks.filter(p => p.trim());
    if (filledPicks.length < 6) return;
    onSave({ name: name.trim(), picks: picks.map(p => p.trim()) });
  }

  const tierLabels = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Tier 5', 'Tier 6'];

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs text-text-secondary mb-1 uppercase tracking-wider">Entry Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g., John Smith"
          className="w-full bg-bg-input border border-augusta/30 rounded px-3 py-2 text-sm
                     text-text-primary placeholder-text-secondary/50
                     focus:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/20"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {picks.map((pick, i) => (
          <div key={i}>
            <label className="block text-[10px] text-text-secondary mb-0.5 uppercase tracking-wider">
              {tierLabels[i]}
            </label>
            <GolferInput
              value={pick}
              onChange={val => updatePick(i, val)}
              golferNames={golferNames}
              placeholder={`${tierLabels[i]} pick...`}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-2">
        <button type="submit"
          className="flex-1 bg-augusta hover:bg-augusta-light text-white font-medium py-2 rounded transition-colors text-sm">
          {entry ? 'Update' : 'Add Entry'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 bg-transparent border border-augusta/30 text-text-secondary hover:text-text-primary rounded transition-colors text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

function FileUpload({ onImport }) {
  const fileRef = useRef(null);
  const [status, setStatus] = useState(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        const entries = [];
        for (const row of rows) {
          // Find the name column (first column or 'Name')
          const keys = Object.keys(row);
          const nameKey = keys.find(k => k.toLowerCase().includes('name')) || keys[0];
          const name = String(row[nameKey] || '').trim();
          if (!name) continue;

          // Find pick columns — look for 'Tier' columns or just take columns 2-7
          const pickKeys = keys.filter(k => k !== nameKey);
          const tierKeys = pickKeys.filter(k => k.toLowerCase().includes('tier') || k.toLowerCase().includes('pick'));
          const useKeys = tierKeys.length >= 6 ? tierKeys.slice(0, 6) : pickKeys.slice(0, 6);

          const picks = useKeys.map(k => String(row[k] || '').trim()).filter(Boolean);
          if (picks.length >= 6) {
            entries.push({ name, picks: picks.slice(0, 6) });
          }
        }

        if (entries.length > 0) {
          onImport(entries);
          setStatus(`Imported ${entries.length} entries`);
        } else {
          setStatus('No valid entries found. Need: Name + 6 pick columns.');
        }
      } catch (err) {
        setStatus(`Error: ${err.message}`);
      }
      // Reset file input
      if (fileRef.current) fileRef.current.value = '';
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <div className="border border-dashed border-augusta/30 rounded-lg p-4 text-center">
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFile}
        className="hidden"
        id="file-upload"
      />
      <label htmlFor="file-upload"
        className="cursor-pointer inline-flex items-center gap-2 bg-augusta/20 hover:bg-augusta/30
                   border border-augusta/40 rounded px-4 py-2 text-sm text-text-primary transition-colors">
        <span>📁</span> Upload .xlsx / .csv
      </label>
      <p className="text-[10px] text-text-secondary/60 mt-2">
        Format: Name | Tier 1 Pick | Tier 2 Pick | ... | Tier 6 Pick
      </p>
      {status && (
        <p className={`text-xs mt-2 ${status.includes('Error') || status.includes('No valid') ? 'text-mc-red' : 'text-green-400'}`}>
          {status}
        </p>
      )}
    </div>
  );
}

export default function Admin({ entries, golferNames, onAdd, onBulkImport, onUpdate, onDelete, onClose }) {
  const [authed, setAuthed] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  function checkPin(e) {
    e.preventDefault();
    if (pin === ADMIN_PIN) {
      setAuthed(true);
      setPinError(false);
    } else {
      setPinError(true);
      setPin('');
    }
  }

  if (!authed) {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
        <div className="bg-bg-card border border-augusta/30 rounded-xl p-6 w-full max-w-xs shadow-2xl">
          <h2 className="font-[Playfair_Display] text-lg text-gold text-center mb-4">Admin Access</h2>
          <form onSubmit={checkPin} className="space-y-3">
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={e => setPin(e.target.value)}
              placeholder="Enter PIN"
              autoFocus
              className="w-full bg-bg-input border border-augusta/30 rounded px-3 py-3 text-center text-lg
                         text-text-primary tracking-[0.5em] placeholder-text-secondary/50
                         focus:border-gold/50 focus:outline-none"
            />
            {pinError && <p className="text-mc-red text-xs text-center">Wrong PIN</p>}
            <div className="flex gap-2">
              <button type="submit"
                className="flex-1 bg-augusta hover:bg-augusta-light text-white font-medium py-2 rounded text-sm transition-colors">
                Enter
              </button>
              <button type="button" onClick={onClose}
                className="px-4 border border-augusta/30 text-text-secondary rounded text-sm hover:text-text-primary transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-bg border-t sm:border border-augusta/30 sm:rounded-xl w-full sm:max-w-lg
                      max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-bg border-b border-augusta/20 px-4 py-3 flex items-center justify-between z-10">
          <h2 className="font-[Playfair_Display] text-gold font-semibold">Admin Panel</h2>
          <div className="flex items-center gap-2">
            {!showForm && !editingId && (
              <button onClick={() => { setShowForm(true); setEditingId(null); }}
                className="bg-augusta hover:bg-augusta-light text-white text-xs font-medium px-3 py-1.5 rounded transition-colors">
                + Add Entry
              </button>
            )}
            <button onClick={onClose}
              className="text-text-secondary hover:text-text-primary text-xl leading-none transition-colors">
              ×
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {/* File upload */}
          <FileUpload onImport={onBulkImport} />

          {/* Add/Edit Form */}
          {(showForm || editingId) && (
            <div className="border border-augusta/20 rounded-lg p-3 bg-bg-card">
              <EntryForm
                entry={editingId ? entries.find(e => e.id === editingId) : null}
                golferNames={golferNames}
                onSave={data => {
                  if (editingId) {
                    onUpdate(editingId, data);
                    setEditingId(null);
                  } else {
                    onAdd(data);
                    setShowForm(false);
                  }
                }}
                onCancel={() => { setShowForm(false); setEditingId(null); }}
              />
            </div>
          )}

          {/* Entry count */}
          {entries.length > 0 && (
            <div className="text-xs text-text-secondary flex items-center justify-between">
              <span>{entries.length} entries</span>
            </div>
          )}

          {/* Entry list */}
          {entries.length === 0 && !showForm && (
            <p className="text-center text-text-secondary py-4 text-sm">
              Upload a spreadsheet or add entries manually.
            </p>
          )}

          {entries.map(entry => (
            <div key={entry.id} className="border border-augusta/20 rounded-lg p-3 bg-bg-card">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm text-text-primary">{entry.name}</div>
                  <div className="text-[10px] text-text-secondary mt-1 space-y-0.5">
                    {entry.picks.map((p, i) => (
                      <div key={i} className="truncate">
                        <span className="text-text-secondary/50">T{i + 1}:</span> {p}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1 ml-2 flex-shrink-0">
                  <button onClick={() => { setEditingId(entry.id); setShowForm(false); }}
                    className="text-xs px-2 py-1 border border-augusta/30 rounded text-text-secondary
                               hover:text-gold hover:border-gold/30 transition-colors">
                    Edit
                  </button>
                  {confirmDelete === entry.id ? (
                    <button onClick={() => { onDelete(entry.id); setConfirmDelete(null); }}
                      className="text-xs px-2 py-1 bg-mc-red/20 border border-mc-red/40 rounded text-mc-red
                                 hover:bg-mc-red/30 transition-colors">
                      Confirm
                    </button>
                  ) : (
                    <button onClick={() => setConfirmDelete(entry.id)}
                      className="text-xs px-2 py-1 border border-augusta/30 rounded text-text-secondary
                                 hover:text-mc-red hover:border-mc-red/30 transition-colors">
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
