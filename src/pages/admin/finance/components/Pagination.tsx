import { JSX } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSidebar } from '@/components/ui/sidebar';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginationProps {
  /** The current page number */
  page: number;
  /** The current number of items per page */
  pageSize: number;
  /** The total number of pages (optional) */
  totalPages?: number | null;
  /** Callback to update the current page number */
  onSetPage: (page: number) => void;
  /** Callback to update the page size */
  onSetPageSize: (pageSize: number) => void;

  pageSizes?: number[];
}

/**
 * Pagination Component
 *
 * @param {PaginationProps} props - Component props.
 * @returns A pagination control UI.
 */
export default function Pagination({
  page,
  pageSize,
  onSetPage,
  onSetPageSize,
  totalPages = null,
  pageSizes = [5, 10, 20, 50]
}: PaginationProps): JSX.Element {
  const { isMobile } = useSidebar();

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center pt-3">
      <div className="flex items-center gap-2 w-full sm:w-auto">
        <Label className="shrink-0">Por página</Label>
        <Select value={String(pageSize)} onValueChange={(value) => onSetPageSize(Number(value))}>
          <SelectTrigger className="w-24 sm:w-full sm:max-w-[120px]">
            <SelectValue placeholder="Selecionar" />
          </SelectTrigger>
          <SelectContent>
            {pageSizes.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center space-x-2">
        {isMobile ? (
          <>
            <Button disabled={page === 1} onClick={() => onSetPage(Math.max(page - 1, 1))}>
              <ChevronLeft size={16} />
            </Button>
            <span>{page}</span>
            <Button disabled={totalPages != null && page >= totalPages} onClick={() => onSetPage(page + 1)}>
              <ChevronRight size={16} />
            </Button>
          </>
        ) : (
          <>
            <Button disabled={page === 1} onClick={() => onSetPage(Math.max(page - 1, 1))}>
              Anterior
            </Button>
            <span>Página {page}</span>
            <Button disabled={totalPages != null && page >= totalPages} onClick={() => onSetPage(page + 1)}>
              Próxima
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
