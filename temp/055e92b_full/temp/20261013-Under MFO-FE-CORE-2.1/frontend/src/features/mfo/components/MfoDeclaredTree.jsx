export default function MfoDeclaredTree({ lines = [], names = {}, selectedId, onSelect }) {
  const rows = Array.isArray(lines) ? lines : [];
  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const id = row.member_id || row.id || '';
        const label = names[id] || row.hint || row.full_name || `Đời ${row.line}`;
        const active = id && String(selectedId) === String(id);
        return (
          <button
            key={`${row.line}-${id || 'empty'}`}
            type="button"
            className={`min-h-11 w-full rounded-2xl border px-4 text-left text-sm font-bold ${
              active ? 'border-indigo-600 bg-indigo-50 text-indigo-900' : 'border-slate-200 bg-white text-slate-800'
            }`}
            onClick={() => id && onSelect && onSelect(id)}
          >
            Đời {row.line}: {label}
          </button>
        );
      })}
    </div>
  );
}
