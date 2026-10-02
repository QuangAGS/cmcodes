/**
 * PATH : frontend/src/shared/services/genealogyViewFocusService.js
 * DATETIME : 2026-10-01T23:23:00+07:00
 * VERSION : 1.1.0-COMPLETE-5L-CANONICAL-ST
 *
 * DESCRIPTION:
 * - Adapter từ Backend Full-Set canonical sang `lines[0..4]`.
 * - `clusters` là nguồn layout chuẩn.
 * - Không flatten children của nhiều Standard Tree thành siblings.
 * - `siblings` chỉ là compatibility projection của ST đầu tiên.
 * - Bảo toàn thứ tự children backend đã sort.
 */

import { getFullMfoSet } from '../../features/mfo/api/mfoApi.js';

function safeText(value, fallback = '') {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }

  return fallback;
}

function safeNumber(value, fallback = null) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function safeId(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }

  return null;
}

function firstDefined(...values) {
  return values.find(
    (value) => value !== null && value !== undefined
  );
}

function empty5Lines() {
  return [0, 1, 2, 3, 4].map((line) => ({
    line,
    op: 'EMPTY',
    is_empty: true,

    member_id: null,
    hint: '',
    gender: '',
    is_clan: true,
    is_unknown: false,
    birth_year: null,
    is_alive: undefined,
    generation: null,
    avatar_url: '',

    father_id: null,
    mother_id: null,

    spouse_id: null,
    spouse_hint: '',
    spouse_gender: '',
    spouse_is_clan: false,
    spouse_avatar: '',
    spouse_generation: null,

    /*
     * Compatibility-only:
     * không dùng làm nguồn canonical để dựng React Flow.
     */
    siblings: [],

    /*
     * Canonical layout source:
     * Standard Tree clusters của đúng level này.
     */
    clusters: [],
  }));
}

function normalizePartner(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  return {
    member_id: safeId(
      firstDefined(raw.id, raw.member_id)
    ),
    full_name: safeText(
      firstDefined(raw.full_name, raw.name, raw.hint)
    ),
    gender: safeText(raw.gender),
    is_clan: raw.is_clan !== false,

    avatar_url: safeText(
      firstDefined(raw.avatar_url, raw.avatar)
    ),
    birth_year: safeNumber(raw.birth_year, null),
    generation: safeNumber(raw.generation, null),

    union_id: safeId(raw.union_id),
    union_status: safeText(raw.union_status),
    source: safeText(raw.source),
    is_literal: raw.is_literal === true,

    /*
     * Partner luôn ở phía phải về mặt hình học.
     * is_clan chỉ là phân loại dữ liệu.
     */
    position: 'right',
  };
}

function normalizeNode(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const partners = Array.isArray(raw.partners)
    ? raw.partners.map(normalizePartner).filter(Boolean)
    : [];

  const mainPartner = partners[0] || null;

  return {
    member_id: safeId(
      firstDefined(raw.id, raw.member_id)
    ),
    full_name: safeText(
      firstDefined(raw.full_name, raw.name, raw.hint)
    ),
    gender: safeText(raw.gender),
    is_clan: raw.is_clan !== false,
    is_unknown: raw.is_unknown === true,

    avatar_url: safeText(
      firstDefined(raw.avatar_url, raw.avatar)
    ),
    birth_year: safeNumber(raw.birth_year, null),
    is_alive: raw.is_alive,
    generation: safeNumber(raw.generation, null),

    father_id: safeId(raw.father_id),
    mother_id: safeId(raw.mother_id),
    child_type: safeText(raw.child_type),

    sibling_seq: safeNumber(
      firstDefined(
        raw.sibling_seq,
        raw.siblings_order,
        raw.order
      ),
      999999
    ),

    depth: safeNumber(raw.depth, null),
    position:
      raw.role === 'partner'
        ? 'right'
        : 'left',

    role: safeText(raw.role),
    is_origin: raw.is_origin === true,
    is_target: raw.is_target === true,

    partners,

    spouse_id: mainPartner?.member_id || null,
    spouse_hint: mainPartner?.full_name || '',
    spouse_gender: mainPartner?.gender || '',
    spouse_is_clan: mainPartner?.is_clan === true,
    spouse_avatar: mainPartner?.avatar_url || '',
    spouse_generation: mainPartner?.generation ?? null,
  };
}

