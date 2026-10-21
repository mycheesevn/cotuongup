"use client";

import { useMemo, useState } from "react";

/**
 * Shared pagination for every data list in the app.
 * Rule: any list that can grow long must be paginated — never render
 * hundreds of rows at once.
 */
export function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const pageItems = useMemo(
    () => items.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [items, safePage, pageSize]
  );
  return { page: safePage, pageCount, pageItems, setPage };
}

export function Pagination({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="cu-pagination" role="navigation" aria-label="pagination">
      <button
        type="button"
        disabled={page === 0}
        onClick={() => onPage(0)}
        aria-label="first page"
      >
        ⏮
      </button>
      <button
        type="button"
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
        aria-label="previous page"
      >
        ◀
      </button>
      <span className="cu-pagination-info">
        {page + 1} / {pageCount}
      </span>
      <button
        type="button"
        disabled={page === pageCount - 1}
        onClick={() => onPage(page + 1)}
        aria-label="next page"
      >
        ▶
      </button>
      <button
        type="button"
        disabled={page === pageCount - 1}
        onClick={() => onPage(pageCount - 1)}
        aria-label="last page"
      >
        ⏭
      </button>
    </div>
  );
}
