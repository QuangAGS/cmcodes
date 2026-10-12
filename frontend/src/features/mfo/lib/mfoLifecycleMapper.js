/**
 * PATH       : src/features/mfo/lib/mfoLifecycleMapper.js
 * DATETIME   : 2026-10-12T15:25:00+07:00
 * VERSION    : 2.1.1-DOCTRINE211-MAPPER
 * DESCRIPTION:
 * - Ánh xạ trạng thái Backend sang viewMode, Nhãn Dropdown chuẩn Cửa 1 & 2.
 * - Đã chốt: Sau khi Khung duyệt (plan_ok = true), nhãn là "Tờ khai đang soạn"[cite: 18, 20].
 * - Thực thi Ma trận Quyền xóa EU chuẩn[cite: 8, 20].
 * REFERENCE  : MFO-FE-DOCTRINE-2.1 Section 7; Patch Plan 2.1.1 Section 4
 */

export function resolveMfoLifecycle(proposalRow) {
  if (!proposalRow) {
    return {
      stage: 'GATE1',
      gate: 1,
      viewMode: 'EDITABLE',
      isReadOnly: false,
      isWorkbench: false,
      dropdownLabel: 'Khung đang soạn',
      bannerText: 'Bạn tự do thể hiện ý định của mình bằng cách: Chọn người từ sổ họ làm mốc rồi có thể thêm con, thêm hôn phối, khai khuyết danh. Sau đó có thể lưu bản nháp hoặc trình ban quản trị.',
      canDelete: true,
    };
  }

  const status = String(proposalRow.status || 'DRAFT').toUpperCase();
  const payload = proposalRow.payload || {};
  const planOk = Boolean(payload.plan_ok);
  const resultSubmitted = Boolean(payload.result_submitted);
  const resultOk = Boolean(payload.result_ok);

  // 1. CỬA 1 (GATE 1 - KHUNG Ý ĐỊNH)
  if (!planOk) {
    if (status === 'DRAFT') {
      return {
        stage: 'GATE1',
        gate: 1,
        viewMode: 'EDITABLE',
        isReadOnly: false,
        isWorkbench: false,
        dropdownLabel: 'Khung đang soạn',
        bannerText: 'Bạn tự do thể hiện ý định của mình bằng cách: Chọn người từ sổ họ làm mốc rồi có thể thêm con, thêm hôn phối, khai khuyết danh.',
        canDelete: true,
      };
    }

    if (status === 'PENDING' || status === 'UNDER_REVIEW') {
      return {
        stage: 'GATE1',
        gate: 1,
        viewMode: 'READONLY',
        isReadOnly: true,
        isWorkbench: false,
        dropdownLabel: 'Khung chờ phê duyệt',
        bannerText: 'Giai đoạn 1 - Trình ý định qua Khung 5L: Đang chờ Ban Quản trị thẩm định. Bác chỉ được quyền xem.',
        canDelete: false, // CẤM XÓA KHI ĐANG CHỜ DUYỆT[cite: 8, 20]
      };
    }

    if (status === 'NEEDS_REVISION') {
      return {
        stage: 'GATE1',
        gate: 1,
        viewMode: 'EDITABLE',
        isReadOnly: false,
        isWorkbench: false,
        dropdownLabel: 'Khung cần sửa',
        bannerText: 'Giai đoạn 1 - Khung ý định bị yêu cầu sửa lại. Hãy điều chỉnh theo Bút phê rồi bấm Trình lại.',
        canDelete: true,
      };
    }

    if (status === 'REJECTED') {
      return {
        stage: 'GATE1',
        gate: 1,
        viewMode: 'TERMINAL_REJECT',
        isReadOnly: true,
        isWorkbench: false,
        dropdownLabel: 'Khung không được duyệt',
        bannerText: `🛑 KHUNG Ý ĐỊNH KHÔNG ĐƯỢC BAN QUẢN TRỊ DUYỆT. Lý do: ${proposalRow.admin_note || payload.admin_note || 'Bác bỏ vĩnh viễn'}`,
        canDelete: false, // CẤM XÓA REJECTED ĐỂ BẢO LƯU BÚT PHÊ[cite: 8, 20]
      };
    }
  }

  // 2. CỬA 2 (GATE 2 - TỜ KHAI WORKBENCH) - KHUNG ĐÃ DUYỆT (plan_ok = true)
  if (planOk && !resultSubmitted && !resultOk) {
    const isRevision = status === 'NEEDS_REVISION';
    return {
      stage: 'GATE2',
      gate: 2,
      viewMode: isRevision ? 'WORKBENCH_EDIT' : 'WORKBENCH',
      isReadOnly: false,
      isWorkbench: true,
      dropdownLabel: isRevision ? 'Tờ khai cần sửa' : 'Tờ khai đang soạn', // ĐÃ CHỐT NHÃN TỜ KHAI[cite: 18, 20]
      bannerText: isRevision
        ? 'Giai đoạn 2 - Tờ khai bị yêu cầu sửa lại. Bác mở lại Tờ khai để hiệu chỉnh, bổ sung rồi Trình lại.'
        : 'Khung ý định đã niêm phong ➔ Tờ khai mới đã sẵn sàng! Mời bác thực hiện khai báo chi tiết các ý định.',
      canDelete: true, // Cho phép xóa khi Khung đã duyệt mà chưa trình Tờ khai[cite: 8, 20]
    };
  }

  if (planOk && resultSubmitted && !resultOk) {
    return {
      stage: 'GATE2',
      gate: 2,
      viewMode: 'READONLY',
      isReadOnly: true,
      isWorkbench: false,
      dropdownLabel: 'Tờ khai chờ duyệt',
      bannerText: 'Giai đoạn 2 - Tờ khai đang chờ Ban quản trị thẩm định. Tờ khai chỉ được xem.',
      canDelete: false, // CẤM XÓA KHI CHỜ NGHIỆM THU[cite: 8, 20]
    };
  }

  if (resultOk || status === 'APPROVED') {
    return {
      stage: 'CLOSED',
      gate: 2,
      viewMode: 'TERMINAL_OK',
      isReadOnly: true,
      isWorkbench: false,
      dropdownLabel: 'Tờ khai đã duyệt',
      bannerText: 'Giai đoạn 2 Tờ khai đã được duyệt. Hai giai đoạn đã hoàn tất vĩnh viễn và ý định của bác đã được ghi nhận trên sổ họ.',
      canDelete: false, // CẤM XÓA KHI ĐÃ GHI SỔ[cite: 8, 20]
    };
  }

  if (status === 'REJECTED') {
    return {
      stage: 'GATE2',
      gate: 2,
      viewMode: 'TERMINAL_REJECT',
      isReadOnly: true,
      isWorkbench: false,
      dropdownLabel: 'Tờ khai không được duyệt',
      bannerText: `🛑 TỜ KHAI ĐÃ BỊ BAN QUẢN TRỊ BÁC BỎ VĨNH VIỄN. Lý do: ${proposalRow.admin_note || payload.admin_note || 'Bác bỏ vĩnh viễn'}`,
      canDelete: false,
    };
  }

  return {
    stage: 'GATE1',
    gate: 1,
    viewMode: 'READONLY',
    isReadOnly: true,
    isWorkbench: false,
    dropdownLabel: 'Khung chờ phê duyệt',
    bannerText: 'Giai đoạn 1 - Trình ý định qua Khung 5L: Đang chờ Ban Quản trị thẩm định.',
    canDelete: false,
  };
}