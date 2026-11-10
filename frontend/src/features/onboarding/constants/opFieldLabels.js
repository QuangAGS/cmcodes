/**
 * =============================================================================
 * PATH        : frontend/src/features/onboarding/constants/opFieldLabels.js
 * DATETIME    : 2026-11-10T13:50:00+07:00
 * VERSION     : 1.2.0-OP-FIELD-LABELS-AMEND-FULL
 * DESCRIPTION : Danh mục từ điển nhãn hiển thị và chú thích trường (SSOT)
 *               cho biểu mẫu hồ sơ Onboarding & Phả hệ 21 trường
 *               (AMEND-RP-OP-2026-01-V1.1), hỗ trợ Elder UX.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-08-15T10:00:00+07:00 (v1.0.0-LEGACY):
 *   + Danh mục nhãn hồ sơ cơ bản cũ (full_name, gender, birth_date).
 * - 2026-11-10T13:50:00+07:00 (v1.2.0-OP-FIELD-LABELS-AMEND-FULL):
 *   + Nâng cấp theo quy định QX (Q1, Q2, Q3, Q4).
 *   + Bổ sung đầy đủ nhãn và hướng dẫn nhập liệu cho 21 trường phả hệ AMEND.
 *   + Bảo tồn nguyên vẹn các nhãn cũ phục vụ tương thích ngược.
 * =============================================================================
 */

