import React from 'react';

export interface TableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  width?: string;
  render: (row: T, index: number) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  compact?: boolean;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  compact = false,
}: DataTableProps<T>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[#E9E9E9]">
            {columns.map((col) => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={`text-[15px] font-semibold leading-[1.35] text-[#292929] ${
                  compact ? 'py-3 px-3' : 'py-3.5 px-4'
                } ${
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                      ? 'text-center'
                      : 'text-left'
                }`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E9E9E9]">
          {data.map((row, index) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`transition-colors ${
                onRowClick ? 'cursor-pointer hover:bg-[#F9F9F9]' : ''
              }`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={`text-[16px] font-normal leading-[1.45] text-[#292929] ${
                    compact ? 'py-3 px-3' : 'py-3.5 px-4'
                  } ${
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                  }`}
                >
                  {col.render(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