function mapStandardTree(rawSt, depth, stIndex) {
  const source =
    rawSt && typeof rawSt === 'object'
      ? rawSt
      : {};

  const parentMember = normalizeNode(
    source.parent?.member
  );

  const parentPartners = Array.isArray(
    source.parent?.partners
  )
    ? source.parent.partners
        .map(normalizePartner)
        .filter(Boolean)
    : [];

  /*
   * Không sort lại:
   * BE đã sort sibling theo sibling_seq → birth_year → full_name.
   */
  const children = Array.isArray(source.children)
    ? source.children
        .map((rawChild) => {
          if (!rawChild || typeof rawChild !== 'object') {
            return null;
          }

          const member = normalizeNode(rawChild.member);

          if (!member) {
            return null;
          }

          const partners = Array.isArray(rawChild.partners)
            ? rawChild.partners
                .map(normalizePartner)
                .filter(Boolean)
            : member.partners || [];

          const mainPartner = partners[0] || null;

          return {
            member: {
              ...member,
              partners,

              spouse_id: mainPartner?.member_id || null,
              spouse_hint: mainPartner?.full_name || '',
              spouse_gender: mainPartner?.gender || '',
              spouse_is_clan:
                mainPartner?.is_clan === true,
              spouse_avatar:
                mainPartner?.avatar_url || '',
              spouse_generation:
                mainPartner?.generation ?? null,
            },
            partners,
          };
        })
        .filter(Boolean)
    : [];

  return {
    st_key: safeText(
      source.id,
      `ST(${depth})_${stIndex}`
    ),
    depth,
    kind: safeText(source.kind, 'standard_tree'),

    parent: {
      member: parentMember,
      partners: parentPartners,
    },

    children,

    parent_clan_id:
      parentMember?.member_id || null,

    parent_name:
      parentMember?.full_name || '',

    parent_partners: parentPartners,

    children_count: safeNumber(
      source.child_count,
      children.length
    ),
  };
}

function projectFirstClusterToLegacyLine(
  line,
  firstCluster,
  fallbackNodes
) {
  const head =
    firstCluster?.parent?.member ||
    fallbackNodes[0] ||
    null;

  if (!head) {
    line.op = 'EMPTY';
    return;
  }

  line.op = 'ASSIGN';
  line.member_id = safeId(head.member_id);
  line.hint = safeText(head.full_name);
  line.gender = safeText(head.gender);
  line.is_clan = head.is_clan !== false;
  line.is_unknown = head.is_unknown === true;
  line.avatar_url = safeText(head.avatar_url);
  line.birth_year = safeNumber(head.birth_year, null);
  line.is_alive = head.is_alive;
  line.generation = safeNumber(head.generation, null);
  line.father_id = safeId(head.father_id);
  line.mother_id = safeId(head.mother_id);

  const mainPartner =
    firstCluster?.parent?.partners?.[0] ||
    head.partners?.[0] ||
    null;

  line.spouse_id = safeId(mainPartner?.member_id);
  line.spouse_hint = safeText(mainPartner?.full_name);
  line.spouse_gender = safeText(mainPartner?.gender);
  line.spouse_is_clan =
    mainPartner?.is_clan === true;
  line.spouse_avatar = safeText(
    mainPartner?.avatar_url
  );
  line.spouse_generation = safeNumber(
    mainPartner?.generation,
    null
  );

  /*
   * Compatibility-only:
   * chỉ lấy children của ST đầu tiên.
   *
   * Không bao giờ gộp children của tất cả ST cùng level,
   * vì child của các ST khác nhau không phải siblings.
   */
  line.siblings = (
    firstCluster?.children || []
  ).map(({ member, partners }) => {
    const spouse =
      partners?.[0] ||
      member?.partners?.[0] ||
      null;

    return {
      op: 'ASSIGN',
      member_id: safeId(member?.member_id),
      hint: safeText(member?.full_name),
      gender: safeText(member?.gender),
      is_clan: member?.is_clan !== false,
      is_unknown: member?.is_unknown === true,
      avatar_url: safeText(member?.avatar_url),
      birth_year: safeNumber(member?.birth_year, null),
      generation: safeNumber(member?.generation, null),
      father_id: safeId(member?.father_id),
      mother_id: safeId(member?.mother_id),
      sibling_seq: safeNumber(
        member?.sibling_seq,
        999999
      ),

      spouse_id: safeId(spouse?.member_id),
      spouse_hint: safeText(spouse?.full_name),
      spouse_gender: safeText(spouse?.gender),
      spouse_is_clan:
        spouse?.is_clan === true,
      spouse_avatar: safeText(spouse?.avatar_url),
      spouse_generation: safeNumber(
        spouse?.generation,
        null
      ),
    };
  });
}

