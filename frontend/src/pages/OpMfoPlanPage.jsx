/**
 * PATH       : frontend/src/pages/OpMfoPlanPage.jsx
 * DATETIME   : 2026-09-24T10:50:00+07:00
 * VERSION    : 1.2.0-W0
 * DESCRIPTION: Wizard PLAN SELF. W0: sanitizeLines + về ticket, không /op.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import AudioHelpButton from '../features/elder-doctrine/components/AudioHelpButton.jsx';
import ZoneVoiceButton from '../features/elder-doctrine/components/ZoneVoiceButton.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';
import {
  MFO_VOICE_SELF,
  MFO_OP_LABEL,
  voiceForLineSelf,
} from '../features/mfo/constants/mfoVoiceHelp.self.js';
import { toMfoUserMessage } from '../features/mfo/constants/mfoUserErrors.js';
import { createPlan, getMember, getOriginTree } from '../features/mfo/api/mfoApi.js';
import { sanitizeLines, ticketIdFromCreate } from '../features/mfo/lib/sanitizeLines.js';
import { memberAvatarUrl } from '../features/mfo/lib/memberAvatarUrl.js';
import { relationError } from '../features/mfo/lib/lotRelationGuard.js';
import FamilyCoupleNode from '../features/genealogy/components/FamilyCoupleNode.jsx';
import { FanConnector, LaneShell, LANE_TONE } from '../features/genealogy/components/FiveLineLanes.jsx';
import TreeZoomPane from '../features/genealogy/components/TreeZoomPane.jsx';
import {
  getLotDraft,
  saveLotDraft,
  deleteLotDraft,
  newDraftId,
  getActiveDraftId,
  setActiveDraftId,
  clearPickCache,
} from '../features/mfo/lib/mfoDraftStore.js';
import { useTts } from '../shared/hooks/useTts.js';

const STEPS = ['origin', 'k', 'lines', 'review'];
const OPS = ['ASSIGN', 'CREATE', 'EMPTY'];


const BOOK_CACHE_KEY = 'mfo.memberBook';

function readBookCache() {
  try {
    const raw = sessionStorage.getItem(BOOK_CACHE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return Array.isArray(d.items) ? d.items : null;
  } catch {
    return null;
  }
}

function writeBookCache(items) {
  try {
    sessionStorage.setItem(BOOK_CACHE_KEY, JSON.stringify({ at: Date.now(), items }));
  } catch { /* ignore */ }
}

function unwrapMembers(res) {
  const d = res?.data?.data ?? res?.data ?? {};
  if (Array.isArray(d)) return d;
  if (Array.isArray(d.items)) return d.items;
  if (Array.isArray(d.members)) return d.members;
  return [];
}

function memberLabel(m) {
  return String(m?.full_name || m?.name || '').trim();
}

function foldName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

function genderVi(g) {
  const x = String(g || '').toUpperCase();
  if (x === 'NAM' || x === 'MALE') return 'Nam';
  if (x === 'NU' || x === 'NỮ' || x === 'FEMALE') return 'Nữ';
  if (x === 'KHAC' || x === 'OTHER') return 'Khác';
  return x ? 'Khác' : '';
}

function yearVi(m) {
  const y = m?.birth_year;
  return y ? `sinh năm ${y}` : 'chưa rõ năm sinh';
}

