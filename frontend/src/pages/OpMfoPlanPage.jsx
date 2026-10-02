/**
 * PATH       : frontend/src/pages/OpMfoPlanPage.jsx
 * DATETIME   : 2026-10-01T23:28:00+07:00
 * VERSION    : 1.2.0-FIX-MOBILE-VIEWPORT-AND-TARGET-FOCUS
 *
 * DESCRIPTION:
 * - React Flow + Dagre renderer cho MFO 5L.
 * - Không auto-fit toàn bộ graph ở mức zoom không đọc được.
 * - Focus target M khi nhận graph mới.
 * - Khống chế mobile zoom: min 0.6, max 1.8.
 * - Giữ business flow submit/draft/pick hiện hữu.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';

import { toast } from 'sonner';

import ReactFlow, {
  Background,
  Controls,
  useEdgesState,
  useNodesState,
} from 'reactflow';

import 'reactflow/dist/style.css';

import { useAuth } from '../context/AuthContext.jsx';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import AudioHelpButton from '../features/elder-doctrine/components/AudioHelpButton.jsx';

import FamilyCoupleNode from '../features/genealogy/components/FamilyCoupleNode.jsx';

import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';

import { MFO_VOICE_SELF } from '../features/mfo/constants/mfoVoiceHelp.self.js';
import { toMfoUserMessage } from '../features/mfo/constants/mfoUserErrors.js';

import { createPlan } from '../features/mfo/api/mfoApi.js';
import { buildMfoGraph } from '../features/mfo/lib/mfoGraphAdapter.js';

import {
  fulfillViewFocus5L,
  getOriginMemberIdForSubmission,
} from '../shared/services/genealogyViewFocusService.js';

import { sanitizeLines } from '../features/mfo/lib/sanitizeLines.js';
import {
  clearPickCache,
  newDraftId,
} from '../features/mfo/lib/mfoDraftStore.js';

function empty5Lines() {
  return [0, 1, 2, 3, 4].map((line) => ({
    line,
    op: 'EMPTY',
    is_empty: true,

    member_id: null,
    hint: '',
    gender: '',
    is_clan: true,

    siblings: [],
    clusters: [],
  }));
}

function normalizeCoupleForLegacyNode(parent) {
  const clanMember = parent?.member || null;
  const partner = parent?.partners?.[0] || null;

  const clanGender = String(
    clanMember?.gender || ''
  ).toUpperCase();

  const partnerGender = String(
    partner?.gender || ''
  ).toUpperCase();

  const husband =
    clanGender === 'NAM'
      ? clanMember
      : partnerGender === 'NAM'
        ? partner
        : null;

  const wife =
    clanGender === 'NU'
      ? clanMember
      : partnerGender === 'NU'
        ? partner
        : null;

  return {
    clanMember,
    partner,
    husband,
    wife,
  };
}

function CoupleNode({ data }) {
  const {
    clanMember,
    partner,
    husband,
    wife,
  } = normalizeCoupleForLegacyNode(data.parent);

  /*
   * Fallback khi gender thiếu/khác NAM/NU:
   * FamilyCoupleNode cũ nhận husband/wife,
   * nhưng vẫn cần có dữ liệu để render.
   */
  const effectiveHusband = husband || clanMember;
  const effectiveWife =
    wife ||
    (effectiveHusband?.id === partner?.id
      ? clanMember
      : partner);

  return (
    <div
      className={[
        'w-full rounded-2xl border-2 bg-white p-1 text-slate-900 shadow-md',
        data.isTarget
          ? 'border-indigo-600 ring-2 ring-indigo-200'
          : 'border-slate-500',
      ].join(' ')}
    >
      <FamilyCoupleNode
        husband={effectiveHusband}
        wife={effectiveWife}
        lineIndex={data.depth}
        strong={data.isTarget || data.isAssign}
      />
    </div>
  );
}

function EmptyCoupleNode({ data }) {
  return (
    <div className="flex min-h-[72px] w-full items-center justify-center rounded-2xl border-2 border-dashed border-slate-400 bg-slate-50 px-4 py-3 text-center text-slate-700 shadow-sm">
      <div>
        <div className="text-sm font-extrabold">
          Đời {data.depth}
        </div>

        <div className="mt-1 text-xs font-semibold text-slate-600">
          Chưa khai báo
        </div>
      </div>
    </div>
  );
}

/*
 * Khai báo ngoài component để React Flow không nhận một object nodeTypes
 * mới ở mỗi render.
 */
const nodeTypes = {
  coupleNode: CoupleNode,
  emptyNode: EmptyCoupleNode,
};

