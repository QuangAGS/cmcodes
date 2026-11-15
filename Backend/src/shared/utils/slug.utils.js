/**
 * PATH       : src/shared/utils/slug.utils.js
 * DATETIME   : 2026-11-14T14:48:00+07:00
 * VERSION    : v5.2.0-INTL-PHONE-LIBPHONENUMBER
 * DESCRIPTION: 
 * - ĐỒNG BỘ: Cung cấp hàm định dạng Numeric Slug chuẩn YYYYNNNNNN.
 * - TÁI SỬ DỤNG: Các hàm cleanInput, normalizeCanonicalPhone, isValidPhoneNumber phục vụ
 *   kiểm tra định danh quốc tế (libphonenumber-js/min, chuẩn E.164) trên toàn hệ thống.
 * - Q1: Tuyệt đối bảo tồn các khối mã cũ trong chú thích để theo dõi lịch sử logic;
 *   số điện thoại Việt Nam (VN / +84) được chuẩn hóa về dạng 10 số 0xxxxxxxxx để tương thích
 *   ngược 100% với dữ liệu hiện hữu trong bảng users.
 * - Q2: Metadata đầy đủ, chú thích rõ ràng cho các hàm bổ trợ.
 */

const { parsePhoneNumberFromString } = require('libphonenumber-js/min');

/**
 * [HÀM]: formatNumericSlug
 * @description Chuyển đổi năm và số thứ tự thành chuỗi định dạng chuẩn 10 ký tự.
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
 * [HÀM]: normalizeCanonicalPhone
 * @description Chuẩn hóa số điện thoại theo chuẩn quốc tế libphonenumber-js (ITU-T E.164).
 * - Nếu thuộc Việt Nam (country === 'VN'): trả về dạng nội địa 10 số `0xxxxxxxxx`
 *   để tương thích ngược hoàn toàn với dữ liệu tài khoản cũ trong DB.
 * - Nếu thuộc quốc gia khác: trả về chuẩn E.164 `+<countryCallingCode><nationalNumber>`
 *   (VD: +14085551234, +61412345678, +33612345678).
 * @param {string} val - Chuỗi số điện thoại đầu vào.
 * @param {string} [defaultCountry='VN'] - Mã quốc gia ISO 3166-1 alpha-2 (VD: 'VN', 'US', 'AU', 'INTL').
 * @returns {string} Chuỗi số điện thoại chuẩn hóa hoặc '' nếu không hợp lệ.
 */
const normalizeCanonicalPhone = (val, defaultCountry = 'VN') => {
  if (!val) return '';
  const raw = String(val).trim();
  if (!raw) return '';

  let compact = raw.replace(/[\s().-]+/g, '');
  if (compact.startsWith('00') && compact.length > 4) {
    compact = `+${compact.slice(2)}`;
  }

  const region =
    defaultCountry && String(defaultCountry).toUpperCase() !== 'INTL'
      ? String(defaultCountry).toUpperCase()
      : undefined;

  let parsed = parsePhoneNumberFromString(compact, region);

  if ((!parsed || !parsed.isValid()) && !compact.startsWith('+')) {
    const digitsOnly = compact.replace(/\D/g, '');
    if (
      (region === 'VN' || !region) &&
      /^84(3|5|7|8|9)[0-9]{8}$/.test(digitsOnly)
    ) {
      parsed = parsePhoneNumberFromString(`+${digitsOnly}`);
    } else if (!region && digitsOnly.length >= 8 && digitsOnly.length <= 15) {
      parsed = parsePhoneNumberFromString(`+${digitsOnly}`);
    }
  }

  if (parsed && parsed.isValid()) {
    if (parsed.country === 'VN') {
      return `0${parsed.nationalNumber}`;
    }
    return parsed.number;
  }

  return '';
};

/**
 * [HÀM]: isValidPhoneNumber
 * @description Kiểm tra số điện thoại hợp lệ theo quốc gia được chọn (mặc định VN) hoặc chuẩn E.164 quốc tế.
 */
const isValidPhoneNumber = (val, defaultCountry = 'VN') => {
  return Boolean(normalizeCanonicalPhone(val, defaultCountry));
};

/**
 * [HÀM]: cleanInput
 * @description Làm sạch dữ liệu đầu vào theo loại hình.
 * Tái sử dụng cho: Kiểm tra email, phone và slug tại AuthContext & AuthService.
 */
const cleanInput = (val, type = 'default', country = 'VN') => {
  if (!val) return "";
  const v = String(val).trim();
  
  if (type === 'phone') {
    const canonical = normalizeCanonicalPhone(v, country);
    if (canonical) return canonical;
    return v.startsWith('+')
      ? `+${v.slice(1).replace(/\D/g, '')}`
      : v.replace(/\D/g, '');
  }
  if (type === 'email') return v.toLowerCase();
  if (type === 'slug') return v.replace(/[^0-9]/g, '').substring(0, 10);
  
  return v.toLowerCase().replace(/\s+/g, '');
};

module.exports = { 
  cleanInput,
  formatNumericSlug,
  normalizeCanonicalPhone,
  isValidPhoneNumber,
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
