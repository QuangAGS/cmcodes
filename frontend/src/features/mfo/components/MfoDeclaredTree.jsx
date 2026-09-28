/**
 * PATH       : frontend/src/features/mfo/components/MfoDeclaredTree.jsx
 * DATETIME   : 2026-09-26T23:30:00+07:00
 * VERSION    : 1.0.0-ONE-TREE
 * DESCRIPTION: Cây RF/SF — chỉ đời đã đăng ký. Hộ chồng|vợ. Cùng mắt khung.
 */

import FamilyCoupleNode from '../../genealogy/components/FamilyCoupleNode.jsx';
import TreeZoomPane from '../../genealogy/components/TreeZoomPane.jsx';
import { FanConnector, LaneShell, LANE_TONE } from '../../genealogy/components/FiveLineLanes.jsx';

function asCouple(self, spouse) {
  const a = {
    full_name: self?.full_name || self?.name || '',
    gender: self?.gender || '',
    is_clan: self?.is_clan !== false,
    avatar_url: self?.avatar_url || '',
  };
  const b = {
    full_name: spouse?.full_name || spouse?.name || '',
    gender: spouse?.gender || '',
    is_clan: false,
    avatar_url: spouse?.avatar_url || '',
  };
  const mateName = String(b.full_name || '').trim();
  b.create = !mateName;
  return { husband: a, wife: b };
}

export default function MfoDeclaredTree({
  lines = [],
  names = {},
  genders = {},
  k,
  founderId,
  selectedId,
  onSelect,
}) {
  const shown = [0, 1, 2, 3, 4]
    .map((i) => lines.find((r) => Number(r.line) === i) || { line: i, op: 'EMPTY' })
    .filter((row) => {
      const op = String(row.op || '').toUpperCase();
      if (op === 'ASSIGN' || op === 'CREATE' || row.member_id) return true;
      if ((row.siblings || []).length) return true;
      if ((row.people || []).length) return true;
      return false;
    });

  if (!shown.length) return null;

  return (
    <TreeZoomPane>
      <div className="flex flex-col items-center gap-0">
        {shown.map((row, idx) => {
          const prev = shown[idx - 1];
          const households = [];
          const main = {
            id: row.member_id,
            full_name: names[row.member_id] || row.hint || row.name || '',
            gender: genders[row.member_id] || row.gender || '',
            is_clan: true,
          };
          if (main.id || main.full_name) {
            households.push({
              self: main,
              spouse: {
                id: row.spouse_id,
                full_name: names[row.spouse_id] || row.spouse_hint || '',
                gender: genders[row.spouse_id] || row.spouse_gender || '',
              },
            });
          }
          (row.siblings || []).forEach((s) => {
            households.push({
              self: {
                id: s.member_id,
                full_name: names[s.member_id] || s.hint || '',
                gender: genders[s.member_id] || s.gender || '',
                is_clan: true,
              },
              spouse: {
                id: s.spouse_id,
                full_name: names[s.spouse_id] || s.spouse_hint || '',
                gender: genders[s.spouse_id] || '',
              },
            });
          });
          (row.people || []).forEach((p) => {
            if (households.some((h) => h.self.id && h.self.id === p.id)) return;
            households.push({
              self: {
                id: p.id,
                full_name: p.name || names[p.id] || '',
                gender: genders[p.id] || '',
                is_clan: p.role !== 'tao',
              },
              spouse: {
                id: p.spouse_id,
                full_name: names[p.spouse_id] || '',
              },
            });
          });
          const tone = LANE_TONE[prev ? prev.line : 0] || LANE_TONE[0];
          return (
            <div key={row.line} className="flex w-full flex-col items-center">
              {idx > 0 ? <FanConnector count={households.length || 1} color={tone.stroke} /> : null}
              <LaneShell line={row.line} k={k} showYou={Number(k) === row.line}>
                <div className="flex flex-wrap justify-center gap-2 p-2">
                  {households.map((h) => {
                    const pair = asCouple(h.self, h.spouse);
                    const sid = h.self.id;
                    return (
                      <FamilyCoupleNode
                        key={sid || h.self.full_name}
                        husband={pair.husband}
                        wife={pair.wife}
                        selected={selectedId && sid && String(selectedId) === String(sid)}
                        onSelect={() => onSelect && sid && onSelect(sid, row.line)}
                        title={
                          founderId && sid && String(sid) === String(founderId)
                            ? 'Người khai'
                            : row.line === 0
                              ? 'Đời gốc'
                              : `Đời ${row.line}`
                        }
                        summary={[h.self.full_name, h.spouse.full_name].filter(Boolean)}
                        actions={[]}
                      />
                    );
                  })}
                </div>
              </LaneShell>
            </div>
          );
        })}
      </div>
    </TreeZoomPane>
  );
}
