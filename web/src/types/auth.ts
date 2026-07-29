export interface AuthUser {
  id: string;
  account: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthInput {
  account: string;
  password: string;
  display_name?: string | null;
}
