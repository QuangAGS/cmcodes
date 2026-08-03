# shared/errors — CED Kernel v1.1.0
## Ghi chú
- **AppError.js** Core class + BusinessError alias
- **createError.js** Factory
- **toResponse.js** External wire (canonical + dual)
- **toLogPayload.js** nternal log (stack + cause + redact)
- **asyncHandler.js** Express async boundary
- **httpMap.js** code → HTTP status
- **aliases.js** Dual-contract legacy table
- **codes/** Domain-scoped error codes
- **index.js** Public barrel + createGlobalErrorHandler + sendError

**Centralized Error Doctrine** implementation for Gia Phả Số 2026 / myclan.com.vn.

## Invariants (locked)

- **E5** CorrelationId bắt buộc tại Global Handler (tự sinh UUID nếu thiếu).
- **E7** Dual-contract (`legacy: true` mặc định) — giữ tương thích FE.
- **E9** Dual output: `toResponse` (client) ≠ `toLogPayload` (ops).
- **VIII.2** Mọi async route phải bọc `asyncHandler`.
- `codes/*.js` = pure constants, zero business import.

## Quick usage

```js
const {
  createError,
  createBusinessError,
  asyncHandler,
  sendError,
  createGlobalErrorHandler,
  ERROR_CODES,
} = require('../shared/errors');

// Service
throw createError(ERROR_CODES.AUTH.ACCOUNT_CHO_DUYET, 'Tài khoản đang chờ duyệt');

// Onboarding service (Q1)
throw createBusinessError(ERROR_CODES.ONBOARDING.CASE_NOT_EDITABLE, 'Hồ sơ không được chỉnh sửa');

// Route
router.post('/cases', verifyToken, asyncHandler(ctrl.createCase));

// Controller
catch (err) {
  return sendError(res, err);
}

// app.js
app.use(createGlobalErrorHandler({ legacy: true }));