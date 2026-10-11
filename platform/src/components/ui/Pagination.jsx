import { Icon } from "./Icon";

/**
 * `pageSize` must be the size the request actually used (or the one the response reported).
 * It has no default: a hardcoded fallback previously rendered "20 per page" on every table
 * regardless of the real request, so when the size is unknown the clause is omitted instead.
 */
export function Pagination({ page, totalPages, total, onPageChange, pageSize = null }) {
  const safeTotalPages = Math.max(totalPages || 1, 1);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <Icon name="chevronLeft" size={16} />
          Previous
        </button>
        <span className="text-sm text-slate-600">
          Page {page} of {safeTotalPages}
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          disabled={page >= safeTotalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <Icon name="chevronRight" size={16} />
        </button>
      </div>
      {total != null && (
        <span className="text-sm text-slate-500">
          {Number(total).toLocaleString()} records
          {pageSize ? ` · ${pageSize} per page` : ""}
        </span>
      )}
    </div>
  );
}
