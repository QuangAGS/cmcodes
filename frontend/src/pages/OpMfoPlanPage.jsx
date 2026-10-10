/**
 * PATH       : frontend/src/pages/OpMfoPlanPage.jsx
 * DATETIME   : 2026-10-09T19:50:00+07:00
 * VERSION    : 4.8.0-AMENDMENT2-AF-CATALOG
 * DESCRIPTION:
 * - Amendment 2. Khôi phục đủ danh mục AF và tác vụ đảo trên cây.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { mfoToast } from '../features/mfo/lib/mfoToastVoice.js';
import ReactFlow, { Background, Controls, useEdgesState, useNodesState } from 'reactflow';
import 'reactflow/dist/style.css';
import {
  UserCheck,
  Plus,
  Heart,
  X,
  Move,
  ZoomIn,
  ZoomOut,
  Save,
  Lock,
  XOctagon,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext.jsx';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import AudioHelpButton from '../features/elder-doctrine/components/AudioHelpButton.jsx';
import FamilyCoupleNode from '../features/genealogy/components/FamilyCoupleNode.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';
import { MFO_VOICE_SELF } from '../features/mfo/constants/mfoVoiceHelp.self.js';
import { toMfoUserMessage } from '../features/mfo/constants/mfoUserErrors.js';
import { createPlan, getFullMfoSet, savePlanDraft, getDraftPayload } from '../features/mfo/api/mfoApi.js';
import { buildMfoGraph } from '../features/mfo/lib/mfoGraphAdapter.js';
import { fulfillViewFocus5L, getOriginMemberIdForSubmission } from '../shared/services/genealogyViewFocusService.js';
import { sanitizeLines } from '../features/mfo/lib/sanitizeLines.js';
import { clearPickCache } from '../features/mfo/lib/mfoDraftStore.js';
import { diffDraftAgainstInit } from '../features/mfo/lib/mfoDiffEngine.js';

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

function EmptyCoupleNode({ id, data }) {
  const nodeRef = useRef(null);
  const depth = Number.isInteger(Number(data?.depth)) ? Number(data.depth) : 0;

  function handleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (data?.isReadOnly) return;
    if (nodeRef.current) {
      const rect = nodeRef.current.getBoundingClientRect();
      data?.onOpenActionForm?.({
        nodeId: id || `empty-${depth}`,
        treeId: null,
        isEmptyNode: true,
        depth,
        clanName: `Đời ${depth}`,
        unassignedCount: 0,
        hasPartner: false,
        rect,
        clanMember: null,
        isAnonymous: false,
        originSource: 'from_empty',
      });
    }
  }

  return (
    <div
      ref={nodeRef}
      role="button"
      tabIndex={0}
      className={`mfo-empty-lane-button nopan flex min-h-[72px] w-[180px] select-none items-center justify-center rounded-2xl border-2 border-dashed border-slate-400 bg-slate-50 px-4 py-3 text-center text-slate-700 shadow-sm ${
        data?.isReadOnly ? 'cursor-not-allowed opacity-60' : 'cursor-pointer touch-manipulation active:bg-slate-100'
      }`}
      style={{ touchAction: 'manipulation', pointerEvents: 'auto' }}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleClick(event);
        }
      }}
    >
      <span>
        <span className="block text-sm font-extrabold">{data?.label || `Đời ${depth}`}</span>
        <span className="mt-1 block text-xs font-semibold text-slate-600">
          {data?.isReadOnly ? '(Chế độ xem đóng băng)' : 'Bấm để thao tác đời này'}
        </span>
      </span>
    </div>
  );
}

function FamilyCoupleFlowNode({ id, data }) {
  return (
    <div className="nopan cursor-grab active:cursor-grabbing touch-manipulation" style={{ width: 240, pointerEvents: 'auto' }}>
      <FamilyCoupleNode id={id} data={data} />
    </div>
  );
}

const nodeTypes = { familyCouple: FamilyCoupleFlowNode, emptyNode: EmptyCoupleNode };

function emptyGraphNodes(onOpenActionForm, fullSet, isReadOnly = false) {
  const rootDepth = Number(fullSet?.origin?.root_canvas_depth);
  return [0, 1, 2, 3, 4].map((depth) => ({
    id: `empty-${depth}`,
    type: 'emptyNode',
    position: { x: 40, y: depth * 310 },
    style: { width: 180, height: 80 },
    data: {
      depth,
      onOpenActionForm,
      isReadOnly,
      label: Number.isInteger(rootDepth) && depth < rootDepth ? 'Chưa có dữ liệu tổ tiên' : `Đời ${depth}`,
    },
  }));
}

export function OpMfoPlanPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const tenant = resolveTenant(user);
  const footerNav = resolveFooterNav(user, { pageKey: 'op-mfo-plan', backTo: '/op' });
  const myMemberId = user?.member_id || user?.memberId || null;

  const [originId, setOriginId] = useState(null);
  const [targetMemberId, setTargetMemberId] = useState(null);
  const [k, setK] = useState('0');
  const [lines, setLines] = useState(empty5Lines);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingTree, setLoadingTree] = useState(false);
  const [viewFocusResult, setViewFocusResult] = useState(null);

  // STATE DRAFT TIMESTAMPS VÀ TRẠNG THÁI HỒ SƠ
  const [currentDraftTicketId, setCurrentDraftTicketId] = useState(null);
  const [currentDraftUpdatedAt, setCurrentDraftUpdatedAt] = useState(null);
  const [proposalStatus, setProposalStatus] = useState('DRAFT');
  const [adminNote, setAdminNote] = useState('');

  /**
   * <2026-10-09T19:50:00+07:00> - CỜ ĐÓNG BĂNG READ-ONLY (AMENDMENT 20261009)
   */
  const isReadOnly = useMemo(() => {
    const st = String(proposalStatus || 'DRAFT').toUpperCase();
    if (st === 'REJECTED' || st === 'PENDING' || st === 'UNDER_REVIEW') return true;
    return false;
  }, [proposalStatus]);

  // STATE MODAL HÔN NHÂN
  const [showSpouseOrderModal, setShowSpouseOrderModal] = useState(false);
  const [pendingSpouseNodeInfo, setPendingSpouseNodeInfo] = useState(null);
  const [selectedSpouseOrder, setSelectedSpouseOrder] = useState(1);

  // STATE PAYLOAD
  const [fullSet, setFullSet] = useState(null);
  const [draftSet, setDraftSet] = useState(null);
  const [activeUnionByTreeId, setActiveUnionByTreeId] = useState({});

  const isUserMutatedRef = useRef(false);

  // STATE PORTAL ACTIVE FORM
  const [activeActionNode, setActiveActionNode] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [zoomScale, setZoomScale] = useState(1);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const flowRef = useRef(null);
  const fulfilledPickRef = useRef(null);
  const requestRef = useRef(0);

  const handleOpenActionForm = useCallback(
    (payload) => {
      if (isReadOnly) return;
      setActiveActionNode(payload);
      setDragOffset({ x: 0, y: 0 });
      setZoomScale(1);
    },
    [isReadOnly]
  );

  const rebuildGraph = useCallback(
    (payload, activeMap) => {
      if (!payload) return;
      const built = buildMfoGraph(payload, { activeUnionByTreeId: activeMap });
      const occupied = new Set((built.nodes || []).map((node) => Number(node?.data?.depth)));
      const rootDepth = Number(
        payload?.resolved_root?.root_canvas_depth ?? payload?.origin?.root_canvas_depth
      );
      const emptyNodes = [0, 1, 2, 3, 4]
        .filter((depth) => !occupied.has(depth))
        .map((depth) => ({
          id: 'empty-' + depth,
          type: 'emptyNode',
          position: { x: 40, y: depth * 310 },
          style: { width: 180, height: 80 },
          data: {
            depth,
            isReadOnly,
            onOpenActionForm: isReadOnly ? () => {} : handleOpenActionForm,
            label:
              Number.isInteger(rootDepth) && depth < rootDepth
                ? 'Chưa có tổ tiên'
                : 'Chưa có người',
          },
        }));

      setNodes([
        ...built.nodes.map((node) => ({
          ...node,
          style: { width: 240 },
          data: {
            ...node.data,
            isReadOnly,
            onOpenActionForm: isReadOnly ? () => {} : handleOpenActionForm,
            onTabChange: (treeId, unionId) =>
              setActiveUnionByTreeId((old) =>
                old[treeId] === unionId ? old : { ...old, [treeId]: unionId }
              ),
          },
        })),
        ...emptyNodes,
      ]);
      setEdges(built.edges);
    },
    [handleOpenActionForm, isReadOnly, setEdges, setNodes]
  );

  // FULFILL THÀNH VIÊN TỪ SỔ
  const fulfill = useCallback(async (memberId, line) => {
    const sequence = ++requestRef.current;
    const depth = Number(line);
    const selected = Number.isInteger(depth) && depth >= 0 && depth <= 4 ? depth : 0;
    try {
      setLoadingTree(true);
      setErr('');
      setK(String(selected));

      const result = await fulfillViewFocus5L(memberId, selected);
      if (sequence !== requestRef.current) return;

      setViewFocusResult(result);
      setTargetMemberId(memberId);
      setOriginId(result?.resolvedRootMemberId || result?.originId || null);
      setLines(result?.lines || empty5Lines());

      const payload = await getFullMfoSet(memberId, selected);
      if (sequence === requestRef.current) {
        setFullSet(payload);
        setDraftSet(JSON.parse(JSON.stringify(payload)));
        rebuildGraph(payload, {});
        isUserMutatedRef.current = true;
        mfoToast.success(`Đã chọn thành công người trên Sổ vào Đời ${selected}!`);
      }
    } catch (error) {
      if (sequence === requestRef.current) setErr(toMfoUserMessage(error));
    } finally {
      if (sequence === requestRef.current) setLoadingTree(false);
    }
  }, [rebuildGraph]);

  /**
   * <2026-10-09T19:50:00+07:00> - NẠP DỮ LIỆU CÂY DRAFT/PICK KHI TẠO/SỬA
   */
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/auth?mode=login', { replace: true });
      return;
    }

    let pick = location.state?.originPick || location.state?.linePick;
    if (!pick) {
      try {
        pick =
          JSON.parse(sessionStorage.getItem('mfo.originPick') || 'null') ||
          JSON.parse(sessionStorage.getItem('mfo.linePick') || 'null');
      } catch {
        pick = null;
      }
    }

    if (pick?.id) {
      const raw =
        sessionStorage.getItem('mfo.assignLine') ??
        searchParams.get('line') ??
        searchParams.get('k') ??
        pick.line;
      const depth = Number(raw);
      const line = Number.isInteger(depth) && depth >= 0 && depth <= 4 ? depth : 0;
      const key = `${pick.id}:${line}`;

      if (fulfilledPickRef.current !== key) {
        fulfilledPickRef.current = key;
        clearPickCache();
        void fulfill(pick.id, line);
        return;
      }
    }

    const draftTicketId = searchParams.get('draft') || searchParams.get('ticket_id');

    if (draftTicketId) {
      async function hydrateDraftPayload() {
        try {
          setLoadingTree(true);
          const res = await getDraftPayload(draftTicketId);
          const draftData = res?.data || res;

          if (!draftData) return;

          const st = String(draftData.status || 'DRAFT').toUpperCase();
          const readOnlyFlag = st === 'PENDING' || st === 'UNDER_REVIEW' || st === 'REJECTED';

          if (draftData.ticket_id) setCurrentDraftTicketId(draftData.ticket_id);
          if (draftData.updated_at) setCurrentDraftUpdatedAt(draftData.updated_at);
          setProposalStatus(st);
          if (draftData.admin_note) setAdminNote(draftData.admin_note);
          if (draftData.target_member_id) setTargetMemberId(draftData.target_member_id);
          if (draftData.selected_canvas_depth != null) setK(String(draftData.selected_canvas_depth));
          if (Array.isArray(draftData.lines)) setLines(draftData.lines);

          const snapshot =
            draftData.graph_snapshot ||
            draftData.ui_render_snapshot_layer?.graph_snapshot ||
            draftData.payload?.graph_snapshot ||
            draftData.payload?.ui_render_snapshot_layer?.graph_snapshot;

          if (snapshot && Array.isArray(snapshot.nodes) && snapshot.nodes.length > 0) {
            setNodes(
              snapshot.nodes.map((n) => ({
                ...n,
                style: { width: 240 },
                data: {
                  ...n.data,
                  isReadOnly: readOnlyFlag,
                  onOpenActionForm: readOnlyFlag ? () => {} : handleOpenActionForm,
                  onTabChange: (treeId, unionId) =>
                    setActiveUnionByTreeId((old) =>
                      old[treeId] === unionId ? old : { ...old, [treeId]: unionId }
                    ),
                },
              }))
            );

            if (Array.isArray(snapshot.edges)) {
              setEdges(snapshot.edges);
            }

            setTimeout(() => {
              if (flowRef.current) {
                if (snapshot.viewport) {
                  flowRef.current.setViewport(snapshot.viewport);
                } else {
                  flowRef.current.fitView({ padding: 0.08 });
                }
              }
            }, 150);
          }

          if (st === 'REJECTED') {
            mfoToast.error('🛑 Tờ trình đã bị Ban Quản trị Bác bỏ vĩnh viễn!');
          } else if (readOnlyFlag) {
            mfoToast.warning(`Tờ trình đang ở trạng thái [${st}]. Giao diện đóng băng Read-Only!`);
          } else if (st === 'NEEDS_REVISION') {
            mfoToast.info('Tờ trình bị trả về sửa. Hãy chỉnh sửa theo Bút phê rồi Trình lại!');
          } else {
            mfoToast.success('Đã nạp bản nháp Tờ trình!');
          }
        } catch (error) {
          console.error('[FE_HYDRATE_DRAFT_ERROR]', error);
        } finally {
          setLoadingTree(false);
        }
      }

      void hydrateDraftPayload();
    } else {
      if (!targetMemberId && !isUserMutatedRef.current) {
        setCurrentDraftTicketId(null);
        setCurrentDraftUpdatedAt(null);
        setProposalStatus('DRAFT');
        setNodes(emptyGraphNodes(handleOpenActionForm, null, false));
        setEdges([]);

        setTimeout(() => {
          if (flowRef.current) {
            flowRef.current.fitView({ padding: 0.08 });
          }
        }, 100);
      } else if (targetMemberId && !isUserMutatedRef.current) {
        const selected = Number(k);
        getFullMfoSet(
          targetMemberId,
          Number.isInteger(selected) && selected >= 0 && selected <= 4 ? selected : 0
        )
          .then((payload) => {
            setFullSet(payload);
            setDraftSet(JSON.parse(JSON.stringify(payload)));
            rebuildGraph(payload, {});
          })
          .catch(() => {});
      }
    }
  }, [authLoading, fulfill, handleOpenActionForm, k, location.key, location.state, navigate, rebuildGraph, searchParams, targetMemberId, user, setEdges, setNodes]);

  const handleNodeDragStop = useCallback(
    (event, draggedNode) => {
      if (isReadOnly) return;
      const depth = Number(draggedNode?.data?.depth ?? 0);
      const lockedY = depth * 310;

      setNodes((prevNodes) =>
        prevNodes.map((n) => {
          if (n.id === draggedNode.id) {
            return {
              ...n,
              position: {
                x: draggedNode.position.x,
                y: lockedY,
              },
            };
          }
          return n;
        })
      );
    },
    [isReadOnly, setNodes]
  );

  const triggerAddSpouseDialog = (payloadInfo) => {
    const targetNodeId = payloadInfo?.nodeId;
    const currentNode = nodes.find((n) => n.id === targetNodeId);
    const currentTabs = Array.isArray(currentNode?.data?.tabs) ? currentNode.data.tabs : [];
    
    const existingOrders = currentTabs.map((t) => Number(t.order ?? 1));
    let suggestedOrder = 1;
    while (existingOrders.includes(suggestedOrder)) {
      suggestedOrder += 1;
    }

    setSelectedSpouseOrder(suggestedOrder);
    setPendingSpouseNodeInfo(payloadInfo);
    setShowSpouseOrderModal(true);
  };

  const executeAddSpouseWithOrder = () => {
    if (!pendingSpouseNodeInfo) return;
    const { nodeId: targetNodeId, treeId: targetTreeId } = pendingSpouseNodeInfo;
    const newUnionId = `union-draft-${Date.now()}`;
    const chosenOrder = Number(selectedSpouseOrder || 1);

    isUserMutatedRef.current = true;

    setNodes((prevNodes) =>
      prevNodes.map((n) => {
        if (n.id === targetNodeId || (targetTreeId && n.data?.treeId === targetTreeId)) {
          const currentTabs = Array.isArray(n.data?.tabs) ? n.data.tabs : [];
          const newTab = {
            unionId: newUnionId,
            order: chosenOrder,
            status: 'DANG_KET_HON',
            partnerName: `Vợ/Chồng lần ${chosenOrder} (Xin tạo)`,
            childCount: 0,
          };

          const updatedTabs = [...currentTabs, newTab].sort(
            (a, b) => Number(a.order ?? 99) - Number(b.order ?? 99)
          );

          return {
            ...n,
            data: {
              ...n.data,
              activeUnionId: n.data?.activeUnionId || newUnionId,
              tabs: updatedTabs,
              hasPartner: true,
            },
          };
        }
        return n;
      })
    );

    mfoToast.success(`Đã bổ sung Cụm Hôn phối (Lần thứ ${chosenOrder}) thành công.`);
    setShowSpouseOrderModal(false);
    setPendingSpouseNodeInfo(null);
  };

  const handleNodeAction = useCallback(
    (actionType, payloadInfo) => {
      if (isReadOnly) {
        mfoToast.warning('Tờ trình đã đóng băng. Không thể thực hiện thao tác!');
        return;
      }

      const targetDepth = Number(payloadInfo?.depth);
      const targetNodeId = payloadInfo?.nodeId;
      setActiveActionNode(null);

      isUserMutatedRef.current = true;

      switch (actionType) {
        case 'SELECT_MEMBER':
          try {
            sessionStorage.setItem('mfo.assignLine', String(targetDepth));
          } catch {}
          navigate(
            `/op/members/search?preset=origin&line=${targetDepth}&returnTo=${encodeURIComponent(
              '/op/mfo/plans/new?line=' + targetDepth
            )}`
          );
          break;

        case 'ADD_CHILD': {
          const childDepth = targetDepth + 1;
          if (childDepth > 4) {
            mfoToast.error('Khung Tờ trình MFO giới hạn tối đa 5 đời (từ Đời 0 đến Đời 4).');
            return;
          }

          const parentNode = nodes.find((n) => n.id === targetNodeId);
          const parentX = parentNode?.position?.x ?? 40;
          const currentTabs = Array.isArray(parentNode?.data?.tabs) ? parentNode.data.tabs : [];
          const activeUnionId = parentNode?.data?.activeUnionId || currentTabs[0]?.unionId || null;

          const newChildId = `draft-child-${Date.now()}`;

          const newChildNode = {
            id: newChildId,
            type: 'familyCouple',
            position: { x: parentX + 30, y: childDepth * 310 },
            style: { width: 240 },
            data: {
              id: newChildId,
              treeId: newChildId,
              depth: childDepth,
              clanName: `Con đời ${childDepth} (Xin tạo)`,
              partnerName: null,
              unassignedCount: 0,
              tabs: [],
              isAnonymous: false,
              originSource: 'from_draft_child',
              onOpenActionForm: handleOpenActionForm,
            },
          };

          let sourceHandle = 'owner:unassigned';
          let isSolidUnionEdge = false;

          if (activeUnionId) {
            sourceHandle = `union:${activeUnionId}:children`;
            isSolidUnionEdge = true;
          }

          setNodes((prev) => [...prev, newChildNode]);

          if (targetNodeId) {
            const newEdge = {
              id: `edge-${targetNodeId}-${newChildId}`,
              type: 'smoothstep',
              source: targetNodeId,
              target: newChildId,
              sourceHandle,
              style: isSolidUnionEdge
                ? { stroke: '#6366f1', strokeWidth: 2 }
                : { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '4 4' },
            };
            requestAnimationFrame(() => {
              setEdges((prev) => [...prev, newEdge]);
            });
          }

          mfoToast.success(`Đã thêm ô con nháp tại Đời ${childDepth}.`);
          break;
        }

        case 'CANCEL_CHILD': {
          if (!String(targetNodeId || '').startsWith('draft-child-')) {
            mfoToast.warning('Chỉ huỷ được con nháp vừa xin tạo.');
            return;
          }
          const hasLower = edges.some((e) => e.source === targetNodeId && String(e.target).startsWith('draft-child-'));
          if (hasLower) {
            mfoToast.warning('Hãy huỷ con nháp phía dưới trước.');
            return;
          }
          setNodes((prev) => prev.filter((n) => n.id !== targetNodeId));
          setEdges((prev) => prev.filter((e) => e.source !== targetNodeId && e.target !== targetNodeId));
          mfoToast.success('Đã huỷ con nháp và gỡ cạnh.');
          break;
        }

        case 'CANCEL_SPOUSE': {
          const owner = nodes.find((n) => n.id === targetNodeId);
          const tabs = Array.isArray(owner?.data?.tabs) ? owner.data.tabs : [];
          const draftTabs = tabs.filter((tab) => String(tab.unionId).startsWith('union-draft-'));
          if (!draftTabs.length) {
            mfoToast.warning('Node này không có vợ/chồng xin tạo để huỷ.');
            return;
          }
          const removeId = draftTabs[draftTabs.length - 1].unionId;
          setNodes((prev) => prev.map((n) => {
            if (n.id !== targetNodeId) return n;
            const nextTabs = (n.data?.tabs || []).filter((tab) => tab.unionId !== removeId);
            const nextActive = n.data?.activeUnionId === removeId ? (nextTabs[0]?.unionId || null) : n.data?.activeUnionId;
            return {
              ...n,
              data: { ...n.data, tabs: nextTabs, activeUnionId: nextActive, hasPartner: nextTabs.length > 0 },
            };
          }));
          mfoToast.success('Đã huỷ vợ/chồng xin tạo.');
          break;
        }

        case 'MARK_ANONYMOUS': {
          const emptyId = targetNodeId || `empty-${targetDepth}`;
          const kdId = `kd-${targetDepth}-${Date.now()}`;
          setNodes((prev) => prev.map((n) => {
            if (n.id !== emptyId && !(n.type === 'emptyNode' && Number(n.data?.depth) === targetDepth)) return n;
            return {
              id: kdId,
              type: 'familyCouple',
              position: { x: n.position?.x ?? 40, y: targetDepth * 310 },
              style: { width: 240 },
              data: {
                id: kdId,
                treeId: kdId,
                depth: targetDepth,
                clanName: 'Khuyết danh',
                partnerName: null,
                unassignedCount: 0,
                tabs: [],
                isAnonymous: true,
                originSource: 'from_empty',
                onOpenActionForm: handleOpenActionForm,
              },
            };
          }));
          mfoToast.success(`Đã khai khuyết danh ở Đời ${targetDepth}.`);
          break;
        }

        case 'CANCEL_ANONYMOUS': {
          const node = nodes.find((n) => n.id === targetNodeId);
          if (!node?.data?.isAnonymous || node.data.originSource !== 'from_empty') {
            mfoToast.warning('Chỉ huỷ được khuyết danh khai trên ô trống.');
            return;
          }
          setNodes((prev) => prev.map((n) => {
            if (n.id !== targetNodeId) return n;
            return {
              id: `empty-${targetDepth}`,
              type: 'emptyNode',
              position: { x: 40, y: targetDepth * 310 },
              style: { width: 180, height: 80 },
              data: {
                depth: targetDepth,
                isReadOnly: false,
                onOpenActionForm: handleOpenActionForm,
                label: `Đời ${targetDepth}`,
              },
            };
          }));
          setEdges((prev) => prev.filter((e) => e.source !== targetNodeId && e.target !== targetNodeId));
          mfoToast.success('Đã huỷ khai khuyết danh.');
          break;
        }

        case 'ADD_SPOUSE':
          triggerAddSpouseDialog(payloadInfo);
          break;

        default:
          break;
      }
    },
    [handleOpenActionForm, isReadOnly, navigate, nodes, setEdges, setNodes]
  );

  const handlePointerDown = (e) => {
    e.stopPropagation();
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y };
  };

  const handlePointerMove = (e) => {
    if (!isDraggingRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    setDragOffset({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handlePointerUp = (e) => {
    if (isDraggingRef.current) {
      e.stopPropagation();
      isDraggingRef.current = false;
    }
  };

  useEffect(() => {
    if (!nodes.length || !flowRef.current) return;
    const timer = setTimeout(() => {
      flowRef.current?.fitView({ padding: 0.08, duration: 300, includeHiddenNodes: true });
    }, 120);
    return () => clearTimeout(timer);
  }, [nodes]);

  const extractCurrentPayload = () => {
    const draftChildren = nodes
      .filter((n) => n.id && String(n.id).startsWith('draft-child-'))
      .map((n) => {
        const parentEdge = edges.find((e) => e.target === n.id);
        return {
          id: n.id,
          parent_node_id: parentEdge ? parentEdge.source : '',
          depth: Number(n.data?.depth ?? 0),
          label: n.data?.clanName || 'Con nháp',
          link: parentEdge ? parentEdge.sourceHandle : 'owner:unassigned',
        };
      });

    const draftSpouses = [];
    nodes.forEach((n) => {
      const tabs = Array.isArray(n.data?.tabs) ? n.data.tabs : [];
      tabs.forEach((tab) => {
        if (String(tab.unionId).startsWith('union-draft-')) {
          draftSpouses.push({
            union_id: tab.unionId,
            owner_node_id: n.id,
            partner_name: tab.partnerName || 'Vợ/Chồng (Xin tạo)',
            owner_marriage_order: Number(tab.order ?? 1),
          });
        }
      });
    });

    const nodePositionsX = {};
    nodes.forEach((n) => {
      if (n.position && typeof n.position.x === 'number') {
        nodePositionsX[n.id] = n.position.x;
      }
    });

    const graphSnapshot = {
      full_set_revision: fullSet?.revision || '',
      viewport: flowRef.current ? flowRef.current.getViewport() : { x: 0, y: 0, zoom: 1 },
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: {
          depth: n.data?.depth,
          clanName: n.data?.clanName,
          partnerName: n.data?.partnerName,
          activeUnionId: n.data?.activeUnionId,
          unassignedCount: n.data?.unassignedCount,
          isTarget: n.data?.isTarget,
          isAnonymous: n.data?.isAnonymous,
          originSource: n.data?.originSource,
          tabs: n.data?.tabs,
        },
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        type: e.type,
        style: e.style,
      })),
    };

    const draftPayloadTemp = {
      target_member_id: targetMemberId,
      selected_canvas_depth: Number(k),
      lines,
      canvas_delta: {
        draft_children: draftChildren,
        draft_spouses: draftSpouses,
        node_positions_x: nodePositionsX,
      },
    };

    const initScs = diffDraftAgainstInit(draftPayloadTemp);

    return {
      target_member_id: targetMemberId,
      selected_canvas_depth: Number(k),
      lines,
      canvas_delta: draftPayloadTemp.canvas_delta,
      graph_snapshot: graphSnapshot,
      init_scs: initScs,
      diff_summary: initScs,
      updated_at: currentDraftUpdatedAt || null,
    };
  };

  const hasCanvasChanges = useMemo(() => {
    if (isReadOnly) return false;
    if (isUserMutatedRef.current) return true;
    if (targetMemberId) return true;

    try {
      const payload = extractCurrentPayload();
      const diffs = diffDraftAgainstInit(payload);
      return diffs.some((d) => d.text && d.text !== 'Không thêm gì.');
    } catch {
      return false;
    }
  }, [nodes, edges, lines, targetMemberId, isReadOnly]);

  /**
   * <2026-10-09T19:50:00+07:00> - LƯU NHÁP TỜ TRÌNH DRAFT
   */
  async function handleSaveDraft() {
    if (isReadOnly) {
      mfoToast.warning('Tờ trình ở trạng thái đóng băng. Không thể lưu nháp!');
      return;
    }
    if (!hasCanvasChanges) {
      mfoToast.warning('Khung ban đầu chưa có biến động mới để lưu nháp!');
      return;
    }
    if (!targetMemberId) {
      mfoToast.error('Vui lòng chọn Thành viên mốc M trước khi Lưu nháp!');
      return;
    }

    try {
      setBusy(true);
      const payload = extractCurrentPayload();
      const res = await savePlanDraft(payload);

      const returnedTicket = res?.data?.ticket || res?.ticket;
      const returnedUpdatedAt = res?.data?.updated_at || res?.updated_at;

      if (returnedTicket?.id) {
        setCurrentDraftTicketId(returnedTicket.id);
        navigate(`/op/mfo/plans/new?draft=${returnedTicket.id}`, { replace: true });
      }
      if (returnedUpdatedAt) setCurrentDraftUpdatedAt(returnedUpdatedAt);

      mfoToast.success('Đã lưu bản nháp Tờ trình 5L thành công!');
    } catch (error) {
      mfoToast.error('Lỗi khi lưu bản nháp: ' + (error?.response?.data?.message || error.message));
    } finally {
      setBusy(false);
    }
  }

  /**
   * <2026-10-09T19:50:00+07:00> - TRÌNH KHUNG MFO 5L SANG PENDING
   */
  async function handleSubmitPlan() {
    if (isReadOnly) {
      mfoToast.warning('Tờ trình ở trạng thái đóng băng. Không thể gửi lại!');
      return;
    }
    if (!hasCanvasChanges) {
      mfoToast.warning('Khung ban đầu chưa có biến động mới để trình duyệt!');
      return;
    }

    const effectiveOriginId =
      getOriginMemberIdForSubmission(viewFocusResult) ||
      originId ||
      lines.find((line) => line?.member_id)?.member_id ||
      myMemberId;

    const parsedK = Number(k);
    if (!effectiveOriginId || !Number.isInteger(parsedK) || parsedK < 0 || parsedK > 4) {
      setErr('Chưa xác định đủ thành viên gốc hoặc đời đã chọn.');
      return;
    }

    try {
      setBusy(true);
      setErr('');

      const fullPayload = extractCurrentPayload();

      const response = await createPlan({
        ticket_id: currentDraftTicketId || null,
        target_member_id: targetMemberId,
        requester_user_id: user?.id || null,
        origin_member_id: effectiveOriginId,
        k: parsedK,
        note: null,
        lines: sanitizeLines(lines, { originId: effectiveOriginId, k: parsedK }),
        canvas_delta: fullPayload.canvas_delta,
        graph_snapshot: fullPayload.graph_snapshot,
        init_scs: fullPayload.init_scs,
        diff_summary: fullPayload.diff_summary,
      });

      const resData = response?.data?.data || response?.data || response;
      const isSuccess = response?.status === 'success' || response?.status === 200 || response?.status === 201 || resData?.ticket?.id;

      if (isSuccess) {
        const ticketId = resData?.ticket?.id || resData?.id || currentDraftTicketId;
        mfoToast.success(MFO_VOICE_SELF.submitted || 'Đã trình Khung 5L thành công!');
        clearPickCache();
        navigate(ticketId ? `/op/mfo/plans/${ticketId}` : '/op', { replace: true });
      } else {
        setErr(resData?.message || 'Có lỗi xảy ra khi nộp tờ trình.');
      }
    } catch (error) {
      setErr(toMfoUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || loadingTree)
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] items-center justify-center bg-slate-50 p-6 text-center">
        <p className="text-base font-bold text-slate-600">Đang khởi tạo Cây React Flow 5L...</p>
      </div>
    );

  const getActionFormStyle = () => {
    if (!activeActionNode?.rect) return {};
    const { rect } = activeActionNode;
    const top = rect.bottom + 8;
    const left = rect.left + rect.width / 2;
    const windowHeight = window.innerHeight;
    const isNearBottom = top + 260 > windowHeight;

    const baseTop = isNearBottom ? Math.max(16, rect.top - 270) : top;
    const baseLeft = Math.max(160, Math.min(window.innerWidth - 160, left));

    return {
      position: 'fixed',
      top: baseTop,
      left: baseLeft,
      transform: `translate(calc(-50% + ${dragOffset.x}px), ${dragOffset.y}px) scale(${zoomScale})`,
      transformOrigin: 'top center',
    };
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-slate-50">
      <TenantHeader tenant={tenant} subtitle="Khai năm đời (Tạo khung mới)" />
      
      {proposalStatus === 'REJECTED' ? (
        <div className="mx-3 mt-3 flex flex-col gap-1 rounded-2xl border-2 border-rose-300 bg-rose-50 px-4 py-3 text-xs font-black text-rose-950 shadow-sm">
          <div className="flex items-center gap-2">
            <XOctagon className="h-4 w-4 shrink-0 text-rose-600" />
            <span className="uppercase text-[11px] tracking-wider text-rose-900">🛑 TỜ KHAI ĐÃ BỊ BÁC BỎ VĨNH VIỄN</span>
          </div>
          <p className="font-semibold text-slate-700 mt-0.5">
            Lý do: <span className="text-rose-900 italic">"{adminNote || 'Hồ sơ không hợp lệ.'}"</span>
          </p>
        </div>
      ) : isReadOnly ? (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-black text-amber-950 shadow-sm">
          <Lock className="h-4 w-4 shrink-0 text-amber-600" />
          <span>Tờ trình ở trạng thái [{proposalStatus}] - Giao diện đóng băng Read-Only 100%.</span>
        </div>
      ) : proposalStatus === 'NEEDS_REVISION' && (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-2xl border border-indigo-300 bg-indigo-50 px-4 py-3 text-xs font-black text-indigo-950 shadow-sm">
          <Save className="h-4 w-4 shrink-0 text-indigo-600" />
          <span>Hồ sơ bị trả về [{proposalStatus}]. Hãy sửa Canvas theo Bút phê rồi Trình lại!</span>
        </div>
      )}

      <main className="flex flex-1 flex-col gap-3 px-3 py-3 pb-28">
        <section className="rounded-3xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <p className="text-sm font-medium text-slate-800">{MFO_VOICE_SELF.whyFive}</p>
          <div className="mt-2">
            <AudioHelpButton text={MFO_VOICE_SELF.whyFive} label="Nghe hướng dẫn" />
          </div>
        </section>

        {err ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-800">{err}</p> : null}

        <div className="relative h-[calc(100vh-210px)] min-h-[520px] max-h-[680px] w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-inner">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={handleNodeDragStop}
            onInit={(instance) => {
              flowRef.current = instance;
            }}
            fitView={true}
            fitViewOptions={{ padding: 0.08, includeHiddenNodes: true }}
            minZoom={0.1}
            maxZoom={2.5}
            nodesDraggable={!isReadOnly}
            nodesConnectable={false}
            elementsSelectable={!isReadOnly}
            panOnDrag={true}
            noPanClassName="nopan"
            panOnScroll={true}
            zoomOnScroll={true}
            zoomOnDoubleClick={false}
            zoomOnPinch={true}
            preventScrolling={false}
          >
            <Background color="#cbd5e1" gap={20} size={1} />
            <Controls showInteractive={false} position="bottom-left" />
          </ReactFlow>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="min-h-12 px-3 rounded-2xl border border-slate-300 bg-white text-sm font-bold text-slate-700 active:bg-slate-100"
            onClick={() => navigate('/op')}
          >
            Quay lại
          </button>
          
          <button
            type="button"
            disabled={busy || isReadOnly || !hasCanvasChanges}
            className="min-h-12 flex-1 flex items-center justify-center gap-1.5 rounded-2xl border border-indigo-200 bg-indigo-50 px-3 text-sm font-extrabold text-indigo-800 hover:bg-indigo-100 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleSaveDraft}
          >
            <Save className="h-4 w-4 text-indigo-600" />
            <span>{isReadOnly ? 'Đã đóng băng' : 'Lưu nháp'}</span>
          </button>

          <button
            type="button"
            disabled={busy || isReadOnly || !hasCanvasChanges}
            className="min-h-12 flex-1 rounded-2xl bg-indigo-600 px-3 text-sm font-black text-white shadow-sm hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
            onClick={handleSubmitPlan}
          >
            {busy ? 'Đang gửi...' : isReadOnly ? 'Đã trình' : 'Trình Khung 5L'}
          </button>
        </div>
      </main>

      {showSpouseOrderModal &&
        createPortal(
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-[320px] rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl animate-in fade-in zoom-in duration-150">
              <div className="flex items-center gap-2 text-indigo-900 border-b border-slate-100 pb-2 mb-3">
                <Heart className="h-5 w-5 text-rose-500" />
                <h3 className="text-sm font-black uppercase tracking-wider">Thứ tự kết hôn Nội tộc</h3>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed mb-3">
                Vui lòng chọn <strong>Lần kết hôn thứ mấy</strong> của người thuộc nội tộc trên Node này:
              </p>

              <label className="block text-xs font-black uppercase text-indigo-900 mb-1">
                Lần kết hôn thứ:
              </label>
              <select
                className="w-full rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-3 text-sm font-black text-indigo-950 outline-none focus:border-indigo-600 mb-4"
                value={selectedSpouseOrder}
                onChange={(e) => setSelectedSpouseOrder(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5].map((ord) => (
                  <option key={ord} value={ord}>
                    Lần thứ {ord} {ord === 1 ? '(Lần đầu)' : ''}
                  </option>
                ))}
              </select>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-2xl border border-slate-300 py-3 text-xs font-bold text-slate-700 active:bg-slate-100"
                  onClick={() => setShowSpouseOrderModal(false)}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-2xl bg-indigo-600 py-3 text-xs font-black text-white shadow-sm active:scale-[0.98]"
                  onClick={executeAddSpouseWithOrder}
                >
                  Xác nhận
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {activeActionNode && !isReadOnly && (() => {
        const live = nodes.find((n) => n.id === activeActionNode.nodeId);
        const catalogOpen = Boolean(targetMemberId) || String(proposalStatus).toUpperCase() === 'NEEDS_REVISION';
        const depth = Number(activeActionNode.depth);
        const isEmpty = activeActionNode.isEmptyNode || live?.type === 'emptyNode';
        const isDraftChild = String(activeActionNode.nodeId || '').startsWith('draft-child-');
        const tabs = Array.isArray(live?.data?.tabs) ? live.data.tabs : [];
        const canAddChild = catalogOpen && !isEmpty && depth < 4;
        const canCancelChild = catalogOpen && isDraftChild;
        const canAddSpouse = catalogOpen && !isEmpty;
        const canCancelSpouse = catalogOpen && tabs.some((tab) => String(tab.unionId).startsWith('union-draft-'));
        const canMarkAnonymous = catalogOpen && (isEmpty || live?.data?.isAnonymous !== true);
        const canCancelAnonymous = catalogOpen && live?.data?.isAnonymous === true && live?.data?.originSource === 'from_empty';
        return createPortal(
          <div
            className="fixed inset-0 z-[99998] touch-none select-none"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <div
              className="absolute inset-0 bg-slate-900/15 cursor-default"
              onClick={() => setActiveActionNode(null)}
            />

            <div
              style={getActionFormStyle()}
              className="z-[99999] w-[280px] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl transition-transform duration-75 cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="mb-2.5 flex cursor-move items-center justify-between border-b border-slate-100 pb-1.5 px-0.5 active:cursor-grabbing"
                onPointerDown={handlePointerDown}
              >
                <div className="flex items-center gap-1.5 text-indigo-900">
                  <Move className="h-3.5 w-3.5 text-indigo-600" />
                  <span className="text-xs font-black uppercase tracking-wider">
                    Form Thao tác Node ({activeActionNode.clanName || `Đời ${activeActionNode.depth}`})
                  </span>
                </div>

                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    title="Thu nhỏ AF"
                    className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
                    onClick={() => setZoomScale((prev) => Math.max(0.8, Number((prev - 0.1).toFixed(2))))}
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Phóng to AF"
                    className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
                    onClick={() => setZoomScale((prev) => Math.min(1.3, Number((prev + 0.1).toFixed(2))))}
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Đóng AF"
                    className="ml-1 rounded-full p-1 text-slate-400 hover:bg-slate-100"
                    onClick={() => setActiveActionNode(null)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 text-xs">
                <button
                  type="button"
                  className="flex min-h-9 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 font-bold text-white shadow-sm hover:bg-indigo-700 active:scale-95"
                  onClick={() => handleNodeAction('SELECT_MEMBER', activeActionNode)}
                >
                  <UserCheck className="h-4 w-4" />
                  <span>Chọn người từ sổ họ</span>
                </button>

                {catalogOpen && (
                  <div className="flex flex-col gap-1.5">
                    <div className="grid grid-cols-2 gap-1.5">
                      <button type="button" disabled={!canAddChild} className="rounded-xl border border-emerald-300 bg-emerald-50 px-2 py-2 font-bold text-emerald-800 disabled:opacity-40" onClick={() => handleNodeAction('ADD_CHILD', activeActionNode)}>Thêm con</button>
                      <button type="button" disabled={!canCancelChild} className="rounded-xl border border-emerald-200 bg-white px-2 py-2 font-bold text-emerald-700 disabled:opacity-40" onClick={() => handleNodeAction('CANCEL_CHILD', activeActionNode)}>Huỷ thêm con</button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button type="button" disabled={!canAddSpouse} className="rounded-xl border border-rose-300 bg-rose-50 px-2 py-2 font-bold text-rose-800 disabled:opacity-40" onClick={() => handleNodeAction('ADD_SPOUSE', activeActionNode)}>Thêm vợ/chồng</button>
                      <button type="button" disabled={!canCancelSpouse} className="rounded-xl border border-rose-200 bg-white px-2 py-2 font-bold text-rose-700 disabled:opacity-40" onClick={() => handleNodeAction('CANCEL_SPOUSE', activeActionNode)}>Huỷ thêm vợ/chồng</button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button type="button" disabled={!canMarkAnonymous} className="rounded-xl border border-amber-300 bg-amber-50 px-2 py-2 font-bold text-amber-800 disabled:opacity-40" onClick={() => handleNodeAction('MARK_ANONYMOUS', activeActionNode)}>Khai khuyết danh</button>
                      <button type="button" disabled={!canCancelAnonymous} className="rounded-xl border border-amber-200 bg-white px-2 py-2 font-bold text-amber-700 disabled:opacity-40" onClick={() => handleNodeAction('CANCEL_ANONYMOUS', activeActionNode)}>Huỷ khai khuyết danh</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      <AppFooterNav {...footerNav} />
    </div>
  );
}

export default OpMfoPlanPage;