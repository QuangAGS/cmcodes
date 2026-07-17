/**
 * PATH       : backend/src/utils/slugUtils.js
 * DATETIME   : 23-04-2026 16:00
 * VERSION    : v5.1.0 (Identity Infrastructure Sync)
 * DESCRIPTION: 
 * - ĐỒNG BỘ: Cung cấp hàm định dạng Numeric Slug chuẩn YYYYNNNNNN.
 * - TÁI SỬ DỤNG: Các hàm cleanInput phục vụ kiểm tra định danh trên toàn hệ thống.
 * - Q1: Tuyệt đối bảo tồn các khối mã cũ trong chú thích để theo dõi lịch sử logic.
 * - Q2: Metadata đầy đủ, chú thích rõ ràng cho các hàm bổ trợ.
 */

/**
 * [HÀM]: formatNumericSlug
 * @description Chuyển đổi năm và số thứ tự thành chuỗi định danh chuẩn 10 ký tự.
 * @param {number|string} year - Năm khởi tạo (4 chữ số).
 * @param {number|string} sequence - Số thứ tự từ bộ đếm (tối đa 6 chữ số).
 * @returns {string} Chuỗi định danh dạng YYYYNNNNNN.
 */
const formatNumericSlug = (year, sequence) => {
  const yearStr = year.toString();
  const seqStr = sequence.toString().padStart(6, '0');
  return `${yearStr}${seqStr}`;
};

/**
 * [HÀM]: cleanInput
 * @description Làm sạch dữ liệu đầu vào theo loại hình.
 * Tái sử dụng cho: Kiểm tra email, phone và slug tại AuthContext & AuthService.
 */
const cleanInput = (val, type = 'default') => {
  if (!val) return "";
  const v = val.trim();
  
  if (type === 'phone') return v.replace(/\D/g, ''); 
  if (type === 'email') return v.toLowerCase();
  if (type === 'slug') return v.replace(/[^0-9]/g, '').substring(0, 10);
  
  return v.toLowerCase().replace(/\s+/g, '');
};

module.exports = { 
  cleanInput,
  formatNumericSlug
};

/* ==========================================================================
   KHÔNG XOÁ PHẦN DƯỚI ĐÂY ĐỂ THEO DÕI (LOGIC CŨ TRƯỚC V5.0.0)
   ========================================================================== */

/**
 * KHÔNG XOÁ PHẦN DƯỚI ĐÂY ĐỂ THEO DÕI
 * Tạo Acronym từ tên dòng họ (Nếu người dùng không tự nhập slug)
 * * const generateBaseAcronym = (name) => {
 * if (!name) return "GP"; 
 * const ignoreWords = ["ho", "dong", "toc", "gia", "pha", "giapha", "hotoc", "dongho"];
 * let str = name.replace(/[đĐ]/g, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
 * const acronym = str
 * .toLowerCase()
 * .split(/\s+/)
 * .filter(word => {
 * const cleanWord = word.trim().replace(/[^a-z0-9]/g, '');
 * return cleanWord.length > 0 && !ignoreWords.includes(cleanWord);
 * })
 * .map(word => word[0])
 * .join("")
 * .toUpperCase();
 * const finalBase = acronym.replace(/[^A-Z0-9]/g, '').substring(0, 10);
 * return finalBase.length >= 2 ? finalBase : (finalBase + "GP").substring(0, 10);
 * };
 */

/**
 * KHÔNG XOÁ PHẦN DƯỚI ĐÂY ĐỂ THEO DÕI
 * Tìm Slug duy nhất và gợi ý (Logic cũ dựa trên chuỗi)
 * * const generateUniqueSlug = async (input, prisma) => {
 * let base = input.includes(" ") ? generateBaseAcronym(input) : cleanInput(input, 'slug');
 * if (base.length < 2) base = (base + "GP").substring(0, 10);
 * let finalSlug = base;
 * let counter = 1;
 * while (true) {
 * const existing = await prisma.tenants.findUnique({ where: { slug: finalSlug } });
 * if (!existing) break;
 * let suffix = counter.toString(); 
 * let baseLimit = 10 - suffix.length;
 * finalSlug = base.substring(0, baseLimit) + suffix;
 * counter++;
 * if (counter > 999) { 
 * finalSlug = crypto.randomBytes(4).toString('hex').toUpperCase();
 * break;
 * }
 * }
 * return finalSlug;
 * };
 

module.exports = { 
  cleanInput,
  formatNumericSlug, // Export hàm format mới
  // Lưu ý: generateBaseAcronym và generateUniqueSlug cũ không còn export trực tiếp để tránh xung đột logic mới
};
*/