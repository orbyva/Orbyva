"use client";

import * as React from "react";
import {
  ColumnDef,
  SortingState,
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
} from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";


import { Transaction } from "@/types/finance";

const columns: ColumnDef<Transaction>[] = [
  {
    accessorKey: "class",
    header: "Classe",
    cell: ({ row }) => <div className="text-sm sm:text-xs">{row.original.class.name}</div>,
  },
  {
    accessorKey: "description",
    header: "Descrição",
    cell: ({ row }) => <div className="text-sm sm:text-xs">{row.getValue("description")}</div>,
  },
  {
    accessorKey: "value",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Valor
        <ArrowUpDown />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="text-right font-medium text-sm sm:text-xs">
        R$ {(row.getValue("value") as number).toFixed(2)}
      </div>
    ),
  },
  {
    accessorKey: "transaction_at",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Data
        <ArrowUpDown />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="text-right text-sm sm:text-xs">
        {(row.getValue("transaction_at") as string).split('-').reverse().join('/')}
      </div>
    ),
  },
];

export function TransactionsTable({ transactions }: { transactions: Transaction[] }) {
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const table = useReactTable({
    data: transactions,
    columns,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
  });

  return (
    <div className="overflow-x-auto overflow-y-auto h-auto max-h-none md:max-h-[400px] md:h-[400px]">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-auto md:h-24 text-center">
                Nenhuma transação encontrada.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