export function OpMfoPlanPage() {
  const { user, loading: authLoading } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const tenant = resolveTenant(user);

  const footerNav = resolveFooterNav(user, {
    pageKey: 'op-mfo-plan',
    backTo: '/op',
    showBack: true,
  });

  const myMemberId =
    user?.member_id ||
    user?.memberId ||
    '';

  const [originId, setOriginId] = useState('');
  const [k, setK] = useState('');

  const [lines, setLines] = useState(empty5Lines);

  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingTree, setLoadingTree] = useState(false);

  const [draftId] = useState(
    () => searchParams.get('draft') || newDraftId()
  );

  const [viewFocusResult, setViewFocusResult] =
    useState(null);

  const [nodes, setNodes, onNodesChange] =
    useNodesState([]);

  const [edges, setEdges, onEdgesChange] =
    useEdgesState([]);

  const reactFlowInstanceRef = useRef(null);

  const fulfilledPickRef = useRef('');
  const viewRequestSeqRef = useRef(0);
  const focusTimerRef = useRef(null);

  const focusGraphTarget = useCallback((graphNodes) => {
    const instance = reactFlowInstanceRef.current;

    if (!instance || !Array.isArray(graphNodes)) {
      return;
    }

    const targetNode =
      graphNodes.find(
        (node) => node?.data?.isTarget === true
      ) ||
      graphNodes.find(
        (node) => node?.data?.isAssign === true
      ) ||
      graphNodes.find(
        (node) => node?.type !== 'emptyNode'
      ) ||
      graphNodes[0];

    if (!targetNode) {
      return;
    }

    /*
     * Focus một node thay vì fit toàn bộ graph:
     * ưu tiên card đọc được trên mobile.
     */
    instance.fitView({
      nodes: [{ id: targetNode.id }],
      padding: 0.8,
      minZoom: 0.82,
      maxZoom: 1.05,
      duration: 250,
    });
  }, []);

  /*
   * Chuyển lines canonical thành React Flow nodes/edges.
   * Không gọi fitView toàn bộ graph ở đây.
   */
  useEffect(() => {
    if (!Array.isArray(lines) || lines.length === 0) {
      return;
    }

    const {
      nodes: graphNodes,
      edges: graphEdges,
    } = buildMfoGraph(lines);

    setNodes(graphNodes);
    setEdges(graphEdges);

    if (focusTimerRef.current) {
      window.clearTimeout(focusTimerRef.current);
    }

    focusTimerRef.current = window.setTimeout(() => {
      focusGraphTarget(graphNodes);
    }, 80);

    return () => {
      if (focusTimerRef.current) {
        window.clearTimeout(focusTimerRef.current);
      }
    };
  }, [
    lines,
    setEdges,
    setNodes,
    focusGraphTarget,
  ]);

  const handleViewFocusFulfill = useCallback(
    async (targetMemberId, targetLine = 0) => {
      if (!targetMemberId) {
        return;
      }

      const requestSeq = ++viewRequestSeqRef.current;

      const parsedLine = Number(targetLine);

      const targetLineNum =
        Number.isInteger(parsedLine) &&
        parsedLine >= 0 &&
        parsedLine <= 4
          ? parsedLine
          : 0;

      try {
        setLoadingTree(true);
        setErr('');
        setK(String(targetLineNum));

        const result = await fulfillViewFocus5L(
          targetMemberId,
          targetLineNum
        );

        if (requestSeq !== viewRequestSeqRef.current) {
          return;
        }

        setViewFocusResult(result);
        setOriginId(result?.originId || '');
        setLines(result?.lines || empty5Lines());

        toast.success(
          `Đã cố định thành viên vào Đời ${targetLineNum}.`
        );
      } catch (error) {
        if (requestSeq !== viewRequestSeqRef.current) {
          return;
        }

        console.error(
          'MFO_VIEW_FOCUS_ERROR:',
          error
        );

        setErr(toMfoUserMessage(error));
      } finally {
        if (requestSeq === viewRequestSeqRef.current) {
          setLoadingTree(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      navigate('/auth?mode=login', {
        replace: true,
      });

      return;
    }

    let pick =
      location.state?.originPick ||
      location.state?.linePick ||
      null;

    if (!pick) {
      try {
        pick =
          JSON.parse(
            sessionStorage.getItem('mfo.originPick') ||
              'null'
          ) ||
          JSON.parse(
            sessionStorage.getItem('mfo.linePick') ||
              'null'
          );
      } catch {
        pick = null;
      }
    }

    if (!pick?.id) {
      return;
    }

    const rawAssignedLine = sessionStorage.getItem(
      'mfo.assignLine'
    );

    let assignedLine = 0;

    if (
      rawAssignedLine !== null &&
      rawAssignedLine !== undefined &&
      rawAssignedLine !== 'undefined'
    ) {
      assignedLine = Number(rawAssignedLine);
    } else if (
      pick.line !== null &&
      pick.line !== undefined
    ) {
      assignedLine = Number(pick.line);
    }

    if (
      !Number.isInteger(assignedLine) ||
      assignedLine < 0 ||
      assignedLine > 4
    ) {
      assignedLine = 0;
    }

    const requestKey = `${pick.id}:${assignedLine}`;

    /*
     * Chống duplicate request do StrictMode,
     * location state churn hoặc restore draft.
     */
    if (fulfilledPickRef.current === requestKey) {
      return;
    }

    fulfilledPickRef.current = requestKey;

    clearPickCache();

    void handleViewFocusFulfill(
      pick.id,
      assignedLine
    );
  }, [
    authLoading,
    user?.id,
    location.key,
    navigate,
    handleViewFocusFulfill,
  ]);

  async function submit() {
    const computedOriginId =
      getOriginMemberIdForSubmission(
        viewFocusResult
      );

    const effectiveOriginId =
      computedOriginId ||
      originId ||
      lines.find(
        (line) => line?.member_id
      )?.member_id ||
      myMemberId ||
      null;

    const parsedK = Number(k);

    const normalizedK =
      Number.isInteger(parsedK) &&
      parsedK >= 0 &&
      parsedK <= 4
        ? parsedK
        : null;

    if (!effectiveOriginId) {
      setErr(
        'Chưa xác định được thành viên gốc của cây.'
      );

      return;
    }

    if (normalizedK === null) {
      setErr(
        'Chưa xác định được đời của thành viên được chọn.'
      );

      return;
    }

    try {
      setBusy(true);
      setErr('');

      const sanitizedPayloadLines = sanitizeLines(
        lines,
        {
          originId: effectiveOriginId,
          k: normalizedK,
        }
      );

      const payload = {
        requester_user_id: user?.id || null,
        origin_member_id: effectiveOriginId,
        k: normalizedK,
        note: null,
        lines: sanitizedPayloadLines,
      };

      const res = await createPlan(payload);

      const ticketId =
        res?.data?.data?.ticket?.id ||
        res?.data?.ticket?.id ||
        res?.ticket?.id ||
        res?.id ||
        null;

      toast.success(
        MFO_VOICE_SELF.submitted ||
          'Đã gửi Tờ trình MFO!'
      );

      clearPickCache();

      if (ticketId) {
        navigate(`/op/mfo/plans/${ticketId}`, {
          replace: true,
        });

        return;
      }

      navigate('/op', {
        replace: true,
      });
    } catch (error) {
      setErr(toMfoUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || loadingTree) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <p className="text-base font-bold text-slate-600">
          Đang khởi tạo Cây React Flow 5L...
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-slate-50">
      <TenantHeader
        tenant={tenant}
        subtitle="Khai năm đời (Tạo khung mới)"
      />

      <main className="flex flex-1 flex-col gap-4 px-4 py-4 pb-28">
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-base font-medium text-slate-800">
            {MFO_VOICE_SELF.whyFive}
          </p>

          <div className="mt-2">
            <AudioHelpButton
              text={MFO_VOICE_SELF.whyFive}
              label="Nghe hướng dẫn"
            />
          </div>
        </section>

        {err ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-base text-rose-800">
            {err}
          </p>
        ) : null}

        <div className="relative h-[560px] w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-inner">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onInit={(instance) => {
              reactFlowInstanceRef.current = instance;
            }}
            fitView={false}
            minZoom={0.6}
            maxZoom={1.8}
            defaultViewport={{
              x: 20,
              y: 20,
              zoom: 0.9,
            }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            panOnDrag
            zoomOnDoubleClick={false}
            zoomOnPinch
          >
            <Background
              color="#cbd5e1"
              gap={20}
              size={1}
            />

            <Controls
              showInteractive={false}
              position="bottom-left"
            />
          </ReactFlow>
        </div>

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            className="min-h-12 flex-1 rounded-2xl border border-slate-300 bg-white text-base font-bold text-slate-900"
            onClick={() => navigate('/op')}
          >
            Quay lại
          </button>

          <button
            type="button"
            disabled={busy}
            className="min-h-12 flex-1 rounded-2xl bg-indigo-600 text-base font-black text-white disabled:opacity-60"
            onClick={submit}
          >
            {busy
              ? 'Đang gửi…'
              : 'Trình Khung 5L'}
          </button>
        </div>
      </main>

      <AppFooterNav {...footerNav} />
    </div>
  );
}

export default OpMfoPlanPage;