function parentName(book, id) {
  if (!id) return '';
  const p = book.find((x) => x.id === id);
  return memberLabel(p);
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function aliveVi(m) {
  return m?.is_alive === false ? 'Đã mất' : 'Còn sống';
}

function speakMember(m, book) {
  const cap = pickCaption(m, book);
  const parts = [
    cap.name,
    genderVi(m.gender) ? `Giới tính ${genderVi(m.gender)}` : '',
    `Năm sinh ${cap.year}`,
    cap.alive,
  ];
  const fa = parentName(book, m.father_id);
  const mo = parentName(book, m.mother_id);
  if (fa) parts.push(`Con ông ${fa}`);
  if (mo) parts.push(`Bà ${mo}`);
  if (cap.note) parts.push(`Ghi chú: ${cap.note}`);
  return parts.filter(Boolean).join('. ') + '.';
}

function pickCaption(m, book) {
  const name = memberLabel(m);
  const g = genderVi(m.gender);
  const y = m?.birth_year ? String(m.birth_year) : 'chưa rõ năm';
  const note = String(m?.note || '').trim();
  const fa = parentName(book, m.father_id);
  const mo = parentName(book, m.mother_id);
  const bits = [g, y, aliveVi(m)].filter(Boolean);
  if (fa) bits.push(`con ông ${fa}`);
  if (mo) bits.push(`bà ${mo}`);
  if (note) bits.push(note);
  return { name, year: y, alive: aliveVi(m), note, sub: bits.join(' · ') };
}

function memberAvatar(m) {
  if (!m || typeof m !== 'object') return '';
  return String(
    m.avatar_url || m.photo_url || m.image_url || m.portrait_url || m.avatar || ''
  ).trim();
}

function asCouple(selfName, selfGender, selfClan, spouseName, spouseGender, selfAvatar, spouseAvatar) {
  const self = {
    full_name: selfName || '',
    gender: selfGender || '',
    is_clan: selfClan !== false,
    avatar_url: selfAvatar || '',
  };
  let sg = spouseGender || '';
  if (!sg && selfGender) {
    const g = String(selfGender).toUpperCase();
    sg = g === 'NAM' ? 'NU' : g === 'NU' ? 'NAM' : '';
  }
  const spouse = {
    full_name: spouseName || '',
    gender: sg,
    is_clan: false,
    avatar_url: spouseAvatar || '',
  };
  if (self.is_clan !== false) return { left: self, right: spouse };
  return { left: spouse, right: self };
}

function emptyLines(originId) {
  return [
    { line: 0, op: 'ASSIGN', member_id: originId || '', hint: 'Origin', siblings: [] },
    { line: 1, op: 'EMPTY', member_id: '', hint: '', siblings: [] },
    { line: 2, op: 'EMPTY', member_id: '', hint: '', siblings: [] },
    { line: 3, op: 'EMPTY', member_id: '', hint: '', siblings: [] },
    { line: 4, op: 'EMPTY', member_id: '', hint: '', siblings: [] },
  ];
}

export default function OpMfoPlanPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { speak, speakError } = useTts();
  const tenant = resolveTenant(user);
  const footerNav = resolveFooterNav(user, {
    pageKey: 'op-mfo-plan',
    backTo: '/op',
    showBack: true,
  });

  const myMemberId = user?.member_id || user?.memberId || '';
  const [step, setStep] = useState(0);
  const [originId, setOriginId] = useState('');
  const [originName, setOriginName] = useState('');
  const [k, setK] = useState('');
  const [lines, setLines] = useState(() => emptyLines(''));
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState([]);
  const [picked, setPicked] = useState(false);
  const [book, setBook] = useState([]);
  const [previewId, setPreviewId] = useState('');
  const [selectedLine, setSelectedLine] = useState(null);
  const [selectedSib, setSelectedSib] = useState(-1);
  const [draftId, setDraftId] = useState(() => searchParams.get('draft') || newDraftId());
  const [openGens, setOpenGens] = useState(() => new Set([0]));

  function unwrapOne(res) {
    const d = res?.data?.data ?? res?.data ?? {};
    return d.member || d;
  }

  async function snapMember(id) {
    if (!id) return {};
    try {
      const m = unwrapOne(await getMember(id));
      return {
        gender: m.gender || '',
        is_clan: m.is_clan !== false,
        birth_year: m.birth_year || '',
        is_alive: m.is_alive,
        note: m.note || '',
        avatar_url: memberAvatar(m) || (await memberAvatarUrl(id)),
      };
    } catch {
      return {};
    }
  }

  function treeBag(res) {
    let d = res;
    if (d && d.data) d = d.data;
    if (d && d.data && (d.data.nodes || d.data.origin)) d = d.data;
    return d && typeof d === 'object' ? d : {};
  }

  async function spouseOf(memberId) {
    if (!memberId) return { spouse_id: '', spouse_hint: '' };
    try {
      const bag = treeBag(await getOriginTree(memberId));
      const nodes = Array.isArray(bag.nodes) ? bag.nodes : [];
      const self =
        nodes.find((n) => n && n.id === memberId) ||
        nodes.find((n) => n && n.is_origin) ||
        nodes[0];
      const list = Array.isArray(self?.partners)
        ? self.partners
        : Array.isArray(self?.spouses)
          ? self.spouses
          : [];
      const p = list.find((x) => x && (x.full_name || x.name || x.id)) || null;
      if (!p) return { spouse_id: '', spouse_hint: '', spouse_avatar: '' };
      return {
        spouse_id: p.id || '',
        spouse_hint: String(p.full_name || p.name || p.spouse_name_literal || '').trim(),
        spouse_gender: p.gender || '',
        spouse_avatar: memberAvatar(p) || (p.id ? await memberAvatarUrl(p.id) : ''),
      };
    } catch {
      return { spouse_id: '', spouse_hint: '' };
    }
  }

  async function guardPick({ candidateId, line, role }) {
    try {
      const cand = unwrapOne(await getMember(candidateId));
      let parent = null;
      if ((role === 'child' || role === 'sibling') && line > 0) {
        const pid = lines[line - 1]?.member_id || originId;
        if (pid) parent = unwrapOne(await getMember(pid));
      } else if (role === 'child' && originId) {
        parent = unwrapOne(await getMember(originId));
      }
      const origin = originId ? { id: originId } : null;
      return relationError({ candidate: cand, parent, origin, role });
    } catch {
      return '';
    }
  }

  const stepKey = STEPS[step];
  const help = useMemo(() => {
    if (stepKey !== 'review') return MFO_VOICE_SELF.whyFive;
    return MFO_VOICE_SELF.review;
  }, [stepKey]);

  useEffect(() => {
    try {
      const fromId = searchParams.get('from');
      if (fromId) {
        (async () => {
          try {
            const res = await getPlan(fromId);
            const d = res?.data?.data ?? res?.data ?? {};
            const ticket = d.ticket || d;
            let p = ticket.payload || {};
            if (typeof p === 'string') {
              try {
                p = JSON.parse(p);
              } catch {
                p = {};
              }
            }
            const rows = Array.isArray(p.lines) ? p.lines : [];
            if (rows.length) {
              setLines((prev) =>
                emptyLines('').map((base, i) => {
                  const hit = rows.find((r) => Number(r.line) === i) || {};
                  return { ...base, ...hit, line: i };
                })
              );
            }
            if (p.k !== undefined) setK(p.k);
            if (p.note) setNote(p.note);
            const oid = p.origin_member_id || ticket.target_id || rows.find((r) => Number(r.line) === 0)?.member_id;
            if (oid) {
              setOriginId(oid);
              setPicked(true);
              try {
                const m = await getMember(oid);
                const mm = m?.data?.data?.member || m?.data?.data || {};
                if (mm.full_name) setOriginName(mm.full_name);
              } catch {
                /* skip */
              }
            }
          } catch {
            /* ignore */
          }
        })();
        return;
      }
      const q = searchParams.get('draft');
      if (q) {
        const d = getLotDraft(q, user?.id || user?.userId);
        if (!d) return;
        if (d.originName) setOriginName(d.originName);
        if (d.originId) setOriginId(d.originId);
        if (d.picked) setPicked(true);
        if (d.k !== undefined && d.k !== '') setK(d.k);
        if (d.note) setNote(d.note);
        if (Number.isInteger(d.step)) setStep(d.step);
        if (Array.isArray(d.lines) && d.lines.length === 5) setLines(d.lines);
        setActiveDraftId(q);
        return;
      }
      if (!location.state?.originPick && !location.state?.linePick && !location.state?.siblingPick) {
        clearPickCache();
        setOriginId('');
        setOriginName('');
        setPicked(false);
        setK('');
        setLines(emptyLines(''));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!draftId || !originId) return;
    saveLotDraft({
      id: draftId,
      owner_user_id: user?.id || user?.userId || null,
      originId,
      originName,
      picked,
      k,
      note,
      step,
      lines,
    });
  }, [draftId, originId, originName, picked, k, note, step, lines, user]);


  useEffect(() => {
    const fromState = location.state?.originPick;
    let fromStore = null;
    try {
      fromStore = JSON.parse(sessionStorage.getItem('mfo.originPick') || 'null');
    } catch {
      fromStore = null;
    }
    const pick = fromState || fromStore;
    if (pick?.id && pick?.name) {
      setOriginId(pick.id);
      setOriginName(pick.name);
      setPicked(true);
      setPreviewId('');
      (async () => {
        const snap = await snapMember(pick.id);
        const sp = await spouseOf(pick.id);
        const fresh = emptyLines(pick.id);
        fresh[0] = {
          line: 0,
          op: 'ASSIGN',
          member_id: pick.id,
          hint: pick.name,
          siblings: [],
          ...snap,
          ...sp,
        };
        setLines(fresh);
      })();
      setSelectedLine(0);
      setOpenGens(new Set([0]));
      clearPickCache();
    }
  }, [location.state]);

  useEffect(() => {
    let linePick = location.state?.linePick;
    if (!linePick) {
      try { linePick = JSON.parse(sessionStorage.getItem('mfo.linePick') || 'null'); }
      catch { linePick = null; }
    }
    if (linePick && Number.isInteger(linePick.line) && linePick.id) {
      (async () => {
        const blocked = await guardPick({
          candidateId: linePick.id,
          line: linePick.line,
          role: linePick.line === 0 ? 'origin' : 'child',
        });
        if (blocked) {
          setErr(blocked);
          return;
        }
        const snap = await snapMember(linePick.id);
        const sp = await spouseOf(linePick.id);
        setLine(linePick.line, {
          op: 'ASSIGN',
          member_id: linePick.id,
          hint: linePick.name || '',
          spouse_id: '',
          spouse_hint: '',
          siblings: lines[linePick.line]?.siblings || [],
          ...snap,
          ...sp,
        });
        if (linePick.line === 0) {
          setOriginId(linePick.id);
          setOriginName(linePick.name || '');
        }
      })();
      try { sessionStorage.removeItem('mfo.linePick'); } catch { /* ignore */ }
    }
    let sibPick = location.state?.siblingPick;
    if (!sibPick) {
      try {
        sibPick = JSON.parse(sessionStorage.getItem('mfo.siblingPick') || 'null');
      } catch {
        sibPick = null;
      }
    }
    if (sibPick && Number.isInteger(sibPick.line) && Number.isInteger(sibPick.index)) {
      (async () => {
        const blocked = await guardPick({
          candidateId: sibPick.id,
          line: sibPick.line,
          role: 'sibling',
        });
        if (blocked) {
          setErr(blocked);
          return;
        }
        const snap = await snapMember(sibPick.id);
        const sp = await spouseOf(sibPick.id);
        setLines((prev) =>
          prev.map((row) => {
            if (row.line !== sibPick.line) return row;
            const siblings = [...(row.siblings || [])];
            siblings[sibPick.index] = {
              op: 'ASSIGN',
              member_id: sibPick.id,
              hint: sibPick.name || '',
              spouse_id: '',
              spouse_hint: '',
              ...snap,
              ...sp,
            };
            return { ...row, siblings };
          })
        );
      })();
      try {
        sessionStorage.removeItem('mfo.siblingPick');
        sessionStorage.removeItem('mfo.pickRole');
      } catch {
        /* ignore */
      }
    }
  }, [location.state]);

  useEffect(() => {
    let spousePick = location.state?.spousePick;
    if (!spousePick) {
      try {
        spousePick = JSON.parse(sessionStorage.getItem('mfo.spousePick') || 'null');
      } catch {
        spousePick = null;
      }
    }
    if (spousePick && Number.isInteger(spousePick.line) && spousePick.id) {
      setLine(spousePick.line, {
        spouse_id: spousePick.id,
        spouse_hint: spousePick.name || '',
      });
      try {
        sessionStorage.removeItem('mfo.spousePick');
        sessionStorage.removeItem('mfo.pickRole');
      } catch {
        /* ignore */
      }
    }
  }, [location.state]);

  useEffect(() => {
    const need = [];
    lines.forEach((row) => {
      if (row.op === 'ASSIGN' && row.member_id && !row.spouse_hint) {
        need.push({ line: row.line, id: row.member_id, sib: -1 });
      }
      (row.siblings || []).forEach((s, si) => {
        if (s.member_id && !s.spouse_hint) {
          need.push({ line: row.line, id: s.member_id, sib: si });
        }
      });
    });
    if (!need.length) return undefined;
    let cancelled = false;
    (async () => {
      for (const item of need) {
        const sp = await spouseOf(item.id);
        if (cancelled || !sp.spouse_hint) continue;
        if (item.sib < 0) setLine(item.line, sp);
        else {
          setLines((prev) =>
            prev.map((row) => {
              if (row.line !== item.line) return row;
              const siblings = [...(row.siblings || [])];
              siblings[item.sib] = { ...siblings[item.sib], ...sp };
              return { ...row, siblings };
            })
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lines.map((r) => `${r.member_id}:${r.spouse_hint}:${(r.siblings || []).map((s) => s.member_id + s.spouse_hint).join(',')}`).join('|')]);

  useEffect(() => {
    const need = [];
    lines.forEach((row) => {
      if (row.member_id && !row.avatar_url) need.push({ line: row.line, id: row.member_id, sib: -1, kind: 'self' });
      if (row.spouse_id && !row.spouse_avatar) need.push({ line: row.line, id: row.spouse_id, sib: -1, kind: 'spouse' });
      (row.siblings || []).forEach((s, si) => {
        if (s.member_id && !s.avatar_url) need.push({ line: row.line, id: s.member_id, sib: si, kind: 'self' });
        if (s.spouse_id && !s.spouse_avatar) need.push({ line: row.line, id: s.spouse_id, sib: si, kind: 'spouse' });
      });
    });
    if (!need.length) return undefined;
    let cancelled = false;
    (async () => {
      for (const item of need) {
        const url = await memberAvatarUrl(item.id);
        if (cancelled || !url) continue;
        const patch = item.kind === 'spouse' ? { spouse_avatar: url } : { avatar_url: url };
        if (item.sib < 0) setLine(item.line, patch);
        else {
          setLines((prev) =>
            prev.map((row) => {
              if (row.line !== item.line) return row;
              const siblings = [...(row.siblings || [])];
              siblings[item.sib] = { ...siblings[item.sib], ...patch };
              return { ...row, siblings };
            })
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lines.map((r) => `${r.member_id}:${r.avatar_url}:${r.spouse_id}:${r.spouse_avatar}`).join('|')]);

  function setLine(i, patch) {
    setLines((prev) => {
      const next = prev.map((row, idx) => (idx === i ? { ...row, ...patch } : { ...row }));
      if (i === 0) {
        next[0].op = 'ASSIGN';
        next[0].member_id = originId;
      }
      const firstEmpty = next.findIndex((row, idx) => idx > 0 && row.op === 'EMPTY' && !row.need_um);
      if (firstEmpty >= 0) {
        for (let j = firstEmpty + 1; j <= 4; j += 1) {
          next[j].op = 'EMPTY';
          next[j].member_id = '';
        }
      }
      const kk = Number(k);
      if (Number.isInteger(kk) && kk >= 0 && kk <= 4 && myMemberId) {
        next[kk].op = 'ASSIGN';
        next[kk].member_id = myMemberId;
      }
      return next;
    });
  }

  function validateStep() {
    if (!originId) return 'MFO_ORIGIN_REQUIRED';
    const n = Number(k);
    if (!Number.isInteger(n) || n < 0) return 'MFO_K_REQUIRED';
    if (n > 4) return 'MFO_K_TOO_FAR';
    return '';
  }

  function goNext() {
    const code = validateStep();
    if (code) {
      const msg = toMfoUserMessage({ code });
      setErr(msg);
      return;
    }
    setErr('');
    setLines((prev) => {
      const next = prev.map((row) => ({ ...row }));
      next[0] = { ...next[0], op: 'ASSIGN', member_id: originId, hint: originName };
      const kk = Number(k);
      if (Number.isInteger(kk) && kk >= 0 && kk <= 4 && myMemberId) {
        next[kk] = { ...next[kk], op: 'ASSIGN', member_id: kk === 0 ? originId : myMemberId };
      }
      return next;
    });
    setStep(3);
  }

  function planPath() {
    return `/op/mfo/plans/new?draft=${encodeURIComponent(draftId)}`;
  }

  function persistNow() {
    if (!draftId) return;
    saveLotDraft({
      id: draftId,
      owner_user_id: user?.id || user?.userId || null,
      originId,
      originName,
      picked,
      k,
      note,
      step,
      lines,
    });
  }

  function openGfl() {
    try {
      sessionStorage.setItem(
        'mfo.planDraft',
        JSON.stringify({ originName, originId, picked: true, k, note, step: 0, lines, selectedLine: 0 })
      );
    } catch { /* ignore */ }
    persistNow();
    navigate(
      '/op/tree/pick-origin?returnTo=' + encodeURIComponent(planPath())
    );
  }

  function openSearch(line) {
    try {
      sessionStorage.setItem(
        'mfo.planDraft',
        JSON.stringify({
          originName,
          originId,
          picked: true,
          k,
          note,
          step: 0,
          lines,
          selectedLine: line,
        })
      );
      if (line === 0) sessionStorage.removeItem('mfo.assignLine');
      else sessionStorage.setItem('mfo.assignLine', String(line));
    } catch {
      /* ignore */
    }
    const preset = line === 0 ? 'origin' : 'assign';
    try {
      sessionStorage.setItem('mfo.pickRole', 'person');
    } catch {
      /* ignore */
    }
    persistNow();
    navigate(
      `/op/members/search?preset=${preset}&returnTo=${encodeURIComponent(planPath())}`
    );
  }

  function openSpouseSearch(line) {
    try {
      sessionStorage.setItem(
        'mfo.planDraft',
        JSON.stringify({
          originName,
          originId,
          picked: true,
          k,
          note,
          step: 0,
          lines,
          selectedLine: line,
        })
      );
      sessionStorage.setItem('mfo.assignLine', String(line));
      sessionStorage.setItem('mfo.pickRole', 'spouse');
    } catch {
      /* ignore */
    }
    persistNow();
    navigate(
      '/op/members/search?preset=assign&returnTo=' + encodeURIComponent(planPath())
    );
  }

  function openSiblingSearch(line, index) {
    try {
      sessionStorage.setItem(
        'mfo.planDraft',
        JSON.stringify({
          originName,
          originId,
          picked: true,
          k,
          note,
          step: 0,
          lines,
          selectedLine: line,
        })
      );
      sessionStorage.setItem('mfo.assignLine', String(line));
      sessionStorage.setItem('mfo.siblingIndex', String(index));
      sessionStorage.setItem('mfo.pickRole', 'sibling');
    } catch {
      /* ignore */
    }
    persistNow();
    navigate(
      '/op/members/search?preset=assign&returnTo=' + encodeURIComponent(planPath())
    );
  }

  function addSibling(line) {
    setLines((prev) =>
      prev.map((row) => {
        if (row.line !== line) return row;
        const siblings = [...(row.siblings || []), { op: 'CREATE', member_id: '', hint: 'Xin tạo' }];
        return { ...row, siblings };
      })
    );
    setSelectedLine(line);
    setSelectedSib((lines[line]?.siblings || []).length);
  }

  function nodeSummary(row, sib) {
    const name = sib
      ? sib.hint || ''
      : row.line === 0
        ? originName
        : row.hint || '';
    const spouse = sib ? sib.spouse_hint : row.spouse_hint;
    const year = sib ? sib.birth_year : row.birth_year;
    const alive = sib ? sib.is_alive : row.is_alive;
    const note = sib ? sib.note : row.note;
    const linesOut = [];
    linesOut.push(name ? `Người: ${name}` : 'Chưa gắn người');
    if (spouse) linesOut.push(`Vợ/chồng: ${spouse}`);
    if (year) linesOut.push(`Năm sinh: ${year}`);
    if (alive === false) linesOut.push('Đã mất');
    else if (alive === true) linesOut.push('Còn sống');
    if (note) linesOut.push(`Ghi chú: ${note}`);
    if (Number(k) === row.line && !sib) linesOut.push('Đây là bạn trên tờ này');
    return linesOut;
  }

  function nodeActions(row, sibIdx) {
    const acts = [];
    acts.push({
      label: 'Chính là tôi',
      onClick: () => {
        setK(row.line);
        if (row.line === 0 && originId) {
          setLine(0, { op: 'ASSIGN', member_id: originId, hint: originName });
        } else if (myMemberId && sibIdx < 0) {
          setLine(row.line, { op: 'ASSIGN', member_id: myMemberId });
        }
        setSelectedLine(null);
      },
    });
    if (row.line === 0 && sibIdx < 0) {
      acts.push({ label: 'Chọn trên cây họ', onClick: openGfl });
    }
    acts.push({
      label: 'Chọn lại / tìm sổ',
      onClick: () => {
        if (sibIdx >= 0) openSiblingSearch(row.line, sibIdx);
        else if (row.line === 0) openSearch(0);
        else openSearch(row.line);
      },
    });
    acts.push({
      label: 'Chọn vợ/chồng',
      onClick: () => openSpouseSearch(row.line),
    });
    if (row.line < 4 && sibIdx < 0) {
      acts.push({
        label: 'Thêm con',
        onClick: () => {
          setLine(row.line + 1, {
            op: 'CREATE',
            member_id: '',
            hint: 'Xin tạo',
            parentSib: sibIdx,
          });
          setSelectedLine(row.line + 1);
          setSelectedSib(-1);
        },
      });
    }
    acts.push({
      label: 'Thêm anh chị em',
      onClick: () => addSibling(row.line),
    });
    acts.push({
      label: 'Chưa biết',
      onClick: () => {
        if (sibIdx < 0) {
          setLine(row.line, { op: 'CREATE', member_id: '', hint: 'Chưa biết', need_um: true });
        }
        setErr('Chưa biết: Ban quản trị tạo khi duyệt.');
        setSelectedLine(null);
      },
    });
    const mid = sibIdx >= 0 ? row.siblings?.[sibIdx]?.member_id : row.member_id;
    if (mid) {
      acts.push({
        label: 'Xem chi tiết',
        onClick: () =>
          navigate(`/op/mfo/members/${mid}?returnTo=${encodeURIComponent(planPath())}`),
      });
    }
    acts.push({
      label: 'Xóa nhà này',
      onClick: () => {
        if (sibIdx >= 0) {
          setLines((prev) =>
            prev.map((r) =>
              r.line !== row.line
                ? r
                : { ...r, siblings: (r.siblings || []).filter((_, i) => i !== sibIdx) }
            )
          );
        } else if (row.line === 0) {
          setOriginId('');
          setOriginName('');
          setLines(emptyLines(''));
          setK('');
        } else {
          setLine(row.line, {
            op: 'EMPTY',
            member_id: '',
            hint: '',
            spouse_id: '',
            spouse_hint: '',
            siblings: [],
          });
        }
        setSelectedLine(null);
      },
    });
    return acts;
  }

  async function submit() {
    const n = Number(k);
    if (!originId) {
      setErr(toMfoUserMessage({ code: 'MFO_ORIGIN_REQUIRED' }));
      return;
    }
    if (!Number.isInteger(n) || n < 0 || n > 4) {
      setErr(toMfoUserMessage({ code: n > 4 ? 'MFO_K_TOO_FAR' : 'MFO_K_REQUIRED' }));
      return;
    }
    const hasWidth = lines.some((row) => (row.siblings || []).length);
    const hasDepthChild = lines.some((row) => row.line > 0 && (row.op === 'ASSIGN' || row.op === 'CREATE'));
    const reuse = [originId];
    lines.forEach((row) => {
      if (row.member_id) reuse.push(row.member_id);
      (row.siblings || []).forEach((s) => {
        if (s.member_id) reuse.push(s.member_id);
      });
    });
    const sibNote = lines
      .flatMap((row) =>
        (row.siblings || []).map(
          (s) => `Anh/em đời ${row.line}: ${s.hint || s.member_id || 'xin tạo'}`
        )
      )
      .join('\n');
    setBusy(true);
    setErr('');
    try {
      const cleanLines = sanitizeLines(lines, {
        originId,
        k: n,
        founderId: myMemberId,
      });
      const payload = {
        origin_member_id: originId,
        k: n,
        note: [note, sibNote].filter(Boolean).join('\n'),
        mode: hasWidth && !hasDepthChild ? 'WIDTH' : 'DEPTH',
        fill: 'SELF',
        anchor_member_id: hasWidth
          ? lines.find((row) => (row.siblings || []).length)?.member_id || originId
          : undefined,
        reuse_member_ids: reuse,
        lines: cleanLines,
      };
      const res = await createPlan(payload);
      const ticketId = ticketIdFromCreate(res);
      deleteLotDraft(draftId);
      navigate(ticketId ? `/op/mfo/plans/${ticketId}` : '/op', {
        replace: true,
        state: { justSubmitted: true },
      });
    } catch (e) {
      const msg = toMfoUserMessage(e);
      setErr(msg);
      if (typeof speak === 'function') speak(msg, { rate: 0.82 });
      else speakError?.(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-slate-50">
      <TenantHeader tenant={tenant} subtitle="Tạo khung dự kiến" />

      <main className="flex flex-1 flex-col gap-4 px-4 py-4 pb-28">
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-base font-medium leading-relaxed text-slate-800">{help}</p>
          <div className="mt-3">
            <AudioHelpButton text={help} label="Nghe hướng dẫn" />
          </div>
        </section>

        {err ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-base text-rose-800">{err}</p>
        ) : null}

        {stepKey !== 'review' ? (
          <>
            {!originId ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-base font-black text-slate-800">Chọn đời gốc</p>
                <p className="mt-2 text-base text-slate-700">
                  Bấm một người trên cây họ, hoặc tìm trên sổ. Cây tờ khai bắt đầu từ một nhà.
                </p>
                <button
                  type="button"
                  className="mt-3 min-h-12 w-full rounded-2xl bg-indigo-600 text-base font-black text-white"
                  onClick={openGfl}
                >
                  Chọn trên cây họ
                </button>
                <button
                  type="button"
                  className="mt-2 min-h-12 w-full rounded-2xl border border-indigo-200 bg-white text-base font-black text-indigo-700"
                  onClick={() => openSearch(0)}
                >
                  Tìm trên sổ
                </button>
              </section>
            ) : (
              <TreeZoomPane>
              <div className="flex flex-col items-center gap-0">
                {(() => {
                  const shown = lines
                    .filter((row) => row.op === 'ASSIGN' || row.op === 'CREATE')
                    .filter((row) => {
                      if (row.line === 0) return true;
                      for (let i = 0; i < row.line; i += 1) {
                        const anc = lines[i];
                        if (anc.op !== 'ASSIGN' && anc.op !== 'CREATE') continue;
                        if (!openGens.has(i)) return false;
                      }
                      return true;
                    });
                  return shown.map((row, idx) => {
                    const prev = shown[idx - 1];
                    const parentCols = prev ? 1 + (prev.siblings || []).length : 1;
                    const stemCol = Number.isInteger(row.parentSib) && row.parentSib >= 0 ? row.parentSib + 1 : 1;
                    const name =
                      row.line === 0 ? originName : row.hint || (row.op === 'CREATE' ? 'Xin tạo' : '');
                    const couple = asCouple(
                      name,
                      row.gender,
                      row.is_clan,
                      row.spouse_hint,
                      row.spouse_gender,
                      row.avatar_url,
                      row.spouse_avatar
                    );
                    const hasChild = lines.some(
                      (c) =>
                        c.line === row.line + 1 && (c.op === 'ASSIGN' || c.op === 'CREATE')
                    );
                    const cells = [];
                    const totalCols = Math.max(parentCols, stemCol + (row.siblings || []).length);
                    for (let c = 1; c <= totalCols; c += 1) {
                      if (c === stemCol) {
                        cells.push({ kind: 'main' });
                        (row.siblings || []).forEach((sib, si) => cells.push({ kind: 'sib', sib, si }));
                        c += (row.siblings || []).length;
                      } else cells.push({ kind: 'pad' });
                    }
                    const kidCount = 1 + (row.siblings || []).length;
                    const parentTone = LANE_TONE[prev ? prev.line : 0] || LANE_TONE[0];
                    return (
                      <div key={row.line} className="flex w-full flex-col items-center">
                        {idx > 0 ? (
                          <FanConnector count={kidCount} color={parentTone.stroke} />
                        ) : null}
                        <LaneShell
                          line={row.line}
                          k={k}
                          showYou={
                            !!myMemberId &&
                            Number(k) === row.line &&
                            String(row.member_id || myMemberId) === String(myMemberId)
                          }
                        >
                        <div
                          className="flex flex-nowrap justify-center gap-3 pb-1"
                        >
                          {cells.map((cell, c) => {
                            if (cell.kind === 'pad') return <div key={`p-${c}`} />;
                            if (cell.kind === 'sib') {
                              return (
                                <div key={`s-${cell.si}`}>
                                  <FamilyCoupleNode
                                    husband={
                                      asCouple(
                                        cell.sib.hint || (cell.sib.op === 'CREATE' ? 'Xin tạo' : ''),
                                        cell.sib.gender,
                                        cell.sib.is_clan,
                                        cell.sib.spouse_hint,
                                        cell.sib.spouse_gender,
                                        cell.sib.avatar_url,
                                        cell.sib.spouse_avatar
                                      ).left
                                    }
                                    wife={
                                      asCouple(
                                        cell.sib.hint || (cell.sib.op === 'CREATE' ? 'Xin tạo' : ''),
                                        cell.sib.gender,
                                        cell.sib.is_clan,
                                        cell.sib.spouse_hint,
                                        cell.sib.spouse_gender,
                                        cell.sib.avatar_url,
                                        cell.sib.spouse_avatar
                                      ).right
                                    }
                                    strong
                                    selected={selectedLine === row.line && selectedSib === cell.si}
                                    canExpand={false}
                                    summary={nodeSummary(row, cell.sib)}
                                    actions={nodeActions(row, cell.si)}
                                    onSelect={() => {
                                      setSelectedLine(row.line);
                                      setSelectedSib(cell.si);
                                    }}
                                    onClose={() => setSelectedLine(null)}
                                  />
                                </div>
                              );
                            }
                            return (
                              <div key="main">
                                <FamilyCoupleNode
                                  husband={couple.left}
                                  wife={couple.right}
                                  strong
                                  selected={selectedLine === row.line && selectedSib < 0}
                                  canExpand={hasChild}
                                  expanded={openGens.has(row.line)}
                                  onToggleExpand={() => {
                                    setOpenGens((prev) => {
                                      const n = new Set(prev);
                                      if (n.has(row.line)) {
                                        n.delete(row.line);
                                        [...n].forEach((x) => {
                                          if (x > row.line) n.delete(x);
                                        });
                                      } else {
                                        const keep = new Set();
                                        for (let i = 0; i <= row.line; i += 1) keep.add(i);
                                        return keep;
                                      }
                                      return n;
                                    });
                                  }}
                                  summary={nodeSummary(row, null)}
                                  actions={nodeActions(row, -1)}
                                  onSelect={() => {
                                    setSelectedLine((cur) =>
                                      cur === row.line && selectedSib < 0 ? null : row.line
                                    );
                                    setSelectedSib(-1);
                                  }}
                                  onClose={() => setSelectedLine(null)}
                                />
                              </div>
                            );
                          })}
                        </div>
                        </LaneShell>
                      </div>
                    );
                  });
                })()}
              </div>
              </TreeZoomPane>
            )}
          </>
        ) : null}

        {stepKey === 'review' ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-black text-slate-900">Tóm tắt nội dung trình</h2>
            <div className="mt-3 space-y-3 text-base text-slate-800">
              {lines.map((row) => {
                const people = [];
                const isYou =
                  !!myMemberId &&
                  Number(k) === row.line &&
                  String(row.member_id || myMemberId) === String(myMemberId);
                if (row.op === 'EMPTY') {
                  people.push({ text: 'Không khai', tag: '' });
                } else if (row.op === 'CREATE') {
                  people.push({
                    text: row.hint && row.hint !== 'Xin tạo' ? row.hint : 'Chưa đặt tên',
                    tag: 'Xin tạo',
                  });
                } else {
                  const nm =
                    row.line === 0
                      ? originName
                      : row.hint || (row.member_id ? 'Đã chọn trên sổ' : '—');
                  people.push({ text: nm, tag: isYou ? 'Chính bạn' : '' });
                }
                (row.siblings || []).forEach((s) => {
                  if (s.op === 'CREATE' || (!s.member_id && s.hint)) {
                    people.push({
                      text: s.hint && s.hint !== 'Xin tạo' ? s.hint : 'Chưa đặt tên',
                      tag: 'Xin tạo',
                    });
                  } else if (s.member_id || s.hint) {
                    people.push({ text: s.hint || 'Đã chọn trên sổ', tag: '' });
                  }
                });
                const title = row.line === 0 ? 'Đời gốc' : `Đời ${row.line}`;
                return (
                  <div key={row.line}>
                    <p className="font-bold">{title}</p>
                    {people.map((p, i) => (
                      <p key={`${row.line}-${i}`} className="pl-3 leading-snug">
                        {p.text}
                        {p.tag ? ` (${p.tag})` : ''}
                      </p>
                    ))}
                  </div>
                );
              })}
            </div>
            <textarea
              className="mt-3 w-full rounded-2xl border border-slate-300 px-4 py-3 text-base"
              rows={3}
              placeholder="Ghi chú cho người duyệt"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </section>
        ) : null}

        <div className="flex gap-3">
          {stepKey === 'review' ? (
            <button
              type="button"
              className="min-h-12 flex-1 rounded-2xl border border-slate-300 bg-white text-base font-bold"
              onClick={() => {
                setErr('');
                setStep(0);
              }}
            >
              Quay lại
            </button>
          ) : (
            <button
              type="button"
              className="min-h-12 flex-1 rounded-2xl border border-slate-300 bg-white text-base font-bold"
              onClick={() => navigate('/op')}
            >
              Quay lại
            </button>
          )}
          {stepKey !== 'review' ? (
            <button
              type="button"
              className="min-h-12 flex-1 rounded-2xl bg-indigo-600 text-base font-black text-white"
              onClick={goNext}
            >
              Tiếp
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              className="min-h-12 flex-1 rounded-2xl bg-indigo-600 text-base font-black text-white disabled:opacity-60"
              onClick={submit}
            >
              {busy ? 'Đang gửi…' : 'Trình khung dự kiến'}
            </button>
          )}
        </div>
        {draftId ? (
          <button
            type="button"
            className="mt-3 min-h-12 w-full rounded-2xl border border-rose-200 bg-rose-50 text-base font-bold text-rose-800"
            onClick={() => {
              deleteLotDraft(draftId);
              navigate('/op', { replace: true });
            }}
          >
            Xóa tờ đang soạn
          </button>
        ) : null}
      </main>

      <AppFooterNav {...footerNav} />
    </div>
  );
}
