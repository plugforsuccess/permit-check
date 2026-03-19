export interface Permit {
  id?: string;
  lookup_id: string;
  record_number: string;
  type: string;
  status: PermitStatus;
  filed_date: string | null;
  issued_date: string | null;
  description: string;
  contractor: string | null;
}

export type PermitStatus =
  | "Issued"
  | "Expired"
  | "In Review"
  | "Finaled"
  | "Void"
  | "Pending"
  | "Unknown";

export interface Lookup {
  id: string;
  address_raw: string;
  address_normalized: string;
  created_at: string;
  user_id: string | null;
  payment_id: string | null;
  payment_status: "pending" | "paid" | "failed";
  permit_count: number | null;
  report_id: string | null;
}

export interface Report {
  id: string;
  lookup_id: string;
  pdf_url: string;
  expires_at: string;
  downloaded_at: string | null;
}

export interface User {
  id: string;
  email: string;
  plan_type: "free" | "buyer" | "agent" | "investor";
  stripe_customer_id: string | null;
  created_at: string;
}

export interface LookupInitiateRequest {
  address: string;
  report_type?: "standard" | "attorney";
}

export interface LookupInitiateResponse {
  lookup_id: string;
  address_normalized: string;
  permit_count: number;
  payment_url: string;
  client_secret: string;
}

export interface PermitSearchResult {
  permits: Permit[];
  total_count: number;
  source: "accela_api" | "accela_scraper" | "cache";
}
