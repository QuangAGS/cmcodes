/**
 * PATH       : lib/canonicalRedirectInterceptor.js
 * DATETIME   : 2026-11-26T08:20:00+07:00
 * VERSION    : 1.0.0-FE03
 * DESCRIPTION:
 * - Interceptor gắn _canonicalRedirect vào response.data khi có header X-Canonical-Member-Id.
 * - Chỉ gắn khi response.data là object (không phải array).
 * - Dùng trong apiClient.
 * QX: Tuân thủ chặt chẽ Q1–Q4. Không phỏng đoán.
 */

export function attachCanonicalRedirectInterceptor(apiClient) {
  apiClient.interceptors.response.use((response) => {
    const canonicalId =
      response.headers?.['x-canonical-member-id'] ||
      response.headers?.['X-Canonical-Member-Id'];
    if (
      canonicalId &&
      response.data &&
      typeof response.data === 'object' &&
      !Array.isArray(response.data)
    ) {
      response.data._canonicalRedirect = {
        to: canonicalId,
        depth: response.headers?.['x-merge-redirect-depth'] || null,
      };
    }
    return response;
  });

  return apiClient;
}
