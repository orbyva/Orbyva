-- Tabelas do agente FinTrack (executar no SQL Editor do Supabase)

CREATE TABLE IF NOT EXISTS agent_pending_action (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('create_transaction', 'create_recurring')),
  payload JSONB NOT NULL,
  summary TEXT NOT NULL,
  fields JSONB NOT NULL DEFAULT '[]',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_pending_user ON agent_pending_action(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_pending_expires ON agent_pending_action(expires_at);

CREATE TABLE IF NOT EXISTS agent_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  tool_name TEXT,
  input JSONB,
  output JSONB,
  success BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_audit_user ON agent_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_audit_created ON agent_audit_log(created_at DESC);

ALTER TABLE agent_pending_action ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_pending_select ON agent_pending_action
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY agent_pending_insert ON agent_pending_action
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY agent_pending_delete ON agent_pending_action
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY agent_audit_select ON agent_audit_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY agent_audit_insert ON agent_audit_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);
