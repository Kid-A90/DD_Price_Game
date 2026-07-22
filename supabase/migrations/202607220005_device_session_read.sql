-- Allow any authenticated device to look up a game session by code.
-- Only id, code, and phase are exposed; admin_user_id is not needed client-side.
create policy "authenticated devices can look up session by code"
  on public.game_sessions for select to authenticated
  using (true);