export const OP_FIELD_LABELS = {
  // --- NHÓM 1: THÔNG TIN CÁ NHÂN CƠ BẢN ---
  full_name: {
    label: 'Họ và tên chính thức',
    placeholder: 'Ví dụ: Nguyễn Văn An',
    hint: 'Nhập đầy đủ họ, chữ lót và tên khai sinh của Bác/Bạn.',
    ttsPrompt: 'Xin mời Bác nhập họ và tên chính thức',
    required: true,
  },
  alias: {
    label: 'Tên thường gọi / Tên húy / Tên tự',
    placeholder: 'Ví dụ: Ba An, Trọng An',
    hint: 'Tên thân mật trong gia đình hoặc danh xưng phả ký (nếu có).',
    ttsPrompt: 'Tên gọi thường ngày ở nhà hoặc tên húy',
    required: false,
  },
  gender: {
    label: 'Giới tính',
    placeholder: 'Chọn giới tính',
    hint: 'Xác định quan hệ nội/ngoại tộc trên sơ đồ cây gia phả.',
    ttsPrompt: 'Xin chọn giới tính Nam hoặc Nữ',
    required: true,
  },
  generation: {
    label: 'Đời thứ (Thế hệ trong dòng họ)',
    placeholder: 'Ví dụ: 15',
    hint: 'Bậc thế hệ tính từ Đời thứ 1 (Cụ Khởi tổ) của dòng họ.',
    ttsPrompt: 'Bác thuộc đời thứ bao nhiêu trong dòng họ?',
    required: false,
  },
  birth_year: {
    label: 'Năm sinh',
    placeholder: 'Ví dụ: 1980',
    hint: 'Năm sinh dương lịch (từ năm 1800 đến nay).',
    ttsPrompt: 'Năm sinh dương lịch của Bác',
    required: false,
  },
  birth_month: {
    label: 'Tháng sinh',
    placeholder: '1 - 12',
    hint: 'Tháng sinh dương lịch.',
    ttsPrompt: 'Tháng sinh',
    required: false,
  },
  birth_day: {
    label: 'Ngày sinh',
    placeholder: '1 - 31',
    hint: 'Ngày sinh dương lịch.',
    ttsPrompt: 'Ngày sinh',
    required: false,
  },
  birth_place: {
    label: 'Nơi sinh / Quê quán gốc',
    placeholder: 'Xã/Phường, Huyện/Quận, Tỉnh/Thành phố',
    hint: 'Quê quán gốc gắn liền với từ đường dòng họ.',
    ttsPrompt: 'Nơi sinh hoặc quê quán của Bác',
    required: false,
  },
  is_alive: {
    label: 'Tình trạng sinh tồn',
    hint: 'Xác định thành viên còn sống hay đã quy tiên để lập phả ký.',
    ttsPrompt: 'Thành viên hiện còn sống hay đã mất?',
    required: false,
  },
  death_year: {
    label: 'Năm mất (Quy tiên)',
    placeholder: 'Ví dụ: 2015',
    hint: 'Năm mất dương lịch (nếu thành viên đã mất).',
    ttsPrompt: 'Năm quy tiên',
    required: false,
  },

  // --- NHÓM 2: TIỀN NHÂN & NHÁNH TỘC ---
  father_name: {
    label: 'Họ tên Thân phụ (Cha)',
    placeholder: 'Họ tên đầy đủ của Cha',
    hint: 'Căn cứ quan trọng để Ban quản trị tra cứu cội nguồn gia phả.',
    ttsPrompt: 'Họ tên đầy đủ của thân phụ',
    required: false,
  },
  mother_name: {
    label: 'Họ tên Thân mẫu (Mẹ)',
    placeholder: 'Họ tên đầy đủ của Mẹ',
    hint: 'Họ tên mẹ để ghi nhận mối liên kết phối ngẫu trong phả hệ.',
    ttsPrompt: 'Họ tên đầy đủ của thân mẫu',
    required: false,
  },
  grandfather_name: {
    label: 'Họ tên Ông nội',
    placeholder: 'Họ tên ông nội',
    hint: 'Xác thực bậc cụ tổ ngành/chi.',
    ttsPrompt: 'Họ tên của ông nội',
    required: false,
  },
  grandmother_name: {
    label: 'Họ tên Bà nội',
    placeholder: 'Họ tên bà nội',
    hint: 'Ghi nhận thân tộc bà nội.',
    ttsPrompt: 'Họ tên của bà nội',
    required: false,
  },
  branch_name: {
    label: 'Tên Chi / Nhánh dòng họ',
    placeholder: 'Ví dụ: Chi Hai, Nhánh Giáp Ba, Chi Trưởng...',
    hint: 'Chi phái trong dòng họ mà gia đình Bác đang sinh hoạt.',
    ttsPrompt: 'Tên chi phái hoặc nhánh họ của gia đình',
    required: false,
  },
  member_role: {
    label: 'Vai trò trong dòng họ',
    placeholder: 'THANH_VIEN',
    hint: 'Vai trò nội bộ (Trưởng tộc, Trưởng chi, Thành viên...).',
    ttsPrompt: 'Vai trò trong dòng họ',
    required: false,
  },

  // --- NHÓM 3: LIÊN LẠC & BẰNG CHỨNG XÁC THỰC ---
  phone: {
    label: 'Số điện thoại liên lạc',
    placeholder: '09xxxxxxxx',
    hint: 'Dùng để Hội đồng gia tộc gọi điện đối soát hoặc gửi OTP.',
    ttsPrompt: 'Số điện thoại liên lạc của Bác',
    required: false,
  },
  email: {
    label: 'Hộp thư điện tử (Email)',
    placeholder: 'email@example.com',
    hint: 'Nhận thông báo trạng thái phê duyệt dòng họ qua email.',
    ttsPrompt: 'Hộp thư điện tử',
    required: false,
  },
  address: {
    label: 'Địa chỉ thường trú hiện tại',
    placeholder: 'Số nhà, đường phố, phường/xã, tỉnh/thành phố',
    hint: 'Địa chỉ cư trú để liên lạc họp họ hoặc thăm hỏi tương trợ.',
    ttsPrompt: 'Địa chỉ thường trú hiện nay của Bác',
    required: false,
  },
  note: {
    label: 'Ghi chú thêm cho Ban quản trị',
    placeholder: 'Thông tin thêm về nguồn gốc, di cư, mồ mả...',
    hint: 'Các chi tiết khác hỗ trợ việc tra cứu phả đồ nhanh chóng.',
    ttsPrompt: 'Bác có lời nhắn hoặc ghi chú thêm nào không?',
    required: false,
  },
  claimed_member_id: {
    label: 'Mã thành viên nhận (Claimed ID)',
    hint: 'Định danh liên kết với bản ghi đã tồn tại trên cây phả hệ.',
    required: false,
  },
  proof_documents: {
    label: 'Tài liệu chứng minh phả hệ',
    hint: 'Hình ảnh văn cúng, giấy khai sinh, gia phả cũ hoặc di chúc.',
    required: false,
  },
  social_facebook: {
    label: 'Liên kết Facebook',
    placeholder: 'https://facebook.com/username',
    required: false,
  },
  social_zalo: {
    label: 'Số điện thoại Zalo',
    placeholder: '09xxxxxxxx',
    required: false,
  },
};

/**
 * Helper tra cứu an toàn thông tin nhãn của một trường dữ liệu
 * @param {string} fieldName - Tên trường
 * @returns {object} Thông tin label, placeholder, hint
 */
export const getOpFieldMeta = (fieldName) => {
  return OP_FIELD_LABELS[fieldName] || {
    label: fieldName,
    placeholder: '',
    hint: '',
    required: false,
  };
};