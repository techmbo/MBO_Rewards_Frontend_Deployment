import { useEffect, useMemo, useState } from "react";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";
import { Pagination } from "./Pagination";
import { SearchInput } from "./FormControls";
import { Icon } from "./Icon";
import { optionalStringOrNumber } from "../../utils/propValidators";

function columnStyle(col) {
  const style = {};
  if (col.width) style.width = typeof col.width === "number" ? `${col.width}px` : col.width;
  if (col.minWidth) style.minWidth = typeof col.minWidth === "number" ? `${col.minWidth}px` : col.minWidth;
  if (col.maxWidth) style.maxWidth = typeof col.maxWidth === "number" ? `${col.maxWidth}px` : col.maxWidth;
  return Object.keys(style).length ? style : undefined;
}

function defaultVisibleKeys(columns) {
  return columns.filter((col) => !col.defaultHidden).map((col) => col.key);
}

export function DataTable({
  columns,
  rows = [],
  loading,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  page,
  totalPages,
  total,
  pageSize = null,
  onPageChange,
  searchable,
  searchPlaceholder,
  onSearch,
  toolbar,
  onRefresh,
  exportable,
  onExport,
  onRowClick,
  rowClassName,
  dense = false,
  fixedLayout = false,
  minWidth,
  showColumnPicker = true,
  alignTop = false,
}) {
  const [search, setSearch] = useState("");
  const columnKey = columns.map((c) => `${c.key}:${c.defaultHidden ? 0 : 1}`).join("|");
  const [visibleKeys, setVisibleKeys] = useState(() => defaultVisibleKeys(columns));

  useEffect(() => {
    setVisibleKeys(defaultVisibleKeys(columns));
  }, [columnKey]);

  const visibleColumns = useMemo(
    () => columns.filter((col) => visibleKeys.includes(col.key)),
    [columns, visibleKeys],
  );

  const computedMinWidth = useMemo(() => {
    if (minWidth) return minWidth;
    const sum = visibleColumns.reduce((acc, col) => acc + (Number(col.minWidth) || 120), 0);
    return `${Math.max(sum, 720)}px`;
  }, [minWidth, visibleColumns]);

  const handleSearch = (value) => {
    setSearch(value);
    onSearch?.(value);
  };

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const pad = dense ? "px-3 py-2" : "px-3.5 py-2.5";

  const toolbarRow = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {searchable && (
          <SearchInput
            className="min-w-[220px] max-w-sm"
            value={search}
            onChange={handleSearch}
            placeholder={searchPlaceholder || "Search..."}
          />
        )}
        {toolbar}
      </div>
      <div className="flex flex-wrap gap-2">
        {showColumnPicker && (
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
              Manage Columns
            </summary>
            <div className="absolute right-0 z-10 mt-2 max-h-72 w-52 overflow-auto rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
              {columns.map((col) => (
                <label key={col.key} className="mb-2 flex items-center gap-2 text-sm last:mb-0">
                  <input
                    type="checkbox"
                    checked={visibleKeys.includes(col.key)}
                    onChange={(e) => {
                      setVisibleKeys((current) =>
                        e.target.checked ? [...current, col.key] : current.filter((k) => k !== col.key),
                      );
                    }}
                  />
                  <span className="truncate">{col.label || col.key}</span>
                </label>
              ))}
            </div>
          </details>
        )}
        {onRefresh && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            loading={refreshing}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5"
          >
            {!refreshing ? <Icon name="sync" size={16} /> : null}
            Refresh
          </Button>
        )}
        {exportable && onExport && (
          <Button variant="secondary" size="sm" onClick={onExport}>
            Export
          </Button>
        )}
      </div>
    </div>
  );

  if (loading && !rows.length) {
    return (
      <div className="space-y-4">
        {toolbarRow}
        <LoadingState table rows={6} cols={visibleColumns.length || 4} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        {toolbarRow}
        <ErrorState message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="space-y-4">
        {toolbarRow}
        <div className="table-scroll overflow-auto rounded-lg border border-slate-200">
          <table
            className={`w-full text-sm ${fixedLayout ? "table-fixed" : "table-auto"}`}
            style={{ minWidth: computedMinWidth }}
          >
            <thead className="sticky top-0 z-[1]">
              <tr className="border-b border-slate-200 bg-slate-50/95 backdrop-blur">
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    style={columnStyle(col)}
                    title={col.title || col.label}
                    className={`${pad} text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 ${
                      col.key === "actions" ? "text-right" : ""
                    } ${col.headerClassName || ""}`}
                  >
                    {col.renderHeader ? (
                      col.renderHeader()
                    ) : (
                      <span className="whitespace-nowrap">{col.label}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
          </table>
          <div className="border-t border-slate-100 p-6">
            <EmptyState title={emptyTitle || "No records"} description={emptyDescription} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toolbarRow}

      <div className={`relative ${loading ? "pointer-events-none" : ""}`}>
        {loading ? (
          <div className="absolute inset-0 z-[2] flex items-start justify-center bg-white/60 pt-16 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 shadow-sm">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
              Updating…
            </div>
          </div>
        ) : null}

      <div className="table-scroll overflow-auto">
        <table
          className={`w-full text-sm ${fixedLayout ? "table-fixed" : "table-auto"}`}
          style={{ minWidth: computedMinWidth }}
        >
          <thead className="sticky top-0 z-[1]">
            <tr className="border-b border-slate-200 bg-slate-50/95 backdrop-blur">
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  style={columnStyle(col)}
                  title={col.title || col.label}
                  className={`${pad} text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 ${
                    col.key === "actions" ? "text-right" : ""
                  } ${col.headerClassName || ""}`}
                >
                  {col.renderHeader ? (
                    col.renderHeader()
                  ) : (
                    <span className="whitespace-nowrap">{col.label}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const extraClass = typeof rowClassName === "function" ? rowClassName(row) : rowClassName || "";
              return (
                <tr
                  key={row.id || idx}
                  className={`border-b border-slate-100 last:border-0 transition-colors hover:bg-brand-50/40 ${
                    onRowClick ? "cursor-pointer" : ""
                  } ${extraClass}`}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {visibleColumns.map((col) => (
                    <td
                      key={col.key}
                      style={columnStyle(col)}
                      className={`${pad} overflow-hidden ${
                        alignTop ? "align-top" : "align-middle"
                      } text-slate-700 ${
                        col.key === "actions" || col.key === "action" ? "text-right" : ""
                      } ${col.className || ""}`}
                    >
                      {col.render ? (
                        col.render(row)
                      ) : (
                        <span className="block truncate" title={String(row[col.key] ?? "")}>
                          {row[col.key] ?? "—"}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>

      {page != null && onPageChange && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}

// Only the prop introduced here is declared: this file's remaining props are untouched by
// this change, and validating them would be a separate refactor.
DataTable.propTypes = { pageSize: optionalStringOrNumber };
