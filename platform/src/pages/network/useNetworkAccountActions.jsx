import { useCallback, useState } from "react";
import { hasPermission, PERMISSIONS } from "../../auth/permissions";
import { ConfirmDialog } from "../../components/ui/Modal";
import { useAuth } from "../../context/AuthContext";
import { useMutation } from "../../hooks/useMutation";
import { canTriggerSyncFor, disconnectPath, triggerSyncPath } from "./networkAccountContract";

/**
 * The two write actions the backend supports for a connected account:
 *   Trigger sync  POST   /sync/:platform/:accountLabel               sync:trigger
 *   Disconnect    DELETE /marketplace/accounts/:platform/:accountLabel integrations:manage
 * Both require an explicit confirmation. Errors surface through useMutation's toast and are
 * never swallowed. Connect is intentionally not implemented here (see report).
 */
export function useNetworkAccountActions({ onChanged } = {}) {
  const { user } = useAuth();
  const canSync = hasPermission(user, PERMISSIONS.SYNC_TRIGGER);
  const canManage = hasPermission(user, PERMISSIONS.INTEGRATIONS_MANAGE);
  const [pending, setPending] = useState(null); // { kind: "sync" | "disconnect", network, account }
  const [lastSyncMessage, setLastSyncMessage] = useState(null);

  const syncMutation = useMutation("POST");
  const disconnectMutation = useMutation("DELETE", { successMessage: "Account disconnected" });

  const syncAllowed = useCallback(
    (network, account) => canSync && Boolean(account) && canTriggerSyncFor(network, account.platform),
    [canSync],
  );
  const disconnectAllowed = useCallback((account) => canManage && Boolean(account?.platform && account?.accountLabel), [canManage]);

  const requestSync = useCallback((network, account) => setPending({ kind: "sync", network, account }), []);
  const requestDisconnect = useCallback((network, account) => setPending({ kind: "disconnect", network, account }), []);
  const close = useCallback(() => setPending(null), []);

  async function confirm() {
    if (!pending) return;
    const { kind, account } = pending;
    try {
      if (kind === "sync") {
        const result = await syncMutation.mutate(triggerSyncPath(account.platform, account.accountLabel), {});
        setLastSyncMessage({
          platform: account.platform,
          accountLabel: account.accountLabel,
          status: result?.status ?? null,
          message: result?.message ?? null,
          at: new Date().toISOString(),
        });
      } else if (kind === "disconnect") {
        await disconnectMutation.mutate(disconnectPath(account.platform, account.accountLabel));
      }
      setPending(null);
      onChanged?.(kind);
    } catch {
      // useMutation already reported the error via toast; keep the dialog open for retry/cancel.
    }
  }

  const dialogs = (
    <>
      <ConfirmDialog
        open={pending?.kind === "sync"}
        title="Trigger sync"
        message={
          pending?.kind === "sync"
            ? `Start a background sync for ${pending.network?.name || pending.network?.key} account "${pending.account.accountLabel}" (${pending.account.platform})? The backend runs it asynchronously and reports progress through the live sync status.`
            : ""
        }
        confirmLabel="Start sync"
        loading={syncMutation.loading}
        onConfirm={confirm}
        onClose={close}
      />
      <ConfirmDialog
        open={pending?.kind === "disconnect"}
        title="Disconnect account"
        danger
        message={
          pending?.kind === "disconnect"
            ? `Disconnect ${pending.network?.name || pending.network?.key} account "${pending.account.accountLabel}" (${pending.account.platform})? This deletes the stored credential record for this account. Synced data is kept, but no further syncs can run for it until it is connected again.`
            : ""
        }
        confirmLabel="Disconnect"
        loading={disconnectMutation.loading}
        onConfirm={confirm}
        onClose={close}
      />
    </>
  );

  return {
    canSync,
    canManage,
    syncAllowed,
    disconnectAllowed,
    requestSync,
    requestDisconnect,
    lastSyncMessage,
    dialogs,
  };
}
