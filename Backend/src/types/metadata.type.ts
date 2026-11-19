// Hợp đồng dữ liệu JSONB cho cột onboarding_cases.metadata [ARCH-06]
export interface OnboardingCaseMetadata {
  staging_cleanup?: {
    cleanup_status: 'PENDING' | 'CLEANED' | 'FAILED';
    prefix: string;
  };
  offline_verifications?: Array<{
    id: string;
    endorser_name: string;
    call_status: 'VERIFIED' | 'UNREACHABLE';
    notes?: string;
  }>;
  referral_history?: Array<{
    referrer_id: string;
    status: 'DECLINED';
    decided_at: string;
  }>;
}
