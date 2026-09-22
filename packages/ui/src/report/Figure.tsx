import type { ReactElement, ReactNode } from 'react';

export interface FigureProps {
  readonly id: string;
  readonly title: string;
  readonly question: string;
  readonly summary: ReactNode;
  readonly children: ReactNode;
}

/**
 * One labelled operational question with an application-owned SVG mark set and
 * a concise textual alternative that carries the same values.
 */
export function Figure({ id, title, question, summary, children }: FigureProps): ReactElement {
  return (
    <figure
      className="report-figure"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-summary`}
    >
      <figcaption id={`${id}-title`} className="report-figure-caption">
        <strong className="report-figure-title">{title}</strong>{' '}
        <span className="report-figure-question">{question}</span>
      </figcaption>
      <div className="report-figure-chart">{children}</div>
      <div className="report-figure-summary" id={`${id}-summary`}>
        {summary}
      </div>
    </figure>
  );
}

export interface TableRow {
  readonly key: string;
  readonly cells: readonly ReactNode[];
}

export interface DataTableProps {
  readonly caption: string;
  readonly columns: readonly string[];
  readonly rows: readonly TableRow[];
  readonly emptyText?: string;
}

/** A semantic table used as a chart's accessible value alternative. */
export function DataTable({
  caption,
  columns,
  rows,
  emptyText = 'unavailable',
}: DataTableProps): ReactElement {
  return (
    <table className="report-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length}>{emptyText}</td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.key}>
              {row.cells.map((cell, index) => (
                <td key={`${row.key}:${columns[index] ?? index}`}>{cell}</td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
