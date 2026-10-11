import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/Button";
import { Drawer } from "../../../components/ui/Drawer";
import { optionalFunc, optionalObject } from "../../../utils/propValidators";
import { FieldGrid, NoticeBar, Section } from "../networkAccountUi";
import {
  DESTINATION_REFERENCE_HELP,
  PARTNERIZE_GENERATION_STEPS,
  describeProvenance,
  describeState,
  preValidateTrackingUrl,
} from "./supplierTrackingLinkContract";

/**
 * Paste a supplier-generated tracking link against one SupplierCampaign.
 *
 * The campaign identity is read-only: the operator cannot retarget the save at another campaign.
 * The destination URL is shown for reference under its own label and is NEVER used to prefill the
 * paste field — doing so is precisely the mistake this whole model exists to prevent.
 */
export function SupplierTrackingLinkDrawer({ row, onClose, onSave }) {
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Deliberately resets to empty on every open — never to row.destinationUrl.
  useEffect(() => {
    setValue("");
    setReason("");
    setError(null);
    setSaving(false);
  }, [row?.id]);

  if (!row) return null;

  const submit = async () => {
    const localError = preValidateTrackingUrl(value, { destinationUrl: row.destinationUrl });
    if (localError) {
      setError(localError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ id: row.id, supplierTrackingUrl: value.trim(), reason: reason.trim() || undefined });
    } catch (err) {
      setError(err?.safeMessage || "The tracking link could not be saved.");
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  return (
    <Drawer
      open
      title="Add supplier tracking link"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !value.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Section title="Campaign" subtitle="Read-only. The link is stored against this campaign.">
          <FieldGrid
            columns={2}
            fields={[
              { label: "Campaign", value: row.campaignName || "—" },
              { label: "Brand", value: row.brandName || "—" },
              { label: "Supplier campaign ID", value: row.supplierCampaignId || "—" },
              { label: "Network", value: row.supplier || "—" },
              { label: "Campaign status", value: row.campaignStatus || "—" },
              { label: "Relationship", value: row.participationStatus || (row.isJoined ? "JOINED" : "—") },
              { label: "Tracking link state", value: describeState(row.state) },
              { label: "Provenance", value: describeProvenance(row.provenance) },
            ]}
          />
        </Section>

        <Section title="How to generate the link">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
            {PARTNERIZE_GENERATION_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Section>

        <Section title="Destination URL (reference only)">
          <p className="mb-2 text-xs text-slate-500">{DESTINATION_REFERENCE_HELP}</p>
          <p className="break-all rounded bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {row.destinationUrl || "Not available"}
          </p>
        </Section>

        <Section title="Supplier tracking link">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Paste the generated tracking link</span>
            <input
              type="url"
              inputMode="url"
              autoComplete="off"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="https://…"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                if (error) setError(null);
              }}
            />
          </label>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Reason (optional)</span>
            <input
              type="text"
              maxLength={500}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="Generated in the Partnerize portal"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          {error && (
            <div className="mt-3">
              <NoticeBar tone="danger">{error}</NoticeBar>
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Saving marks this campaign <strong>Tracking link available</strong> with provenance{" "}
            <strong>Manual (admin)</strong>. Supplier campaign syncs will not overwrite or clear it.
          </p>
        </Section>
      </div>
    </Drawer>
  );
}

SupplierTrackingLinkDrawer.propTypes = {
  row: optionalObject,
  onClose: optionalFunc,
  onSave: optionalFunc,
};
