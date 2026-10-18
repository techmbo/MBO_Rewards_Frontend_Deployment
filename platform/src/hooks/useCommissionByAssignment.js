import { useCallback, useEffect, useState } from "react";
import { fetchApi } from "../api";

/**
 * Load commission rules keyed by assignmentId for admin join displays.
 * Prefers EFFECTIVE rules; falls back to DRAFT if none effective.
 */
export function useCommissionByAssignment({ enabled = true } = {}) {
  const [rulesByAssignmentId, setRulesByAssignmentId] = useState({});
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const response = await fetchApi("/commission-rules", { page: 1, pageSize: 200 });
      const rows = response.data ?? response.rows ?? [];
      const map = {};
      const rank = { EFFECTIVE: 3, DRAFT: 2, SUPERSEDED: 1 };
      for (const row of rows) {
        if (!row.assignmentId) continue;
        const existing = map[row.assignmentId];
        if (!existing || (rank[row.status] || 0) > (rank[existing.status] || 0)) {
          map[row.assignmentId] = row;
        }
      }
      setRulesByAssignmentId(map);
    } catch {
      setRulesByAssignmentId({});
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { rulesByAssignmentId, loading, reload };
}
