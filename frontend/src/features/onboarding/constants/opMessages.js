/**
 * =============================================================================
 * PATH        : frontend/src/features/onboarding/constants/opMessages.js
 * DATETIME    : 2026-11-10T13:52:00+07:00
 * VERSION     : 1.2.0-OP-MESSAGES-CYCLIC-ELDER
 * DESCRIPTION : Từ điển thông điệp thông báo và lời thoại trợ lý ảo Elder TTS
 *               cho chu trình Onboarding & Membership (AMEND-RP-OP-2026-01-V1.1).
 *               Bao gồm các trạng thái Cyclic: NEEDS_REVISION, TU_CHOI,
 *               TU_CHOI_LAN_CUOI (Terminal Hard-lock) và các xác nhận thao tác.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-08-15T10:00:00+07:00 (v1.0.0-LEGACY):
 *   + Các câu thông báo thành công / thất bại cơ bản.
 * - 2026-11-10T13:52:00+07:00 (v1.2.0-OP-MESSAGES-CYCLIC-ELDER):
 *   + Cập nhật quy chuẩn QX.
 *   + Bổ sung thông điệp cho các trạng thái phê duyệt mới của Phase 3 & 4.
 *   + Tích hợp đầy đủ các hàm sinh chuỗi Elder TTS chuẩn xưng hô "Bác/Cháu".
 * =============================================================================
 */

export const OP_MESSAGES = {
  // --- THÔNG BÁO TIẾN TRÌNH ONBOARDING & PHẢ HỆ ---
  DRAFT_STATUS: 'Hồ sơ đang trong giai đoạn soạn thảo nháp. Bác/Bạn hãy hoàn tất nộp hồ sơ để mở các tính năng dòng họ.',
  SUBMITTED_SUCCESS: 'Hồ sơ phả hệ của Bác/Bạn đã được gửi thành công đến Ban quản trị dòng họ.',
  UNDER_REVIEW: 'Hội đồng gia tộc đang tiến hành đối soát thông tin hồ sơ của Bác/Bạn.',
  
  // --- THÔNG ĐIỆP STATE MACHINE MỚI THEO AMEND ---
  NEEDS_REVISION_TITLE: 'Ban quản trị yêu cầu bổ sung thông tin',
  NEEDS_REVISION_DESC: 'Hồ sơ cần làm rõ thêm một số chi tiết về tiền nhân hoặc ngày giỗ. Bác vui lòng nhấn nút chỉnh sửa để cập nhật.',
  
  SOFT_REJECTION_TITLE: 'Hồ sơ tạm thời chưa được duyệt',
  SOFT_REJECTION_DESC: 'Hồ sơ chưa đủ điều kiện xác thực liên kết vào lúc này. Bác có thể gửi lại yêu cầu mới nếu cần thiết.',
  
  HARD_LOCK_TITLE: 'Hồ sơ đã bị từ chối lần cuối',
  HARD_LOCK_DESC: 'Hồ sơ đã được khóa an toàn vĩnh viễn theo quyết định cuối cùng của Hội đồng dòng họ. Không thể mở lại.',

  APPROVED_SUCCESS: 'Chúc mừng Bác! Hồ sơ liên kết dòng họ đã được phê duyệt chính thức thành công.',

  // --- THÔNG BÁO LỖI THAO TÁC BIỂU MẪU ---
  VALIDATION_FAILED: 'Thông tin khai báo chưa hợp lệ. Bác vui lòng kiểm tra lại các trường được báo đỏ.',
  NETWORK_ERROR: 'Kết nối mạng bị gián đoạn. Kính mời Bác kiểm tra lại đường truyền và thử lại.',
};

/**
 * Hệ thống câu thoại trợ lý ảo Elder TTS (Text-to-Speech)
 * Tôn chỉ kính cẩn, rõ ràng, dễ nghe cho người cao tuổi.
 */
export const ELDER_VOICE_SCRIPTS = {
  // Lời chào và hướng dẫn ban đầu
  WELCOME_CLAIM: 'Dạ, kính chào Bác. Mời Bác tìm tên mình trong sổ họ hoặc chọn khai báo hồ sơ thành viên mới.',
  
  // Hướng dẫn khi bị yêu cầu sửa đổi (NEEDS_REVISION)
  ALERT_NEEDS_REVISION: (clanName) => 
    `Dạ thưa Bác, Ban quản trị ${clanName || 'dòng họ'} có gửi lời nhắn yêu cầu làm rõ thêm thông tin hồ sơ. Bác vui lòng nhấn nút chỉnh sửa để bổ sung.`,
  
  // Khi nộp hồ sơ thành công
  SUBMIT_SUCCESS_SPEECH: 'Dạ, cháu đã gửi hồ sơ của Bác tới Ban quản trị dòng họ an toàn. Cháu sẽ kính báo ngay khi có kết quả duyệt.',
  
  // Khi hồ sơ bị từ chối lần cuối
  HARD_LOCK_SPEECH: 'Dạ thưa Bác, hồ sơ này đã có kết luận từ chối lần cuối từ Hội đồng gia tộc và đã được đóng lại.',
  
  // Cảnh báo khi nhập thiếu thông tin bắt buộc
  VALIDATION_ERROR_SPEECH: (fieldName) => `Dạ thưa Bác, trường thông tin ${fieldName} là bắt buộc, Bác vui lòng điền giúp cháu.`,
};