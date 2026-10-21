import { apiUrl } from "@/lib/api";

/** The Excel export of a table: the same data as a CSV that Excel or Power Query can open. */
export function CsvLink({ path, label = "CSV" }: { path: string; label?: string }) {
  return (
    <a
      href={apiUrl(path)}
      target="_blank"
      rel="noopener noreferrer"
      title="Open this table as CSV (Excel: Data > From Web)"
      className="text-muted underline decoration-hairline underline-offset-2 hover:text-ink hover:decoration-ink"
    >
      {label}
    </a>
  );
}
