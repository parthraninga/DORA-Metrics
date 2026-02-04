export interface Team {
  id: string;
  org_id: string;
  name: string;
  member_ids: string[];
  manager_id?: string;
  integration_id?: string;
  created_at: Date;
  updated_at: Date;
  is_deleted: boolean;
  member_filter_enabled?: boolean;
  /** Last time data was fetched for this team (Supabase teams); from max of repos' last_fetched_at */
  last_fetched_at?: string | null;
}

export type BaseTeam = {
  id: string;
  name: string;
  member_ids: string[];
  org_id?: string;
};