function assignLineData(
  line,
  clusters,
  fallbackNodes,
  isEmptyLevel
) {
  if (
    isEmptyLevel &&
    clusters.length === 0 &&
    fallbackNodes.length === 0
  ) {
    line.op = 'EMPTY';
    line.is_empty = true;
    line.member_id = null;
    line.hint = '';
    line.siblings = [];
    line.clusters = [];
    return;
  }

  line.is_empty = false;
  line.clusters = clusters;

  const firstCluster = clusters[0] || null;

  projectFirstClusterToLegacyLine(
    line,
    firstCluster,
    fallbackNodes
  );
}

export function getOriginMemberIdForSubmission(
  viewFocusResult
) {
  if (!viewFocusResult) {
    return null;
  }

  if (viewFocusResult.originId) {
    return viewFocusResult.originId;
  }

  if (viewFocusResult.treeData?.origin?.id) {
    return viewFocusResult.treeData.origin.id;
  }

  for (let depth = 0; depth <= 4; depth += 1) {
    const line = viewFocusResult.lines?.[depth];

    if (
      line &&
      !line.is_empty &&
      line.member_id
    ) {
      return line.member_id;
    }
  }

  return viewFocusResult.targetId || null;
}

/**
 * Adapter chính:
 * lấy Full-Set từ BE và luôn trả 5 line 0..4.
 */
export async function fulfillViewFocus5L(
  targetMemberId,
  targetLine = 0
) {
  const lines = empty5Lines();

  if (!targetMemberId) {
    return {
      originId: '',
      originName: '',
      targetId: '',
      targetLine: 0,
      targetActualLine: null,
      focusMemberId: '',
      focusDepth: null,
      rootDepth: null,
      actualAncestorSteps: 0,
      lines,
      treeData: null,
    };
  }

  const parsedLine = safeNumber(targetLine, 0);

  const targetLineNum =
    Number.isInteger(parsedLine) &&
    parsedLine >= 0 &&
    parsedLine <= 4
      ? parsedLine
      : 0;

  try {
    const res = await getFullMfoSet(
      targetMemberId,
      targetLineNum
    );

    const treeData =
      res?.data?.data ||
      res?.data ||
      res ||
      {};

    const backendLevels = Array.isArray(treeData?.levels)
      ? treeData.levels
      : [];

    const levelByDepth = new Map(
      backendLevels
        .filter((level) => {
          const depth = safeNumber(
            level?.depth,
            null
          );

          return (
            Number.isInteger(depth) &&
            depth >= 0 &&
            depth <= 4
          );
        })
        .map((level) => [
          safeNumber(level.depth, 0),
          level,
        ])
    );

    for (let depth = 0; depth <= 4; depth += 1) {
      const level = levelByDepth.get(depth) || {};

      const isEmptyLevel =
        level?.is_empty === true;

      const fallbackNodes = Array.isArray(level.nodes)
        ? level.nodes
            .map(normalizeNode)
            .filter(Boolean)
        : [];

      const clusters = Array.isArray(
        level.standard_trees
      )
        ? level.standard_trees.map((st, stIndex) =>
            mapStandardTree(st, depth, stIndex)
          )
        : [];

      assignLineData(
        lines[depth],
        clusters,
        fallbackNodes,
        isEmptyLevel
      );
    }

    const originId =
      safeId(treeData?.origin?.id) ||
      safeId(treeData?.target?.id) ||
      safeId(targetMemberId) ||
      '';

    const originName = safeText(
      firstDefined(
        treeData?.origin?.full_name,
        treeData?.target?.full_name
      )
    );

    const targetId =
      safeId(treeData?.target?.id) ||
      safeId(targetMemberId) ||
      '';

    const actualTargetDepth = safeNumber(
      treeData?.target?.actual_depth,
      targetLineNum
    );

    return {
      originId,
      originName,

      targetId,
      targetLine: safeNumber(
        treeData?.target?.selected_depth,
        targetLineNum
      ),
      targetActualLine: actualTargetDepth,

      focusMemberId: targetId,
      focusDepth: actualTargetDepth,

      rootDepth: safeNumber(
        treeData?.window?.root_depth,
        null
      ),

      actualAncestorSteps: safeNumber(
        firstDefined(
          treeData?.window?.actual_ancestor_steps,
          treeData?.actual_k
        ),
        0
      ),

      lines,
      treeData,
    };
  } catch (error) {
    console.error(
      'FULFILL_VIEW_FOCUS_5L_ERROR:',
      error
    );

    return {
      originId: safeId(targetMemberId) || '',
      originName: '',

      targetId: safeId(targetMemberId) || '',
      targetLine: targetLineNum,
      targetActualLine: null,

      focusMemberId: safeId(targetMemberId) || '',
      focusDepth: targetLineNum,

      rootDepth: null,
      actualAncestorSteps: 0,

      lines,
      treeData: null,
    };
  }
}

export default {
  fulfillViewFocus5L,
  getOriginMemberIdForSubmission,
};