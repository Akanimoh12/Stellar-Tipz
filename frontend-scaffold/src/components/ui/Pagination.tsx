import React from 'react';
import Button from './Button';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const MAX_VISIBLE_PAGES = 5;

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
}) => {
  if (totalPages <= 1) {
    return null;
  }

  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const halfWindow = Math.floor(MAX_VISIBLE_PAGES / 2);

  let startPage = Math.max(1, safeCurrentPage - halfWindow);
  const endPage = Math.min(totalPages, startPage + MAX_VISIBLE_PAGES - 1);

  startPage = Math.max(1, endPage - MAX_VISIBLE_PAGES + 1);

  const visiblePages = Array.from(
    { length: endPage - startPage + 1 },
    (_, index) => startPage + index
  );

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages || page === safeCurrentPage) {
      return;
    }

    onPageChange(page);
  };

  const isFirstPage = safeCurrentPage === 1;
  const isLastPage = safeCurrentPage === totalPages;
  const disabledClassName =
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-x-0 disabled:hover:translate-y-0';

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-center gap-2"
    >
      <Button
        variant="outline"
        size="sm"
        onClick={() => handlePageChange(1)}
        disabled={isFirstPage}
        className={disabledClassName}
        aria-label="Go to first page"
      >
        First
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() => handlePageChange(safeCurrentPage - 1)}
        disabled={isFirstPage}
        className={disabledClassName}
        aria-label="Go to previous page"
      >
        Prev
      </Button>

      {visiblePages.map((page) => (
        <Button
          key={page}
          variant={page === safeCurrentPage ? 'primary' : 'outline'}
          size="sm"
          onClick={() => handlePageChange(page)}
          aria-current={page === safeCurrentPage ? 'page' : undefined}
          aria-label={`Go to page ${page}`}
        >
          {page}
        </Button>
      ))}

      <Button
        variant="outline"
        size="sm"
        onClick={() => handlePageChange(safeCurrentPage + 1)}
        disabled={isLastPage}
        className={disabledClassName}
        aria-label="Go to next page"
      >
        Next
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() => handlePageChange(totalPages)}
        disabled={isLastPage}
        className={disabledClassName}
        aria-label="Go to last page"
      >
        Last
      </Button>
    </nav>
  );
};

export default Pagination;
